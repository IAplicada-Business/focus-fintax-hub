-- ============================================================================
-- Diagnóstico único + envio automático do link pelo WhatsApp
--
-- Problema: existiam dois diagnósticos diferentes para o mesmo lead.
--   * Landing page → RPC calcular_diagnostico → layout oficial /diagnostico/:token.
--   * "Regerar diagnóstico" / importação → edge analyze-lead recalculava as
--     teses em TypeScript, pedia a uma IA um texto em formato de e-mail e
--     INSERIA uma linha nova em relatorios_leads a cada execução (as linhas se
--     acumulavam e a tela abria o "relatório e-mail", não o layout oficial).
--
-- Esta migration:
--   1) faturamento_mensal_da_faixa + normalizadores de regime/segmento: as
--      MESMAS regras do submit-lead-public, agora no banco, para que qualquer
--      caminho (LP, calculadora, cadastro manual, importação) gere o mesmo
--      diagnóstico.
--   2) gerar_diagnostico_lead(lead_id): lê o lead, normaliza e chama
--      calcular_diagnostico — o mesmo motor da LP.
--   3) relatorios_leads passa a ter UMA linha por lead (dedupe + índice único).
--   4) app_config (chave/valor): URL pública do app e número comercial do
--      WhatsApp, editáveis sem deploy.
--   5) enviar_diagnostico_whatsapp(lead_id): monta a mensagem com o link e a
--      coloca na fila de saída do Atendimento (atendimento_registrar_mensagem,
--      origem 'bot'), que dispara a Z-API pelo trigger existente. Origem 'bot'
--      é proposital: 'humano' desligaria o robô (trg_bot_desliga_humano) e a
--      resposta do lead precisa cair na conversa com o robô ligado.
--   6) get_whatsapp_comercial(): número do botão "falar no WhatsApp" das
--      páginas públicas (/diagnostico e /calculadora).
--
-- Idempotente: CREATE OR REPLACE / IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Regras de normalização (espelho do submit-lead-public)
-- ---------------------------------------------------------------------------

