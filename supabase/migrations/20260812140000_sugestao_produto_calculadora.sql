-- Épica 2 — Motor de sugestão de produto
--
-- 1) Colunas em calculadora_leads: sugestao_produto + racional jsonb
-- 2) View v_sugestao_produto_calculadora cruzando Calculadora × motor de teses
--
-- A edge submit-calculadora-lead grava o produto no insert.
-- Leads antigos ficam NULL até reprocessamento (opcional).

BEGIN;

ALTER TABLE public.calculadora_leads
  ADD COLUMN IF NOT EXISTS sugestao_produto text,
  ADD COLUMN IF NOT EXISTS sugestao_produto_racional jsonb;

COMMENT ON COLUMN public.calculadora_leads.sugestao_produto IS
  'Produto sugerido: compensacao | reforma_tributaria | ambos | analise_personalizada. Draft até Focus validar.';

COMMENT ON COLUMN public.calculadora_leads.sugestao_produto_racional IS
  'JSON com motivos, potencial de teses, economia RT e flags (draft: true).';

CREATE INDEX IF NOT EXISTS ix_calc_leads_sugestao
  ON public.calculadora_leads (sugestao_produto)
  WHERE sugestao_produto IS NOT NULL;

-- View: potencial RT (já na lead) + potencial de Compensação recalculado
-- a partir de motor_teses_config (mesma regra do RPC: fat × 60 × %).
-- Normaliza regime calculadora → motor.
CREATE OR REPLACE VIEW public.v_sugestao_produto_calculadora AS
WITH leads AS (
  SELECT
    cl.id AS calculadora_lead_id,
    cl.nome,
    cl.email,
    cl.telefone,
    cl.segmento,
    cl.regime AS regime_calculadora,
    CASE lower(cl.regime)
      WHEN 'real' THEN 'lucro_real'
      WHEN 'lucro_real' THEN 'lucro_real'
      WHEN 'presumido' THEN 'lucro_presumido'
      WHEN 'lucro_presumido' THEN 'lucro_presumido'
      WHEN 'simples' THEN 'simples'
      WHEN 'simples_nacional' THEN 'simples'
      ELSE NULL
    END AS regime_motor,
    cl.faturamento_mensal,
    cl.ja_faz_recuperacao,
    cl.economia_potencial_anual,
    cl.ibs_cbs_estimado,
    cl.sugestao_produto,
    cl.sugestao_produto_racional,
    cl.criado_em,
    l.id AS lead_id,
    l.status_funil
  FROM public.calculadora_leads cl
  LEFT JOIN public.leads l ON l.calculadora_lead_id = cl.id
),
pot AS (
  SELECT
    ld.calculadora_lead_id,
    COALESCE(SUM(ROUND(ld.faturamento_mensal * 60 * m.percentual_min)), 0)::numeric(14,2) AS potencial_compensacao_min,
    COALESCE(SUM(ROUND(ld.faturamento_mensal * 60 * m.percentual_max)), 0)::numeric(14,2) AS potencial_compensacao_max,
    COUNT(m.id)::int AS teses_elegiveis
  FROM leads ld
  LEFT JOIN public.motor_teses_config m
    ON m.ativo = true
   AND ld.regime_motor IS NOT NULL
   AND ld.regime_motor = ANY (m.regimes_elegiveis)
   AND lower(ld.segmento) = ANY (m.segmentos_elegiveis)
  GROUP BY ld.calculadora_lead_id
)
SELECT
  ld.*,
  p.potencial_compensacao_min,
  p.potencial_compensacao_max,
  p.teses_elegiveis,
  CASE
    WHEN ld.sugestao_produto IS NOT NULL THEN ld.sugestao_produto
    WHEN p.potencial_compensacao_max > 0
      AND (ABS(COALESCE(ld.economia_potencial_anual, 0)) >= 1000 OR COALESCE(ld.ibs_cbs_estimado, 0) > 0)
      THEN 'ambos'
    WHEN p.potencial_compensacao_max > 0 THEN 'compensacao'
    WHEN ABS(COALESCE(ld.economia_potencial_anual, 0)) >= 1000
      OR COALESCE(ld.ibs_cbs_estimado, 0) > 0
      THEN 'reforma_tributaria'
    ELSE 'analise_personalizada'
  END AS sugestao_produto_efetiva
FROM leads ld
JOIN pot p ON p.calculadora_lead_id = ld.calculadora_lead_id;

ALTER VIEW public.v_sugestao_produto_calculadora SET (security_invoker = true);
GRANT SELECT ON public.v_sugestao_produto_calculadora TO authenticated;

COMMENT ON VIEW public.v_sugestao_produto_calculadora IS
  'Cruza calculadora_leads (economia RT) com potencial do motor_teses_config. sugestao_produto_efetiva usa a coluna gravada ou recalcula.';

COMMIT;
