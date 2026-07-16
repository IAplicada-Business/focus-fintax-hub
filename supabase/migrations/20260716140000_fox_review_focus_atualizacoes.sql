-- ================================================================
-- Review Focus (08/jul/2026) — atualizações pedidas pelo time Fox
-- Fonte: Controle_creditos_FFinTax - Atualizado Sistema.xlsx
--        Financeiro Fintax - Atualizado Sistema.xlsx
--        Transcrição Review Focus 2026-07-08
--
-- O que esta migration faz:
--  1) incluir_no_calculo em teses_tributarias e creditos_apurados
--     (padrão: só INSUMOS + SUBVENCAO entram no cálculo financeiro)
--  2) status_utilizacao (utilizado | em_uso | a_utilizar)
--  3) Atualiza valor_apurado_inicial + valor_compensado_manual
--     com a planilha atualizada (Maravista Subvenção 363.956,55 etc.)
--  4) Desativa REPORTO no motor_teses_config
--  5) Recria v_mapa_creditos com os novos campos
--  6) Cria v_cliente_totais_calculo (totais só das teses marcadas)
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) Catálogo: flag padrão de inclusão no cálculo
-- ----------------------------------------------------------------
ALTER TABLE public.teses_tributarias
  ADD COLUMN IF NOT EXISTS incluir_no_calculo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.teses_tributarias.incluir_no_calculo IS
  'Padrão Fox (Review 08/jul/26): true apenas para INSUMOS e SUBVENCAO. REPORTO e demais ficam fora do cálculo automático; o usuário pode sobrescrever por crédito.';

UPDATE public.teses_tributarias
SET incluir_no_calculo = (codigo IN ('INSUMOS', 'SUBVENCAO')),
    atualizado_em = now();

-- REPORTO permanece no catálogo (possíveis créditos futuros), mas fora do cálculo
UPDATE public.teses_tributarias
SET ativo = false,
    atualizado_em = now()
WHERE codigo = 'REPORTO';

-- ----------------------------------------------------------------
-- 2) Créditos: incluir_no_calculo + status_utilizacao
-- ----------------------------------------------------------------
ALTER TABLE public.creditos_apurados
  ADD COLUMN IF NOT EXISTS incluir_no_calculo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_utilizacao text,
  ADD COLUMN IF NOT EXISTS valor_compensado_manual numeric(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creditos_apurados_status_utilizacao_check'
  ) THEN
    ALTER TABLE public.creditos_apurados
      ADD CONSTRAINT creditos_apurados_status_utilizacao_check
      CHECK (status_utilizacao IS NULL OR status_utilizacao IN ('utilizado', 'em_uso', 'a_utilizar'));
  END IF;
END $$;

COMMENT ON COLUMN public.creditos_apurados.incluir_no_calculo IS
  'Checkbox por cliente×tese: se true, entra nos KPIs Crédito Apurado / Saldo Restante / Total Compensado do cabeçalho.';
COMMENT ON COLUMN public.creditos_apurados.status_utilizacao IS
  'utilizado = saldo zerado já usado; em_uso = parcial; a_utilizar = ainda não começou.';