-- Os pontos médios são usados DIRETAMENTE como faturamento mensal, sem /12:
-- é assim que submit-lead-public chama calcular_diagnostico (que multiplica
-- por 60 meses) e é assim que /diagnostico calcula o multiplicador. Dividir
-- por 12 aqui faria o diagnóstico regerado ser 12x menor que o da LP.
-- Espelho de FATURAMENTO_MIDPOINTS (src/lib/pipeline-constants.ts).
CREATE OR REPLACE FUNCTION public.faturamento_mensal_da_faixa(p_faixa text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE btrim(COALESCE(p_faixa, ''))
    WHEN 'ate_500k'  THEN 250000
    WHEN '500k_2m'   THEN 1250000
    WHEN '2m_5m'     THEN 3500000
    WHEN '5m_15m'    THEN 10000000
    WHEN 'acima_15m' THEN 20000000
    -- Mesmo fallback do submit-lead-public / analyze-lead antigo.
    ELSE 1000000
  END::numeric;
$$;

COMMENT ON FUNCTION public.faturamento_mensal_da_faixa(text) IS
  'Faturamento mensal usado no motor para a faixa do lead. Espelho de FATURAMENTO_MIDPOINTS (pipeline-constants.ts) e do submit-lead-public.';

-- Espelho de normalizeRegime do submit-lead-public: chave já em formato de
-- enum passa direto; rótulo conhecido é mapeado; o resto vira 'simples'
-- (a LP bloqueia Simples, então desconhecido nunca gera teses indevidas).
CREATE OR REPLACE FUNCTION public.diagnostico_regime_chave(p_regime text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_regime IS NULL OR btrim(p_regime) = '' THEN NULL
    WHEN regexp_replace(lower(btrim(p_regime)), '\s+', '_', 'g') IN ('simples', 'lucro_presumido', 'lucro_real')
      THEN regexp_replace(lower(btrim(p_regime)), '\s+', '_', 'g')
    WHEN p_regime = 'Simples Nacional' THEN 'simples'
    WHEN p_regime = 'Lucro Presumido'  THEN 'lucro_presumido'
    WHEN p_regime = 'Lucro Real'       THEN 'lucro_real'
    ELSE 'simples'
  END;
$$;

-- Espelho de normalizeSegmento do submit-lead-public.
CREATE OR REPLACE FUNCTION public.diagnostico_segmento_chave(p_segmento text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_segmento IS NULL OR btrim(p_segmento) = '' THEN 'outros'
    WHEN regexp_replace(lower(btrim(p_segmento)), '\s+', '_', 'g')
         IN ('supermercado', 'farmacia', 'pet', 'materiais_construcao', 'outros')
      THEN regexp_replace(lower(btrim(p_segmento)), '\s+', '_', 'g')
    WHEN p_segmento = 'Supermercado'           THEN 'supermercado'
    WHEN p_segmento = 'Farmácia'               THEN 'farmacia'
    WHEN p_segmento = 'PET Shop'               THEN 'pet'
    WHEN p_segmento = 'Material de Construção' THEN 'materiais_construcao'
    ELSE 'outros'
  END;
$$;

-- Quem pode gerar/enviar diagnóstico: backend (service_role) e o time
-- comercial. Centralizado para as duas RPCs não divergirem.
CREATE OR REPLACE FUNCTION public.diagnostico_chamador_autorizado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(auth.role(), '') = 'service_role'
    -- Manutenção pelo SQL editor (sem JWT) roda como postgres.
    OR session_user = 'postgres'
    OR (
      auth.uid() IS NOT NULL AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'pmo'::public.app_role)
        OR public.has_role(auth.uid(), 'comercial'::public.app_role)
        OR public.has_role(auth.uid(), 'sdr'::public.app_role)
        OR public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.diagnostico_chamador_autorizado() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) Uma linha de relatorios_leads por lead
-- ---------------------------------------------------------------------------
-- calcular_diagnostico já faz "upsert" (UPDATE se existe, senão INSERT), mas o
-- analyze-lead antigo inseria sempre, então há leads com várias linhas.
-- Mantém a mais nova (é a que /diagnostico já mostrava) e trava com índice.
DELETE FROM public.relatorios_leads r
USING (
  SELECT id,
         row_number() OVER (PARTITION BY lead_id ORDER BY criado_em DESC, id DESC) AS rn
  FROM public.relatorios_leads
) d
WHERE r.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_relatorios_leads_lead_id
  ON public.relatorios_leads (lead_id);


-- ---------------------------------------------------------------------------
-- 3) gerar_diagnostico_lead — mesmo motor da LP para qualquer lead
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_diagnostico_lead(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_regime text;
  v_segmento text;
  v_rel record;
BEGIN
  IF NOT public.diagnostico_chamador_autorizado() THEN
    RAISE EXCEPTION 'sem permissão para gerar diagnóstico' USING ERRCODE = '42501';
  END IF;

  SELECT id, token, faturamento_faixa, regime_tributario, segmento
    INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'lead_nao_encontrado');
  END IF;

  -- Sem faixa ou regime o motor não tem base de cálculo (elegivelDiagnostico
  -- no front usa a mesma regra).
  IF COALESCE(btrim(v_lead.faturamento_faixa), '') = ''
     OR COALESCE(btrim(v_lead.regime_tributario), '') = '' THEN
    RETURN jsonb_build_object('erro', 'dados_insuficientes');
  END IF;

  v_regime := public.diagnostico_regime_chave(v_lead.regime_tributario);
  IF v_regime = 'simples' THEN
    -- A LP também não gera diagnóstico para Simples: nenhuma tese se aplica.
    RETURN jsonb_build_object('erro', 'simples_nacional');
  END IF;

  v_segmento := public.diagnostico_segmento_chave(v_lead.segmento);

  PERFORM public.calcular_diagnostico(
    p_lead_id,
    public.faturamento_mensal_da_faixa(v_lead.faturamento_faixa),
    v_regime,
    v_segmento
  );

  -- calcular_diagnostico atualiza a linha existente sem mexer em criado_em;
  -- aqui a data passa a ser a da geração (é o que /diagnostico e o painel
  -- mostram). conteudo_html é zerado porque o texto "e-mail" da IA não é
  -- mais exibido em lugar nenhum e ficaria desatualizado.
  UPDATE public.relatorios_leads
     SET criado_em = now(),
         conteudo_html = ''
   WHERE lead_id = p_lead_id
  RETURNING teses_identificadas, estimativa_total_minima, estimativa_total_maxima, score, criado_em
    INTO v_rel;

  RETURN jsonb_build_object(
    'token', v_lead.token,
    'teses', COALESCE(v_rel.teses_identificadas, '[]'::jsonb),
    'estimativa_total_minima', COALESCE(v_rel.estimativa_total_minima, 0),
    'estimativa_total_maxima', COALESCE(v_rel.estimativa_total_maxima, 0),
    'score', COALESCE(v_rel.score, 0),
    'gerado_em', v_rel.criado_em
  );
END;
$$;

COMMENT ON FUNCTION public.gerar_diagnostico_lead(uuid) IS
  'Gera/regera o diagnóstico do lead com o mesmo motor da landing page (calcular_diagnostico). Retorna {token, teses, estimativa_total_minima, estimativa_total_maxima} ou {erro: dados_insuficientes|simples_nacional|lead_nao_encontrado}.';

REVOKE EXECUTE ON FUNCTION public.gerar_diagnostico_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_diagnostico_lead(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4) app_config — configurações simples editáveis sem deploy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
  chave text PRIMARY KEY,
  valor text,
  descricao text,
  -- Chave sensível só é lida por admin (token, URL interna...). As de hoje
  -- não são, mas a coluna evita uma migration de RLS quando surgir uma.
  sensivel boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config select" ON public.app_config;
CREATE POLICY "app_config select" ON public.app_config
  FOR SELECT TO authenticated
  USING (NOT sensivel OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "app_config admin insert" ON public.app_config;
CREATE POLICY "app_config admin insert" ON public.app_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "app_config admin update" ON public.app_config;
CREATE POLICY "app_config admin update" ON public.app_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "app_config admin delete" ON public.app_config;
CREATE POLICY "app_config admin delete" ON public.app_config
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON public.app_config FROM anon;

INSERT INTO public.app_config (chave, valor, descricao) VALUES
  ('app_public_url', NULL,
   'URL pública do app (ex.: https://app.suaempresa.com.br), sem barra no final. Base do link /diagnostico/:token enviado no WhatsApp. Vazio = não envia.'),
  ('whatsapp_comercial', '5521988946055',
   'Número do WhatsApp comercial (o conectado na Z-API), só dígitos com DDI. Usado nos botões das páginas públicas. O public/lp.html tem o mesmo número fixo: manter igual.')
ON CONFLICT (chave) DO NOTHING;

-- URL base do link: segredo do vault tem prioridade (permite trocar por
-- ambiente sem tocar na tabela); senão app_config.
CREATE OR REPLACE FUNCTION public.app_public_url()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'app_public_url';
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL; -- vault indisponível neste ambiente: cai na tabela
  END;

  IF COALESCE(btrim(v_url), '') = '' THEN
    SELECT valor INTO v_url FROM public.app_config WHERE chave = 'app_public_url';
  END IF;

  v_url := NULLIF(btrim(COALESCE(v_url, '')), '');
  RETURN CASE WHEN v_url IS NULL THEN NULL ELSE rtrim(v_url, '/') END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_public_url() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_public_url() TO authenticated, service_role;

-- Público: o número já aparece em qualquer botão de WhatsApp do site.
CREATE OR REPLACE FUNCTION public.get_whatsapp_comercial()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(valor, ''), '\D', '', 'g'), '')
    FROM public.app_config
   WHERE chave = 'whatsapp_comercial';
