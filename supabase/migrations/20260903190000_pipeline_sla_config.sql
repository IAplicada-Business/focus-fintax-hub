-- SLA do funil comercial (03/09/2026): metas de dias por etapa do pipeline de
-- leads, editáveis inline pelo admin/PMO na aba "SLA do funil" do Dashboard
-- comercial. Espelha esteira_sla_config, que faz o mesmo pra esteira.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pipeline_sla_config (
  etapa text PRIMARY KEY,
  label text NOT NULL,
  sla_dias int,
  ordem int NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_sla_config_sla_chk CHECK (sla_dias IS NULL OR sla_dias >= 0)
);

COMMENT ON TABLE public.pipeline_sla_config IS
  'Metas de SLA (dias) por etapa do funil comercial (leads.status_funil). Editável por admin/pmo.';

-- Defaults: Contrato Emitido = 3d bate com a regra do banner "leads sem movimentação".
INSERT INTO public.pipeline_sla_config (etapa, label, sla_dias, ordem) VALUES
  ('novo',             'Novo',                3, 1),
  ('qualificado',      'Qualificado',         5, 2),
  ('em_negociacao',    'Negociação / Teses', 10, 3),
  ('em_apresentacao',  'Em Apresentação',     7, 4),
  ('contrato_emitido', 'Contrato Emitido',    3, 5)
ON CONFLICT (etapa) DO NOTHING;

ALTER TABLE public.pipeline_sla_config ENABLE ROW LEVEL SECURITY;

-- Leitura: quem vê o pipeline (mesmos papéis da RLS de leads).
DROP POLICY IF EXISTS "pipeline_sla_config_select" ON public.pipeline_sla_config;
CREATE POLICY "pipeline_sla_config_select" ON public.pipeline_sla_config
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "pipeline_sla_config_update" ON public.pipeline_sla_config;
CREATE POLICY "pipeline_sla_config_update" ON public.pipeline_sla_config
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pmo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pmo'::app_role));

GRANT SELECT ON public.pipeline_sla_config TO authenticated;
GRANT UPDATE (label, sla_dias, ordem, ativo, atualizado_em) ON public.pipeline_sla_config TO authenticated;

COMMIT;