-- ----------------------------------------------------------------
-- 3) Upsert créditos iniciais (planilha atualizada)
-- ----------------------------------------------------------------
WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo AS tese_codigo, t.incluir_no_calculo AS tese_incluir
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
  WHERE t.codigo IN ('INSUMOS','SUBVENCAO','ICMS_ST','PREVIDENCIARIO','EXCLUSAO_ICMS_BC','PIS_COFINS_JUD','REPORTO')
)
, incoming(cnpj, tese_codigo, valor_inicial) AS (VALUES
  ('00569560000161', 'INSUMOS', 560700.0::numeric),
  ('00569560000161', 'SUBVENCAO', 307600.53::numeric),
  ('03307464000133', 'INSUMOS', 547286.7::numeric),
  ('03307464000133', 'SUBVENCAO', 3032528.01::numeric),
  ('04782837000190', 'PREVIDENCIARIO', 759814.94::numeric),
  ('05229674000186', 'ICMS_ST', 318000.0::numeric),
  ('05229674000186', 'INSUMOS', 598300.0::numeric),
  ('05904970000135', 'INSUMOS', 1050143.72::numeric),
  ('05904970000135', 'SUBVENCAO', 127712.31::numeric),
  ('05904978000100', 'INSUMOS', 358617.91::numeric),
  ('05904978000100', 'SUBVENCAO', 206005.26::numeric),
  ('09633032000107', 'INSUMOS', 150000.0::numeric),
  ('09633032000107', 'SUBVENCAO', 647083.86::numeric),
  ('10440200000119', 'INSUMOS', 200250.6::numeric),
  ('11304945000113', 'ICMS_ST', 322858.68::numeric),
  ('11304945000113', 'INSUMOS', 1484315.43::numeric),
  ('13373989000120', 'INSUMOS', 677054.61::numeric),
  ('13373989000120', 'SUBVENCAO', 61872.72::numeric),
  ('15202462000169', 'INSUMOS', 3654756.61::numeric),
  ('15202462000169', 'SUBVENCAO', 3638826.96::numeric),
  ('15580294000145', 'SUBVENCAO', 707943.48::numeric),
  ('16564133000120', 'INSUMOS', 2913131.98::numeric),
  ('16564133000120', 'SUBVENCAO', 1047001.63::numeric),
  ('17479543000136', 'ICMS_ST', 38213.92::numeric),
  ('17479543000136', 'INSUMOS', 90560.0::numeric),
  ('18343960000110', 'INSUMOS', 51628.85::numeric),
  ('20782168000103', 'INSUMOS', 182035.76::numeric),
  ('22536813000133', 'ICMS_ST', 196871.06::numeric),
  ('22536813000133', 'SUBVENCAO', 1668605.04::numeric),
  ('22546657000191', 'SUBVENCAO', 664997.86::numeric),
  ('23672895000106', 'ICMS_ST', 473348.26::numeric),
  ('23672895000106', 'SUBVENCAO', 956644.91::numeric),
  ('26061062000105', 'INSUMOS', 160350.0::numeric),
  ('26061062000105', 'SUBVENCAO', 132566.0::numeric),
  ('27833615000155', 'SUBVENCAO', 6516385.68::numeric),
  ('28732157000120', 'ICMS_ST', 173889.96::numeric),
  ('28732157000120', 'INSUMOS', 280460.3::numeric),
  ('28732157000120', 'SUBVENCAO', 1146481.03::numeric),
  ('29056262000150', 'INSUMOS', 642805.11::numeric),
  ('30140610000151', 'INSUMOS', 2407515.09::numeric),
  ('30140610000151', 'SUBVENCAO', 3376449.69::numeric),
  ('30285758000184', 'INSUMOS', 110745.4::numeric),
  ('30807561000168', 'INSUMOS', 100560.0::numeric),
  ('30807561000168', 'SUBVENCAO', 312522.82::numeric),
  ('31224769000117', 'INSUMOS', 1913869.28::numeric),
  ('31224769000117', 'SUBVENCAO', 1609135.86::numeric),
  ('32254332000199', 'ICMS_ST', 2283.29::numeric),
  ('32254332000199', 'INSUMOS', 80560.0::numeric),
  ('32254332000199', 'SUBVENCAO', 420212.41::numeric),
  ('32352751000163', 'ICMS_ST', 119503.56::numeric),
  ('32352751000163', 'INSUMOS', 4264340.57::numeric),
  ('32352751000163', 'SUBVENCAO', 2840879.74::numeric),
  ('33333713000126', 'INSUMOS', 151300.0::numeric),
  ('50250937000193', 'ICMS_ST', 12131.07::numeric),
  ('50250937000193', 'INSUMOS', 415594.12::numeric),
  ('50250937000193', 'SUBVENCAO', 244631.02::numeric),
  ('50547492000108', 'ICMS_ST', 260360.0::numeric),
  ('50547492000108', 'INSUMOS', 933537.7::numeric)
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, data_apuracao, incluir_no_calculo)
SELECT l.cliente_id, l.tese_id, i.valor_inicial, DATE '2026-05-01', l.tese_incluir
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo::text = i.tese_codigo
ON CONFLICT (cliente_id, tese_id) DO UPDATE
SET valor_apurado_inicial = EXCLUDED.valor_apurado_inicial,
    incluir_no_calculo = EXCLUDED.incluir_no_calculo,
    atualizado_em = now();

