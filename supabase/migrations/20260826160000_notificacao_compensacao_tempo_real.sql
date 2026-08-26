-- Step 12a — notificação de compensação registrada, em tempo (quase) real.
-- Spec: docs/superpowers/specs/2026-08-26-notificacao-compensacao-tempo-real-design.md
--
-- Fluxo: INSERT em compensacoes_mensais -> trigger de STATEMENT -> net.http_post
-- para o webhook do n8n -> n8n espera 60s -> busca o grupo completo -> Z-API.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Log: estado da deduplicação, resultado do envio e auditoria.
--
-- Linha com disparado_em preenchido e enviado_em nulo = notificação que se
-- perdeu (n8n fora do ar no momento do disparo). É a única forma de enxergar
-- isso, já que o webhook é fire-and-forget.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacao_compensacao_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  mes_referencia date NOT NULL,
  disparado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  destinatario text,
  mensagem text,
  status text NOT NULL DEFAULT 'pendente',
  zapi_response jsonb,
  erro text,
  CONSTRAINT notificacao_compensacao_log_status_chk
    CHECK (status IN ('pendente', 'sucesso', 'falha'))
);

COMMENT ON TABLE public.notificacao_compensacao_log IS
  'Uma linha por notificação de compensação disparada. Também é o estado da dedupe: o trigger consulta se já há pendência recente do mesmo cliente/mês.';

CREATE INDEX IF NOT EXISTS ix_notif_comp_dedupe
  ON public.notificacao_compensacao_log (cliente_id, mes_referencia, disparado_em DESC);

ALTER TABLE public.notificacao_compensacao_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificacao_compensacao_log FROM anon;
REVOKE ALL ON public.notificacao_compensacao_log FROM authenticated;

DROP POLICY IF EXISTS "Admin gestor pmo select notif comp" ON public.notificacao_compensacao_log;
CREATE POLICY "Admin gestor pmo select notif comp" ON public.notificacao_compensacao_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_tributario'::app_role) OR
    has_role(auth.uid(), 'pmo'::app_role)
  );
GRANT SELECT ON public.notificacao_compensacao_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notificacao_compensacao_log TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Trigger de STATEMENT.
--
-- De statement, e não de linha, por três motivos que um trigger de linha não
-- resolve:
--   a) conta as linhas do comando inteiro — a carga de 16/07 inseriu 364 linhas
--      em 181 grupos cliente/mês; por linha (ou mesmo deduplicando por grupo)
--      teriam saído 181 mensagens de WhatsApp;
--   b) agrupa dentro do próprio comando — 4 tributos num INSERT = 1 webhook;
--   c) dispara uma vez por grupo novo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_compensacao_registrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  LIMITE_CARGA CONSTANT int := 10;
  JANELA CONSTANT interval := interval '2 minutes';
  v_linhas int;
  v_url text;
  v_token text;
  v_log_id uuid;
  r record;
BEGIN
  SELECT count(*) INTO v_linhas FROM novas;

  -- Acima do limite é carga/importação, não operação do dia. Silenciar aqui é
  -- o que impede o disparo em massa.
  IF v_linhas > LIMITE_CARGA THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'n8n_webhook_compensacao_url';
  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets WHERE name = 'n8n_webhook_compensacao_token';

  IF v_url IS NULL THEN
    RETURN NULL;  -- não configurado ainda; não é erro
  END IF;

  FOR r IN
    SELECT DISTINCT n.cliente_id, n.mes_referencia
    FROM novas n
    WHERE n.cliente_id IS NOT NULL AND n.mes_referencia IS NOT NULL
  LOOP
    -- Dedupe: quem chega dentro da janela entra no grupo que o n8n vai buscar
    -- depois da espera, então não precisa (nem deve) disparar de novo.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notificacao_compensacao_log l
      WHERE l.cliente_id = r.cliente_id
        AND l.mes_referencia = r.mes_referencia
        AND l.disparado_em > now() - JANELA
    );

    INSERT INTO public.notificacao_compensacao_log (cliente_id, mes_referencia)
    VALUES (r.cliente_id, r.mes_referencia)
    RETURNING id INTO v_log_id;

    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'log_id', v_log_id,
        'cliente_id', r.cliente_id,
        'mes_referencia', r.mes_referencia
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-token', COALESCE(v_token, '')
      ),
      timeout_milliseconds := 5000
    );
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Notificação é acessório. Vault ausente, rede fora ou qualquer outra falha
  -- NÃO pode impedir alguém de lançar uma compensação.
  RAISE WARNING 'notificar_compensacao_registrada falhou: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_compensacao ON public.compensacoes_mensais;
CREATE TRIGGER trg_notificar_compensacao
  AFTER INSERT ON public.compensacoes_mensais
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.notificar_compensacao_registrada();

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- 3) Payload do grupo, consultado pelo n8n DEPOIS da espera de 60s.
--
-- É aqui que o agrupamento se materializa: o webhook disparou na primeira
-- linha, mas quem chegou nos 60s seguintes entra nesta consulta.
--
-- O rótulo de percentual lista TODOS os distintos, mesma regra de
-- formatPercentualHonorarios (src/lib/clientes-constants.ts). Um mês pode ter
-- INSS a 15% e PIS/COFINS a 20%; exibir só um repetiria o bug corrigido em
-- e9c973d, que foi justamente o que o Focus reportou.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificacao_compensacao_payload(
  p_cliente_id uuid,
  p_mes date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH linhas AS (
  SELECT
    cm.tributo,
    cm.valor_compensado,
    cm.honorario_percentual,
    COALESCE(cm.honorario_valor, cm.valor_nf_servico, 0) AS honorario,
    pt.nome_exibicao AS tese
  FROM public.compensacoes_mensais cm
  LEFT JOIN public.processos_teses pt ON pt.id = cm.processo_tese_id
  WHERE cm.cliente_id = p_cliente_id
    AND cm.mes_referencia = p_mes
),
percentuais AS (
  SELECT DISTINCT honorario_percentual AS p
  FROM linhas
  WHERE honorario_percentual IS NOT NULL AND honorario_percentual > 0
)
SELECT jsonb_build_object(
  'empresa', (SELECT empresa FROM public.clientes WHERE id = p_cliente_id),
  'mes_referencia', p_mes,
  'tese', (SELECT tese FROM linhas WHERE tese IS NOT NULL LIMIT 1),
  'linhas', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('tributo', tributo, 'valor', valor_compensado)
                     ORDER BY valor_compensado DESC)
    FROM linhas
  ), '[]'::jsonb),
  'total_compensado', COALESCE((SELECT sum(valor_compensado) FROM linhas), 0),
  'total_honorarios', COALESCE((SELECT sum(honorario) FROM linhas), 0),
  'percentuais', COALESCE((
    SELECT jsonb_agg(round(p * 100, 2) ORDER BY p) FROM percentuais
  ), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.notificacao_compensacao_payload(uuid, date) IS
  'Grupo completo cliente/mês para a mensagem de compensação registrada. Consultado pelo n8n após a janela de 60s.';

REVOKE EXECUTE ON FUNCTION public.notificacao_compensacao_payload(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notificacao_compensacao_payload(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notificacao_compensacao_payload(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notificacao_compensacao_payload(uuid, date) TO service_role;

COMMIT;
