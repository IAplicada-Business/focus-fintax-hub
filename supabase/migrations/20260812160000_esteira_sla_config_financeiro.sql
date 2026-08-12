-- SLA configurável + etapa Encaminhar Financeiro (pedido Paulo 12/08/2026).
--
-- 1) enum: encaminhar_financeiro (após em_compensacao, antes de concluido)
-- 2) tabela esteira_sla_config — prazos editáveis sem redeploy
-- 3) views v_esteira_sla / v_esteira_clientes passam a ler a config

-- ADD VALUE fora de bloco transacional (restrição do Postgres).
ALTER TYPE public.estagio_esteira ADD VALUE IF NOT EXISTS 'encaminhar_financeiro';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Config de SLA por etapa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.esteira_sla_config (
  estagio public.estagio_esteira PRIMARY KEY,
  label text NOT NULL,
  sla_dias int,
  ordem int NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esteira_sla_config_sla_chk CHECK (sla_dias IS NULL OR sla_dias >= 0)
);

COMMENT ON TABLE public.esteira_sla_config IS
  'Metas de SLA (dias) e labels da esteira administrativa — editável por admin/pmo.';

COMMENT ON COLUMN public.esteira_sla_config.sla_dias IS
  'Prazo em dias de calendário. NULL = etapa sem meta (ex.: concluído).';

INSERT INTO public.esteira_sla_config (estagio, label, sla_dias, ordem) VALUES
  ('triagem',                'Triagem',                 1,    1),
  ('levantamento',           'Levantamento',            3,    2),
  ('emitir_contrato',        'Emitir Contrato',         1,    3),
  ('receber_assinado',       'Receber Assinado',        3,    4),
  ('em_compensacao',         'Em Compensação',         30,    5),
  ('encaminhar_financeiro',  'Encaminhar Financeiro',   5,    6),
  ('concluido',              'Concluído',            NULL,    7)
ON CONFLICT (estagio) DO NOTHING;

ALTER TABLE public.esteira_sla_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "esteira_sla_config_select" ON public.esteira_sla_config;
CREATE POLICY "esteira_sla_config_select" ON public.esteira_sla_config
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_tributario'::app_role)
  );

DROP POLICY IF EXISTS "esteira_sla_config_update" ON public.esteira_sla_config;
CREATE POLICY "esteira_sla_config_update" ON public.esteira_sla_config
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
  );

GRANT SELECT ON public.esteira_sla_config TO authenticated;
GRANT UPDATE (label, sla_dias, ordem, atualizado_em) ON public.esteira_sla_config TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) v_esteira_sla — lê config (não mais VALUES hardcoded)
--    DROP+CREATE: inserimos coluna `label` após estagio.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_esteira_sla;

CREATE VIEW public.v_esteira_sla AS
WITH sla AS (
  SELECT estagio, sla_dias, ordem, label
  FROM public.esteira_sla_config
),
historico_avg AS (
  SELECT
    h.estagio,
    ROUND(AVG(EXTRACT(EPOCH FROM (h.saiu_em - h.entrou_em)) / 86400.0)::numeric, 1) AS tempo_medio_dias,
    COUNT(*)::int AS ciclos_concluidos
  FROM public.esteira_historico h
  WHERE h.saiu_em IS NOT NULL
  GROUP BY h.estagio
),
atuais AS (
  SELECT
    c.estagio_esteira AS estagio,
    COUNT(*)::int AS clientes_na_etapa,
    ROUND(AVG(EXTRACT(EPOCH FROM (now() - c.data_entrada_estagio)) / 86400.0)::numeric, 1) AS dias_medios_atuais,
    COUNT(*) FILTER (
      WHERE s.sla_dias IS NOT NULL
        AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > s.sla_dias
    )::int AS atrasados,
    COALESCE(SUM(
      GREATEST(
        0,
        EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int - s.sla_dias
      )
    ) FILTER (WHERE s.sla_dias IS NOT NULL), 0)::int AS atraso_acumulado_dias
  FROM public.clientes c
  JOIN sla s ON s.estagio = c.estagio_esteira
  WHERE c.status = 'ativo'
  GROUP BY c.estagio_esteira
)
SELECT
  s.estagio,
  s.label,
  s.sla_dias,
  s.ordem,
  COALESCE(a.clientes_na_etapa, 0) AS clientes_na_etapa,
  a.dias_medios_atuais,
  COALESCE(a.atrasados, 0) AS atrasados,
  COALESCE(a.atraso_acumulado_dias, 0) AS atraso_acumulado_dias,
  h.tempo_medio_dias,
  COALESCE(h.ciclos_concluidos, 0) AS ciclos_concluidos
FROM sla s
LEFT JOIN atuais a ON a.estagio = s.estagio
LEFT JOIN historico_avg h ON h.estagio = s.estagio
ORDER BY s.ordem;

ALTER VIEW public.v_esteira_sla SET (security_invoker = true);
GRANT SELECT ON public.v_esteira_sla TO authenticated;

COMMENT ON VIEW public.v_esteira_sla IS
  'SLA da esteira a partir de esteira_sla_config + fila atual e histórico.';

-- ---------------------------------------------------------------------------
-- 3) v_esteira_clientes — SLA/atrasado via config + ramos
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_esteira_clientes;

CREATE VIEW public.v_esteira_clientes AS
SELECT
  c.id,
  c.empresa,
  c.cnpj,
  c.segmento,
  c.regime_tributario,
  c.estagio_esteira,
  c.data_entrada_estagio,
  EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int AS dias_na_etapa,
  s.sla_dias,
  CASE
    WHEN s.sla_dias IS NULL THEN false
    WHEN EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > s.sla_dias THEN true
    ELSE false
  END AS atrasado,
  c.responsavel_id,
  p.full_name AS responsavel_nome,
  COALESCE(l.origem, 'manual') AS origem,
  c.status,
  c.status_operacional,
  c.criado_em,
  COALESCE(ramos.tem_compensacao, false) AS tem_ramo_compensacao,
  COALESCE(ramos.tem_ressarcimento, false) AS tem_ramo_ressarcimento,
  COALESCE(ramos.tem_judicial, false) AS tem_ramo_judicial
FROM public.clientes c
LEFT JOIN public.esteira_sla_config s ON s.estagio = c.estagio_esteira
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.profiles p ON p.user_id = c.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    bool_or(pt.tipo_recuperacao = 'compensacao') AS tem_compensacao,
    bool_or(pt.tipo_recuperacao = 'ressarcimento') AS tem_ressarcimento,
    bool_or(pt.tipo_recuperacao = 'recuperacao_judicial') AS tem_judicial
  FROM public.processos_teses pt
  WHERE pt.cliente_id = c.id
) ramos ON true
WHERE c.status = 'ativo';

ALTER VIEW public.v_esteira_clientes SET (security_invoker = true);
GRANT SELECT ON public.v_esteira_clientes TO authenticated;

COMMIT;
