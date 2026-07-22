-- Fix Fox: KPIs usam Detalhamento (valor_compensado_manual) como fonte de verdade
--
-- Problema: v_mapa_creditos / v_cliente_totais_calculo faziam
--   COALESCE(sum(compensacoes_mensais), valor_compensado_manual, 0)
-- Após cargas do fluxo com tese_origem_id + órfãs duplicadas, o total
-- compensado inflava (ex.: ECONOMICO JJ ~R$ 2,0M na view vs R$ 1,2M na planilha;
-- Maravista ~R$ 3,4M vs R$ 2,77M do Review Fox).
--
-- Decisão: Detalhamento por Cliente manda no mapa/header. Fluxo mensal
-- continua na aba Compensações / filtro de período. Mensal só entra no KPI
-- quando não houver valor_compensado_manual.

BEGIN;

-- 1) Remove órfãs que têm gêmea linkada no mesmo (cliente, mês, tributo, valor)
DELETE FROM public.compensacoes_mensais o
WHERE o.tese_origem_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.compensacoes_mensais l
    WHERE l.cliente_id = o.cliente_id
      AND l.mes_referencia = o.mes_referencia
      AND l.tese_origem_id IS NOT NULL
      AND coalesce(l.tributo_enum::text, l.tributo, '') = coalesce(o.tributo_enum::text, o.tributo, '')
      AND abs(coalesce(l.valor_compensado, 0) - coalesce(o.valor_compensado, 0)) < 0.015
  );

-- 2) ECONOMICO JJ — Subvenção alinhada ao relatório reconciliado (print WhatsApp)
UPDATE public.creditos_apurados ca
SET valor_compensado_manual = 1200206.06,
    status_utilizacao = 'em_uso',
    atualizado_em = now()
FROM public.clientes c
JOIN public.teses_tributarias t ON t.codigo = 'SUBVENCAO'
WHERE ca.cliente_id = c.id
  AND ca.tese_id = t.id
  AND regexp_replace(c.cnpj, '\D', '', 'g') = '22536813000133';

-- 3) Views: preferir Detalhamento
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
    ELSE COALESCE(ca.valor_compensado_manual, comp.total_compensado, 0)::numeric(14,2)
  END AS total_compensado,
  CASE
    WHEN t.codigo = 'REPORTO' THEN ca.valor_apurado_inicial::numeric(14,2)
    ELSE (ca.valor_apurado_inicial - COALESCE(ca.valor_compensado_manual, comp.total_compensado, 0))::numeric(14,2)
  END AS saldo_final,
  ca.incluir_no_calculo,
  CASE
    WHEN t.codigo = 'REPORTO' THEN 'a_utilizar'::text
    ELSE COALESCE(
      ca.status_utilizacao,
      CASE
        WHEN COALESCE(ca.valor_compensado_manual, comp.total_compensado, 0) <= 0 THEN 'a_utilizar'
        WHEN (ca.valor_apurado_inicial - COALESCE(ca.valor_compensado_manual, comp.total_compensado, 0)) <= 0 THEN 'utilizado'
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
  'Mapa de créditos. total_compensado = Detalhamento (valor_compensado_manual) quando preenchido; senão soma do fluxo. REPORTO = 0.';

CREATE OR REPLACE VIEW public.v_cliente_totais_calculo AS
SELECT
  ca.cliente_id,
  COALESCE(SUM(ca.valor_apurado_inicial) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS credito_apurado,
  COALESCE(SUM(
    CASE
      WHEN t.codigo = 'REPORTO' THEN 0
      ELSE COALESCE(ca.valor_compensado_manual, comp.total_compensado, 0)
    END
  ) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS total_compensado,
  COALESCE(SUM(
    CASE
      WHEN t.codigo = 'REPORTO' THEN 0
      ELSE ca.valor_apurado_inicial - COALESCE(ca.valor_compensado_manual, comp.total_compensado, 0)
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
  'KPIs com teses no cálculo. Compensado = Detalhamento (manual) quando houver; senão fluxo mensal. REPORTO em possíveis futuros.';

COMMIT;
