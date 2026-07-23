-- Total Compensado acompanha a aba Compensações na hora.
--
-- Antes (20260722150000): COALESCE(manual, soma_mensal, 0)
--   → card ficava preso ao Detalhamento mesmo após registrar na aba.
--
-- Agora: COALESCE(soma_mensal_linkada, manual, 0)
--   → lançamentos da aba atualizam o KPI na hora;
--   Detalhamento (valor_compensado_manual) só entra se não houver
--   compensações_mensais com tese_origem_id para aquela tese.
-- REPORTO continua zerado / fora do cálculo.

BEGIN;

CREATE OR REPLACE VIEW public.v_mapa_creditos AS
SELECT
  ca.cliente_id,
  ca.tese_id,
  t.codigo AS tese_codigo,
  t.label AS tese_label,
  t.visivel_cliente,
  ca.valor_apurado_inicial,
  CASE
    WHEN t.codigo = 'REPORTO' THEN 0::numeric(14,2)
    ELSE COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)::numeric(14,2)
  END AS total_compensado,
  CASE
    WHEN t.codigo = 'REPORTO' THEN ca.valor_apurado_inicial::numeric(14,2)
    ELSE (ca.valor_apurado_inicial - COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0))::numeric(14,2)
  END AS saldo_final,
  ca.incluir_no_calculo,
  CASE
    WHEN t.codigo = 'REPORTO' THEN 'a_utilizar'::text
    ELSE COALESCE(
      ca.status_utilizacao,
      CASE
        WHEN COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0) <= 0 THEN 'a_utilizar'
        WHEN (ca.valor_apurado_inicial - COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)) <= 0 THEN 'utilizado'
        ELSE 'em_uso'
      END
    )
  END AS status_utilizacao
FROM public.creditos_apurados ca
JOIN public.teses_tributarias t ON t.id = ca.tese_id
LEFT JOIN (
  SELECT tese_origem_id, cliente_id, sum(valor_compensado) AS total_compensado
  FROM public.compensacoes_mensais
  WHERE tese_origem_id IS NOT NULL
  GROUP BY tese_origem_id, cliente_id
) comp ON comp.tese_origem_id = ca.tese_id AND comp.cliente_id = ca.cliente_id;

GRANT SELECT ON public.v_mapa_creditos TO authenticated;

COMMENT ON VIEW public.v_mapa_creditos IS
  'Mapa de créditos. total_compensado = soma da aba Compensações (tese_origem_id); Detalhamento só se não houver mensal. REPORTO = 0.';

CREATE OR REPLACE VIEW public.v_cliente_totais_calculo AS
SELECT
  ca.cliente_id,
  COALESCE(SUM(ca.valor_apurado_inicial) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS credito_apurado,
  COALESCE(SUM(
    CASE
      WHEN t.codigo = 'REPORTO' THEN 0
      ELSE COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)
    END
  ) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS total_compensado,
  COALESCE(SUM(
    CASE
      WHEN t.codigo = 'REPORTO' THEN 0
      ELSE ca.valor_apurado_inicial - COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)
    END
  ) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS saldo_restante,
  COALESCE(SUM(ca.valor_apurado_inicial) FILTER (WHERE NOT ca.incluir_no_calculo OR t.codigo = 'REPORTO'), 0)::numeric(14,2) AS possiveis_creditos_futuros,
  COUNT(*) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO') AS teses_no_calculo,
  COUNT(*) FILTER (WHERE NOT ca.incluir_no_calculo OR t.codigo = 'REPORTO') AS teses_fora_calculo
FROM public.creditos_apurados ca
JOIN public.teses_tributarias t ON t.id = ca.tese_id
LEFT JOIN (
  SELECT tese_origem_id, cliente_id, sum(valor_compensado) AS total_compensado
  FROM public.compensacoes_mensais
  WHERE tese_origem_id IS NOT NULL
  GROUP BY tese_origem_id, cliente_id
) comp ON comp.tese_origem_id = ca.tese_id AND comp.cliente_id = ca.cliente_id
GROUP BY ca.cliente_id;

GRANT SELECT ON public.v_cliente_totais_calculo TO authenticated;

COMMENT ON VIEW public.v_cliente_totais_calculo IS
  'KPIs com teses no cálculo. Compensado = soma aba Compensações; Detalhamento só sem mensal. REPORTO em possíveis futuros.';

COMMIT;
