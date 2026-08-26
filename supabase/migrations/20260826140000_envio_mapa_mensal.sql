-- Step 15 (parcial: canal WhatsApp) — envio mensal do Mapa Tributário.
-- Spec: docs/superpowers/specs/2026-08-26-envio-mapa-mensal-whatsapp-design.md
-- Plano: docs/superpowers/plans/2026-08-26-envio-mapa-mensal-whatsapp.md
--
-- Elegibilidade e normalização de telefone vivem AQUI, não no n8n: são regra de
-- negócio, precisam ser testáveis sem subir workflow, e precisam bater com o
-- `wa.me/55${whatsapp}` que ClienteDetail.tsx já usa.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Opt-out manual. Cliente pede pra parar, o time marca, a automação respeita.
--    Bloqueio evitado é ban evitado — é o sinal que mais derruba número, e
--    espaçar o envio não faz nada por ele.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nao_enviar_mapa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.nao_enviar_mapa IS
  'true = cliente pediu para não receber o Mapa mensal por WhatsApp. Respeitado por mapa_envios_pendentes().';

-- ---------------------------------------------------------------------------
-- 2) mapa_links — um token permanente por cliente, revogável.
--
-- Token permanente foi decisão do cliente (26/08): link fixo, cliente pode
-- salvar nos favoritos. O risco aceito é que vazamento dá acesso vitalício.
-- revogado_em é o antídoto; acessos/ultimo_acesso_em tornam acesso anômalo
-- visível — sem eles, token permanente é risco cego.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mapa_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  acessos int NOT NULL DEFAULT 0,
  ultimo_acesso_em timestamptz
);

COMMENT ON TABLE public.mapa_links IS
  'Token público permanente por cliente para /mapa/:token. Revogar = setar revogado_em; deletar a linha faz mapa_envios_pendentes() gerar outro.';

ALTER TABLE public.mapa_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mapa_links FROM anon;
REVOKE ALL ON public.mapa_links FROM authenticated;

DROP POLICY IF EXISTS "Admin gestor pmo select mapa_links" ON public.mapa_links;
CREATE POLICY "Admin gestor pmo select mapa_links" ON public.mapa_links
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_tributario'::app_role) OR
    has_role(auth.uid(), 'pmo'::app_role)
  );
GRANT SELECT ON public.mapa_links TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) mapa_envio_log — auditoria E estado de idempotência.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mapa_envio_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  destinatario text NOT NULL,
  link text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL,
  zapi_response jsonb,
  erro text,
  executado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mapa_envio_log_status_chk
    CHECK (status IN ('sucesso', 'falha', 'inelegivel'))
);

COMMENT ON TABLE public.mapa_envio_log IS
  'Um registro por tentativa de envio do Mapa mensal. Também é o ESTADO: quem tem sucesso na competência sai da fila.';

-- É o BANCO que garante "ninguém recebe duas vezes no mês", não o n8n.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mapa_envio_sucesso
  ON public.mapa_envio_log (cliente_id, competencia)
  WHERE status = 'sucesso';

-- 'inelegivel' também é único por competência: quem falha no phone-exists volta
-- pra fila no dia seguinte (o time pode corrigir o número no meio do mês), e sem
-- isso o log ganharia uma linha por cliente por dia até virar o mês.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mapa_envio_inelegivel
  ON public.mapa_envio_log (cliente_id, competencia)
  WHERE status = 'inelegivel';

CREATE INDEX IF NOT EXISTS ix_mapa_envio_competencia
  ON public.mapa_envio_log (competencia DESC, executado_em DESC);

ALTER TABLE public.mapa_envio_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mapa_envio_log FROM anon;
REVOKE ALL ON public.mapa_envio_log FROM authenticated;

DROP POLICY IF EXISTS "Admin gestor pmo select mapa_envio_log" ON public.mapa_envio_log;
CREATE POLICY "Admin gestor pmo select mapa_envio_log" ON public.mapa_envio_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_tributario'::app_role) OR
    has_role(auth.uid(), 'pmo'::app_role)
  );
GRANT SELECT ON public.mapa_envio_log TO authenticated;
GRANT SELECT, INSERT ON public.mapa_envio_log TO service_role;