-- ----------------------------------------------------------------
-- 4) Atualiza compensado manual + status + incluir_no_calculo
-- ----------------------------------------------------------------
WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
  WHERE t.codigo IN ('INSUMOS','SUBVENCAO','ICMS_ST','PREVIDENCIARIO','EXCLUSAO_ICMS_BC','PIS_COFINS_JUD','REPORTO')
)
, incoming(cnpj, tese_codigo, status_utilizacao, incluir_no_calculo) AS (VALUES
  ('00569560000161', 'INSUMOS', 'utilizado'::text, true::boolean),
  ('00569560000161', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('03307464000133', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('03307464000133', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('04782837000190', 'PREVIDENCIARIO', 'utilizado'::text, false::boolean),
  ('05229674000186', 'ICMS_ST', 'a_utilizar'::text, false::boolean),
  ('05229674000186', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('05904970000135', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('05904970000135', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('05904978000100', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('05904978000100', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('09633032000107', 'INSUMOS', 'utilizado'::text, true::boolean),
  ('09633032000107', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('10440200000119', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('11304945000113', 'ICMS_ST', 'em_uso'::text, false::boolean),
  ('11304945000113', 'INSUMOS', 'utilizado'::text, true::boolean),
  ('13373989000120', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('13373989000120', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('15202462000169', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('15202462000169', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('15580294000145', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('16564133000120', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('16564133000120', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('17479543000136', 'ICMS_ST', 'a_utilizar'::text, false::boolean),
  ('17479543000136', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('18343960000110', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('20782168000103', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('22536813000133', 'ICMS_ST', 'a_utilizar'::text, false::boolean),
  ('22536813000133', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('22546657000191', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('23672895000106', 'ICMS_ST', 'em_uso'::text, false::boolean),
  ('23672895000106', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('26061062000105', 'INSUMOS', 'utilizado'::text, true::boolean),
  ('26061062000105', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('27833615000155', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('28732157000120', 'ICMS_ST', 'a_utilizar'::text, false::boolean),
  ('28732157000120', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('28732157000120', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('29056262000150', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('30140610000151', 'INSUMOS', 'utilizado'::text, true::boolean),
  ('30140610000151', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('30285758000184', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('30807561000168', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('30807561000168', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('31224769000117', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('31224769000117', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('32254332000199', 'ICMS_ST', 'a_utilizar'::text, false::boolean),
  ('32254332000199', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('32254332000199', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('32352751000163', 'ICMS_ST', 'a_utilizar'::text, false::boolean),
  ('32352751000163', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('32352751000163', 'SUBVENCAO', 'a_utilizar'::text, true::boolean),
  ('33333713000126', 'INSUMOS', 'em_uso'::text, true::boolean),
  ('50250937000193', 'ICMS_ST', 'a_utilizar'::text, false::boolean),
  ('50250937000193', 'INSUMOS', 'utilizado'::text, true::boolean),
  ('50250937000193', 'SUBVENCAO', 'em_uso'::text, true::boolean),
  ('50547492000108', 'ICMS_ST', 'em_uso'::text, false::boolean),
  ('50547492000108', 'INSUMOS', 'utilizado'::text, true::boolean)
)
, comps(cnpj, tese_codigo, valor_compensado) AS (VALUES
  ('00569560000161', 'INSUMOS', 560700.0::numeric),
  ('00569560000161', 'SUBVENCAO', 30992.86::numeric),
  ('03307464000133', 'INSUMOS', 69999.75::numeric),
  ('03307464000133', 'SUBVENCAO', 0.0::numeric),
  ('04782837000190', 'PREVIDENCIARIO', 769775.54::numeric),
  ('05229674000186', 'ICMS_ST', 0.0::numeric),
  ('05229674000186', 'INSUMOS', 573931.3::numeric),
  ('05904970000135', 'INSUMOS', 127053.48::numeric),
  ('05904970000135', 'SUBVENCAO', 0.0::numeric),
  ('05904978000100', 'INSUMOS', 7192.91::numeric),
  ('05904978000100', 'SUBVENCAO', 0.0::numeric),
  ('09633032000107', 'INSUMOS', 150000.0::numeric),
  ('09633032000107', 'SUBVENCAO', 123243.0::numeric),
  ('10440200000119', 'INSUMOS', 131794.65::numeric),
  ('11304945000113', 'ICMS_ST', 73586.78::numeric),
  ('11304945000113', 'INSUMOS', 1484315.43::numeric),
  ('13373989000120', 'INSUMOS', 49275.04::numeric),
  ('13373989000120', 'SUBVENCAO', 0.0::numeric),
  ('15202462000169', 'INSUMOS', 231195.77::numeric),
  ('15202462000169', 'SUBVENCAO', 0.0::numeric),
  ('15580294000145', 'SUBVENCAO', 620281.82::numeric),
  ('16564133000120', 'INSUMOS', 1242521.47::numeric),
  ('16564133000120', 'SUBVENCAO', 0.0::numeric),
  ('17479543000136', 'ICMS_ST', 0.0::numeric),
  ('17479543000136', 'INSUMOS', 74959.26::numeric),
  ('18343960000110', 'INSUMOS', 31791.13::numeric),
  ('20782168000103', 'INSUMOS', 91421.13::numeric),
  ('22536813000133', 'ICMS_ST', 0.0::numeric),
  ('22536813000133', 'SUBVENCAO', 1447291.89::numeric),
  ('22546657000191', 'SUBVENCAO', 480260.0::numeric),
  ('23672895000106', 'ICMS_ST', 237095.22::numeric),
  ('23672895000106', 'SUBVENCAO', 0.0::numeric),
  ('26061062000105', 'INSUMOS', 160350.0::numeric),
  ('26061062000105', 'SUBVENCAO', 1508.15::numeric),
  ('27833615000155', 'SUBVENCAO', 1894338.27::numeric),
  ('28732157000120', 'ICMS_ST', 0.0::numeric),
  ('28732157000120', 'INSUMOS', 270321.0::numeric),
  ('28732157000120', 'SUBVENCAO', 0.0::numeric),
  ('29056262000150', 'INSUMOS', 379497.96::numeric),
  ('30140610000151', 'INSUMOS', 2407515.09::numeric),
  ('30140610000151', 'SUBVENCAO', 363956.55::numeric),
  ('30285758000184', 'INSUMOS', 63474.94::numeric),
  ('30807561000168', 'INSUMOS', 63345.58::numeric),
  ('30807561000168', 'SUBVENCAO', 0.0::numeric),
  ('31224769000117', 'INSUMOS', 1448650.15::numeric),
  ('31224769000117', 'SUBVENCAO', 0.0::numeric),
  ('32254332000199', 'ICMS_ST', 0.0::numeric),
  ('32254332000199', 'INSUMOS', 51665.19::numeric),
  ('32254332000199', 'SUBVENCAO', 0.0::numeric),
  ('32352751000163', 'ICMS_ST', 0.0::numeric),
  ('32352751000163', 'INSUMOS', 4152033.66::numeric),
  ('32352751000163', 'SUBVENCAO', 0.0::numeric),
  ('33333713000126', 'INSUMOS', 9239.07::numeric),
  ('50250937000193', 'ICMS_ST', 0.0::numeric),
  ('50250937000193', 'INSUMOS', 415594.12::numeric),
  ('50250937000193', 'SUBVENCAO', 57089.33::numeric),
  ('50547492000108', 'ICMS_ST', 84390.01::numeric),
  ('50547492000108', 'INSUMOS', 933537.7::numeric)
)
UPDATE public.creditos_apurados ca
SET valor_compensado_manual = c.valor_compensado,
    status_utilizacao = i.status_utilizacao,
    incluir_no_calculo = i.incluir_no_calculo,
    atualizado_em = now()
FROM incoming i
JOIN comps c ON c.cnpj = i.cnpj AND c.tese_codigo = i.tese_codigo
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo::text = i.tese_codigo
WHERE ca.cliente_id = l.cliente_id AND ca.tese_id = l.tese_id;

-- Créditos fora da planilha (status ainda nulo) herdam o padrão da tese
UPDATE public.creditos_apurados ca
SET incluir_no_calculo = t.incluir_no_calculo,
    atualizado_em = now()
FROM public.teses_tributarias t
WHERE ca.tese_id = t.id
  AND ca.status_utilizacao IS NULL;

-- Força REPORTO sempre fora do cálculo (possíveis créditos futuros)
UPDATE public.creditos_apurados ca
SET incluir_no_calculo = false,
    atualizado_em = now()
FROM public.teses_tributarias t
WHERE ca.tese_id = t.id AND t.codigo = 'REPORTO';

-- ----------------------------------------------------------------
-- 5) Desativa REPORTO no motor de cálculo (configurações)
-- ----------------------------------------------------------------
UPDATE public.motor_teses_config
SET ativo = false,
    atualizado_em = now()
WHERE tese ILIKE '%reporto%';

-- ----------------------------------------------------------------
-- 6) Recria v_mapa_creditos
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mapa_creditos AS
SELECT
  ca.cliente_id,
  ca.tese_id,
  t.codigo AS tese_codigo,
  t.label AS tese_label,
  t.visivel_cliente,
  ca.valor_apurado_inicial,
  COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)::numeric(14,2) AS total_compensado,
  (ca.valor_apurado_inicial - COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0))::numeric(14,2) AS saldo_final,
  ca.incluir_no_calculo,
  COALESCE(
    ca.status_utilizacao,
    CASE
      WHEN COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0) <= 0 THEN 'a_utilizar'
      WHEN (ca.valor_apurado_inicial - COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)) <= 0 THEN 'utilizado'
      ELSE 'em_uso'
    END
  ) AS status_utilizacao
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
  'Mapa de créditos (planilha SISTEMA). Totais do cabeçalho devem filtrar incluir_no_calculo=true (padrão INSUMOS+SUBVENCAO).';

-- ----------------------------------------------------------------
-- 7) View de totais financeiros por cliente (só teses marcadas)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cliente_totais_calculo AS
SELECT
  ca.cliente_id,
  COALESCE(SUM(ca.valor_apurado_inicial) FILTER (WHERE ca.incluir_no_calculo), 0)::numeric(14,2) AS credito_apurado,
  COALESCE(SUM(COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)) FILTER (WHERE ca.incluir_no_calculo), 0)::numeric(14,2) AS total_compensado,
  COALESCE(SUM(ca.valor_apurado_inicial - COALESCE(comp.total_compensado, ca.valor_compensado_manual, 0)) FILTER (WHERE ca.incluir_no_calculo), 0)::numeric(14,2) AS saldo_restante,
  COALESCE(SUM(ca.valor_apurado_inicial) FILTER (WHERE NOT ca.incluir_no_calculo), 0)::numeric(14,2) AS possiveis_creditos_futuros,
  COUNT(*) FILTER (WHERE ca.incluir_no_calculo) AS teses_no_calculo,
  COUNT(*) FILTER (WHERE NOT ca.incluir_no_calculo) AS teses_fora_calculo
FROM public.creditos_apurados ca
LEFT JOIN (
  SELECT tese_origem_id, cliente_id, sum(valor_compensado) AS total_compensado
  FROM public.compensacoes_mensais
  WHERE tese_origem_id IS NOT NULL
  GROUP BY tese_origem_id, cliente_id
) comp ON comp.tese_origem_id = ca.tese_id AND comp.cliente_id = ca.cliente_id
GROUP BY ca.cliente_id;

GRANT SELECT ON public.v_cliente_totais_calculo TO authenticated;

COMMENT ON VIEW public.v_cliente_totais_calculo IS
  'KPIs financeiros do cliente usando apenas créditos com incluir_no_calculo=true. possiveis_creditos_futuros = teses desmarcadas (ex.: REPORTO).';

COMMIT;
