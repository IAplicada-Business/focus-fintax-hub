-- ================================================================
-- FIX: valores compensados da planilha Controle Maio 2026
-- ================================================================
-- Problema: v_mapa_creditos calcula total_compensado SOMANDO
-- compensacoes_mensais. Clientes que ainda não tiveram o Formato B
-- (fluxo de caixa) importado apareciam com compensado=0 → saldo
-- final = valor inicial (errado).
--
-- Fix: nova coluna creditos_apurados.valor_compensado_manual +
-- update na view v_mapa_creditos pra usar como FALLBACK quando
-- não há compensações mensais registradas.
--
-- Impacto:
--   * MARAVISTA (tem compensacoes_mensais reais) → continua
--     calculando via SUM(cm.valor_compensado) — sem mudança.
--   * Demais clientes da planilha → passam a mostrar o valor
--     compensado agregado que veio da planilha do Alcir.
-- ================================================================

BEGIN;

-- 1) Nova coluna com o total compensado consolidado
ALTER TABLE public.creditos_apurados
  ADD COLUMN IF NOT EXISTS valor_compensado_manual numeric(14,2);

COMMENT ON COLUMN public.creditos_apurados.valor_compensado_manual IS
  'Valor Compensado agregado importado da planilha SISTEMA. Usado como fallback pela view v_mapa_creditos quando não há compensacoes_mensais para esse (cliente, tese). Não substitui — só preenche na ausência.';

-- 2) Backfill do compensado a partir da planilha
WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
  WHERE t.codigo IN ('INSUMOS','SUBVENCAO','ICMS_ST','PREVIDENCIARIO')
)
, incoming(cnpj, tese_codigo, valor_compensado) AS (VALUES
  ('18343960000110', 'INSUMOS', 15422.96::numeric),
  ('31224769000117', 'INSUMOS', 1354509.16::numeric),
  ('31224769000117', 'SUBVENCAO', 0.0::numeric),
  ('15580294000145', 'SUBVENCAO', 577816.2::numeric),
  ('17479543000136', 'INSUMOS', 70755.48::numeric),
  ('17479543000136', 'ICMS_ST', 0.0::numeric),
  ('05904978000100', 'INSUMOS', 7192.91::numeric),
  ('05904978000100', 'SUBVENCAO', 0.0::numeric),
  ('05904970000135', 'INSUMOS', 107165.09::numeric),
  ('05904970000135', 'SUBVENCAO', 0.0::numeric),
  ('15202462000169', 'INSUMOS', 231195.77::numeric),
  ('15202462000169', 'SUBVENCAO', 0.0::numeric),
  ('29056262000150', 'INSUMOS', 336769.7::numeric),
  ('26061062000105', 'INSUMOS', 158879.07::numeric),
  ('26061062000105', 'SUBVENCAO', 0.0::numeric),
  ('30140610000151', 'INSUMOS', 2407515.09::numeric),
  ('30140610000151', 'SUBVENCAO', 113583.94::numeric),
  ('23672895000106', 'SUBVENCAO', 0.0::numeric),
  ('23672895000106', 'ICMS_ST', 205845.74::numeric),
  ('30285758000184', 'INSUMOS', 54403.84::numeric),
  ('22546657000191', 'SUBVENCAO', 453134.13::numeric),
  ('30807561000168', 'INSUMOS', 95681.51::numeric),
  ('30807561000168', 'SUBVENCAO', 0.0::numeric),
  ('03307464000133', 'INSUMOS', 69999.75::numeric),
  ('03307464000133', 'SUBVENCAO', 0.0::numeric),
  ('10440200000119', 'INSUMOS', 103148.64::numeric),
  ('16564133000120', 'INSUMOS', 1101805.98::numeric),
  ('16564133000120', 'SUBVENCAO', 0.0::numeric),
  ('27833615000155', 'SUBVENCAO', 1894338.27::numeric),
  ('32352751000163', 'INSUMOS', 3354941.88::numeric),
  ('32352751000163', 'SUBVENCAO', 0.0::numeric),
  ('32352751000163', 'ICMS_ST', 0.0::numeric),
  ('28732157000120', 'ICMS_ST', 0.0::numeric),
  ('28732157000120', 'INSUMOS', 269868.12::numeric),
  ('28732157000120', 'SUBVENCAO', 0.0::numeric),
  ('50250937000193', 'INSUMOS', 396654.47::numeric),
  ('50250937000193', 'ICMS_ST', 0.0::numeric),
  ('50250937000193', 'SUBVENCAO', 0.0::numeric),
  ('32254332000199', 'INSUMOS', 45041.26::numeric),
  ('32254332000199', 'ICMS_ST', 0.0::numeric),
  ('32254332000199', 'SUBVENCAO', 0.0::numeric),
  ('11304945000113', 'INSUMOS', 1375393.18::numeric),
  ('11304945000113', 'ICMS_ST', 0.0::numeric),
  ('13373989000120', 'INSUMOS', 39558.34::numeric),
  ('13373989000120', 'SUBVENCAO', 0.0::numeric),
  ('04782837000190', 'PREVIDENCIARIO', 665258.56::numeric),
  ('33333713000126', 'INSUMOS', 8337.44::numeric),
  ('00569560000161', 'INSUMOS', 510095.54::numeric),
  ('00569560000161', 'SUBVENCAO', 0.0::numeric),
  ('22536813000133', 'ICMS_ST', 0.0::numeric),
  ('22536813000133', 'SUBVENCAO', 1200206.06::numeric),
  ('50547492000108', 'INSUMOS', 879201.35::numeric),
  ('50547492000108', 'ICMS_ST', 0.0::numeric),
  ('09633032000107', 'SUBVENCAO', 87583.26999999999::numeric),
  ('09633032000107', 'INSUMOS', 150000.0::numeric),
  ('05229674000186', 'INSUMOS', 529837.03::numeric),
  ('05229674000186', 'ICMS_ST', 0.0::numeric),
  ('20782168000103', 'INSUMOS', 77244.43::numeric)
)
UPDATE public.creditos_apurados ca
SET valor_compensado_manual = i.valor_compensado,
    atualizado_em = now()
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
WHERE ca.cliente_id = l.cliente_id AND ca.tese_id = l.tese_id;

-- 3) Recria v_mapa_creditos com fallback COALESCE
CREATE OR REPLACE VIEW public.v_mapa_creditos AS
SELECT
  ca.cliente_id,
  ca.tese_id,
  t.codigo AS tese_codigo,
  t.label AS tese_label,
  t.visivel_cliente,
  ca.valor_apurado_inicial,
  COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)::numeric(14,2) AS total_compensado,
  (ca.valor_apurado_inicial - COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0))::numeric(14,2) AS saldo_final
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
  'Espelha aba Detalhamento por Cliente da planilha SISTEMA. total_compensado = SUM(compensacoes_mensais) se houver, senão valor_compensado_manual da planilha, senão 0.';

COMMIT;