-- ---------------------------------------------------------------------------
-- 4) normalizar_whatsapp — o cadastro é preenchido à mão, então erro de
--    digitação é esperado. Número inválido enviado é vetor forte de ban, então
--    é melhor rejeitar aqui do que descobrir na Z-API.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_whatsapp(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
  ddd int;
BEGIN
  d := regexp_replace(COALESCE(p_raw, ''), '\D', '', 'g');

  -- 10 (fixo com DDD) ou 11 (celular com DDD): falta o país.
  IF length(d) IN (10, 11) THEN
    d := '55' || d;
  -- 12 ou 13 já com país: só aceita se o país for 55.
  ELSIF length(d) IN (12, 13) THEN
    IF left(d, 2) <> '55' THEN
      RETURN NULL;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  -- DDD brasileiro válido fica entre 11 e 99.
  ddd := substring(d from 3 for 2)::int;
  IF ddd < 11 THEN
    RETURN NULL;
  END IF;

  RETURN d;
END;
$$;

COMMENT ON FUNCTION public.normalizar_whatsapp(text) IS
  'clientes.whatsapp é guardado sem código de país (convenção de ClienteDetail.tsx). Devolve 55+DDD+numero, ou NULL se não for normalizável.';

-- ---------------------------------------------------------------------------
-- 5) mapa_envios_pendentes — quem falta na competência, com link pronto.
--    Cria o token na primeira vez que o cliente aparece.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mapa_envios_pendentes(p_limite int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_comp date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_base text := 'https://focusfintax.com';
  v_inelegiveis int;
  v_pendentes jsonb;
BEGIN
  -- Ativos, sem opt-out, mas com cadastro que não dá número válido. Nunca entram
  -- no loop, então é aqui que precisam ser contados — é o número que cobra o
  -- time a preencher o cadastro.
  SELECT count(*) INTO v_inelegiveis
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
    AND public.normalizar_whatsapp(c.whatsapp) IS NULL;

  -- Garante token para todo elegível (idempotente).
  INSERT INTO public.mapa_links (cliente_id, token)
  -- extensions.gen_random_bytes: pgcrypto vive no schema `extensions` no
  -- Supabase, e esta função fixa search_path = public. Qualificar é melhor que
  -- alargar o search_path de uma função que roda com privilégio.
  SELECT c.id, encode(extensions.gen_random_bytes(24), 'hex')
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
    AND public.normalizar_whatsapp(c.whatsapp) IS NOT NULL
  ON CONFLICT (cliente_id) DO NOTHING;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.empresa), '[]'::jsonb) INTO v_pendentes
  FROM (
    SELECT
      c.id AS cliente_id,
      c.empresa,
      COALESCE(NULLIF(btrim(c.nome_contato), ''), 'tudo bem') AS nome_contato,
      public.normalizar_whatsapp(c.whatsapp) AS telefone,
      v_base || '/mapa/' || ml.token AS link
    FROM public.clientes c
    JOIN public.mapa_links ml ON ml.cliente_id = c.id AND ml.revogado_em IS NULL
    WHERE c.status = 'ativo'
      AND c.nao_enviar_mapa = false
      AND public.normalizar_whatsapp(c.whatsapp) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.mapa_envio_log l
        WHERE l.cliente_id = c.id
          AND l.competencia = v_comp
          AND l.status IN ('sucesso', 'inelegivel')
      )
    ORDER BY c.empresa
    LIMIT GREATEST(p_limite, 0)
  ) t;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'pendentes', v_pendentes,
    'total_pendentes', jsonb_array_length(v_pendentes),
    'inelegiveis_cadastro', v_inelegiveis
  );
END;
$$;

COMMENT ON FUNCTION public.mapa_envios_pendentes(int) IS
  'Fila do envio mensal do Mapa: ativos, sem opt-out, com whatsapp normalizável e sem sucesso/inelegivel na competência. p_limite é o limite diário.';

REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) get_mapa_by_token — RPC PÚBLICA. Espelha get_diagnostico_by_token.
--
-- Devolve os dados CRUS das mesmas 5 fontes que MapaCreditos.tsx lê. O cálculo
-- das linhas fica no client, na função compartilhada buildLinhasMapa — se fosse
-- recalculado aqui em SQL existiriam duas implementações do mesmo número, e elas
-- divergiriam. O cliente veria um total e o time veria outro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mapa_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_result jsonb;
BEGIN
  SELECT cliente_id INTO v_cliente_id
  FROM public.mapa_links
  WHERE token = _token AND revogado_em IS NULL;

  IF v_cliente_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.mapa_links
  SET acessos = acessos + 1, ultimo_acesso_em = now()
  WHERE token = _token;

  SELECT jsonb_build_object(
    'cliente', (
      SELECT to_jsonb(x) FROM (
        SELECT id, empresa, cnpj, data_apuracao
        FROM public.clientes WHERE id = v_cliente_id
      ) x
    ),
    'mapa', COALESCE((
      SELECT jsonb_agg(to_jsonb(v))
      FROM public.v_mapa_creditos v WHERE v.cliente_id = v_cliente_id
    ), '[]'::jsonb),
    'compensacoes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'valor_compensado', cm.valor_compensado,
        'tese_origem_id', cm.tese_origem_id,
        'processo_tese_id', cm.processo_tese_id,
        'mes_referencia', cm.mes_referencia,
        'tributo', cm.tributo,
        'tributo_enum', cm.tributo_enum,
        'processos_teses', (
          SELECT jsonb_build_object('tese', pt.tese, 'nome_exibicao', pt.nome_exibicao)
          FROM public.processos_teses pt WHERE pt.id = cm.processo_tese_id
        )
      ))
      FROM public.compensacoes_mensais cm WHERE cm.cliente_id = v_cliente_id
    ), '[]'::jsonb),
    'processos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pt.id, 'tese', pt.tese))
      FROM public.processos_teses pt WHERE pt.cliente_id = v_cliente_id
    ), '[]'::jsonb),
    'creditos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tese_id', ca.tese_id,
        'valor_compensado_manual', ca.valor_compensado_manual
      ))
      FROM public.creditos_apurados ca WHERE ca.cliente_id = v_cliente_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_mapa_by_token(text) IS
  'RPC pública de /mapa/:token. Devolve dados crus do Mapa; o cálculo das linhas é feito no client por buildLinhasMapa. Retorna NULL para token inexistente ou revogado.';

GRANT EXECUTE ON FUNCTION public.get_mapa_by_token(text) TO anon, authenticated, service_role;

COMMIT;