$$;

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_comercial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_comercial() TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5) Mensagem + envio do diagnóstico pelo WhatsApp
-- ---------------------------------------------------------------------------
-- Texto da mensagem. ESPELHO EXATO de montarMensagemDiagnostico em
-- src/lib/diagnostico-whatsapp.ts (usado só para pré-visualização na tela):
-- alterar um exige alterar o outro (há teste cobrindo o texto do front).
CREATE OR REPLACE FUNCTION public.diagnostico_mensagem_whatsapp(
  p_nome text,
  p_empresa text,
  p_link text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_primeiro text;
  v_empresa text;
  v_saudacao text;
  v_pronto text;
BEGIN
  v_primeiro := initcap((regexp_split_to_array(btrim(COALESCE(p_nome, '')), '\s+'))[1]);
  v_empresa := btrim(COALESCE(p_empresa, ''));
  -- A calculadora não pergunta a empresa e grava o nome da pessoa no lugar;
  -- "diagnóstico da Maria Silva" soaria errado, então omite.
  IF lower(v_empresa) = lower(btrim(COALESCE(p_nome, ''))) THEN
    v_empresa := '';
  END IF;

  v_saudacao := CASE WHEN COALESCE(v_primeiro, '') = '' THEN 'Olá ✱' ELSE 'Olá, ' || v_primeiro || ' ✱' END;
  v_pronto := CASE WHEN v_empresa = ''
    THEN 'Aqui é do Grupo AGF. Seu diagnóstico tributário está pronto:'
    ELSE 'Aqui é do Grupo AGF. Seu diagnóstico tributário da ' || v_empresa || ' está pronto:'
  END;

  RETURN v_saudacao || E'\n\n'
      || v_pronto || E'\n'
      || p_link || E'\n\n'
      || 'Nele você vê as teses identificadas e a estimativa de crédito a recuperar.' || E'\n\n'
      || 'Quer entender os próximos passos? É só responder esta mensagem 🤓';
END;
$$;

CREATE OR REPLACE FUNCTION public.enviar_diagnostico_whatsapp(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_tel text;
  v_base text;
  v_link text;
  v_texto text;
  v_res jsonb;
BEGIN
  IF NOT public.diagnostico_chamador_autorizado() THEN
    RAISE EXCEPTION 'sem permissão para enviar diagnóstico' USING ERRCODE = '42501';
  END IF;

  SELECT id, nome, empresa, whatsapp, token
    INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;

  IF COALESCE(btrim(v_lead.whatsapp), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_whatsapp');
  END IF;

  v_tel := public.normalizar_whatsapp(v_lead.whatsapp);
  IF v_tel IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  END IF;

  -- Link para um diagnóstico que não existe abriria "não encontrado".
  IF NOT EXISTS (SELECT 1 FROM public.relatorios_leads WHERE lead_id = p_lead_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_diagnostico');
  END IF;

  v_base := public.app_public_url();
  IF v_base IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'app_public_url_nao_configurado');
  END IF;

  v_link := v_base || '/diagnostico/' || v_lead.token::text;

  -- Evita mandar o mesmo link duas vezes (retry do form, duplo clique,
  -- LP + calculadora no mesmo dia). Envio que falhou não conta.
  IF EXISTS (
    SELECT 1 FROM public.atendimento_mensagens m
     WHERE m.telefone = v_tel
       AND m.direcao = 'saida'
       AND m.status <> 'falha'
       AND m.criado_em > now() - interval '24 hours'
       AND position(v_link IN COALESCE(m.texto, '')) > 0
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_enviado_24h', 'link', v_link);
  END IF;

  v_texto := public.diagnostico_mensagem_whatsapp(v_lead.nome, v_lead.empresa, v_link);

  -- Fila de saída do Atendimento: o trigger atendimento_disparar_envio
  -- manda pela Z-API. Origem 'bot' mantém o robô ligado na conversa.
  v_res := public.atendimento_registrar_mensagem(v_lead.whatsapp, 'saida', 'bot', 'pendente', v_texto);

  IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'registro_falhou', 'detalhe', v_res);
  END IF;

  UPDATE public.relatorios_leads
     SET enviado_whatsapp = true, enviado_em = now()
   WHERE lead_id = p_lead_id;

  -- Status da fila de leads ("Enviados"); não regride quem já avançou.
  UPDATE public.leads
     SET status = 'enviado'
   WHERE id = p_lead_id
     AND status IN ('novo', 'processando', 'relatorio_gerado');

  RETURN jsonb_build_object(
    'ok', true,
    'mensagem_id', v_res->>'mensagem_id',
    'telefone', v_tel,
    'link', v_link
  );
END;
$$;

COMMENT ON FUNCTION public.enviar_diagnostico_whatsapp(uuid) IS
  'Coloca na fila do Atendimento (origem bot) a mensagem com o link /diagnostico/:token do lead. Erros: sem_whatsapp, telefone_invalido, sem_diagnostico, app_public_url_nao_configurado, ja_enviado_24h, registro_falhou.';

REVOKE EXECUTE ON FUNCTION public.enviar_diagnostico_whatsapp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_diagnostico_whatsapp(uuid) TO authenticated, service_role;

COMMIT;
