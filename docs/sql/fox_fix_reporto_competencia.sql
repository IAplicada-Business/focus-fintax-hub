-- Fix Fox: Reporto nunca conta como compensado + views alinhadas
-- 1) Zera valor_compensado_manual de REPORTO (possíveis futuros)
-- 2) Recria v_mapa_creditos / v_cliente_totais_calculo forçando compensado=0 em REPORTO

BEGIN;

UPDATE public.creditos_apurados ca
SET valor_compensado_manual = 0,
    status_utilizacao = 'a_utilizar',
    incluir_no_calculo = false,
    atualizado_em = now()
FROM public.teses_tributarias t
WHERE ca.tese_id = t.id
  AND t.codigo = 'REPORTO';

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
  'Mapa de créditos. REPORTO nunca entra como compensado (saldo = apurado). Totais do cabeçalho: incluir_no_calculo=true.';

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
  'KPIs só com teses no cálculo. REPORTO fica em possiveis_creditos_futuros e nunca soma em total_compensado.';

COMMIT;
