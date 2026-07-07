-- ================================================================
-- Backfill de créditos apurados — planilha Controle Maio 2026
-- ================================================================
-- 58 linhas (cnpj × tese), consolidando duplicatas.
-- Fonte: ee1425c6-Controle_creditos_FFinTax_Maio_2026__SISTEMA.xlsx
-- Insere/atualiza:
--   1) clientes por CNPJ (novos apenas — não sobrescreve)
--   2) creditos_apurados (cliente_id, tese_id) → valor_apurado_inicial
--
-- Rerun-safe:
--   - clientes usa NOT EXISTS por CNPJ
--   - creditos_apurados usa ON CONFLICT (cliente_id, tese_id) DO UPDATE
-- ================================================================

BEGIN;

-- 1) Upsert clientes por CNPJ (só insere se ainda não existir)
WITH incoming(empresa, cnpj) AS (VALUES
  ('AM MACAE COMERCIO', '18343960000110'),
  ('AP MEDEIROS', '31224769000117'),
  ('CGX', '15580294000145'),
  ('COMERCIAL 2 REZENDE ALIMENTOS LTDA', '17479543000136'),
  ('COMERCIAL DE ALIMENTOS MANO', '05904978000100'),
  ('COMERCIAL DE ALIMENTOS PRIMUS', '05904970000135'),
  ('EMPORIO PETROLPOLIS', '15202462000169'),
  ('GRANO E FARINA PADARIA E COMERCIO LTDA', '29056262000150'),
  ('LGH', '26061062000105'),
  ('MARAVISTA COMERCIO DE ALIMENTOS', '30140610000151'),
  ('MERCADO 24 HORAS DA ROCINHA LTDA', '23672895000106'),
  ('MERCADO UNIÃO DE NOVA BRASILIA LTDA', '30285758000184'),
  ('MERCEARIA 6 ESTRELAS LTDA (Paulo)', '22546657000191'),
  ('MULTI ALIMENTOS MENDANHA LTDA', '30807561000168'),
  ('MULTIMIX', '03307464000133'),
  ('PADARIA JANDRES', '10440200000119'),
  ('PEROLA DE NITEROI SUPERMERCADOS LTDA', '16564133000120'),
  ('PRINCESA', '27833615000155'),
  ('REUNIDOS', '32352751000163'),
  ('REZENDE ALIMENTOS CDD LTDA', '28732157000120'),
  ('REZENDE ALIMENTOS JPA LTDA', '50250937000193'),
  ('REZENDE ALIMENTOS NOVA HOLANDA LTDA', '32254332000199'),
  ('SÃO FERNANDO', '11304945000113'),
  ('SHOPPING D CARNE BOI DE OURO', '13373989000120'),
  ('SOLIDICON', '04782837000190'),
  ('SUPERMERCADO CAMPOS NOVOS', '33333713000126'),
  ('SUPERMERCADO COURTS LTDA', '00569560000161'),
  ('SUPERMERCADO ECONOMICO JJ LTDA', '22536813000133'),
  ('SUPERMERCADO GUIMARAES FILHOS LTDA', '50547492000108'),
  ('SUPERMERCADO LIBERDADE', '09633032000107'),
  ('SUPREMO', '05229674000186'),
  ('UNIÃO DA FAMILIA MERCEARIA LTDA', '20782168000103')
)
INSERT INTO public.clientes (empresa, cnpj, regime_tributario, segmento, status)
SELECT i.empresa, i.cnpj, 'Lucro Real', 'supermercado', 'ativo'
FROM incoming i
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes c
  WHERE regexp_replace(c.cnpj, '\D', '', 'g') = i.cnpj
);

-- 2) Upsert creditos_apurados por (cliente, tese)
WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
  WHERE t.codigo IN ('INSUMOS','SUBVENCAO','ICMS_ST','PREVIDENCIARIO')
)
, incoming(cnpj, tese_codigo, valor_inicial) AS (VALUES
  ('18343960000110', 'INSUMOS', 51628.85::numeric),
  ('31224769000117', 'INSUMOS', 1913869.28::numeric),
  ('31224769000117', 'SUBVENCAO', 1609135.86::numeric),
  ('15580294000145', 'SUBVENCAO', 707943.48::numeric),
  ('17479543000136', 'INSUMOS', 90560.0::numeric),
  ('17479543000136', 'ICMS_ST', 38213.92::numeric),
  ('05904978000100', 'INSUMOS', 358617.91::numeric),
  ('05904978000100', 'SUBVENCAO', 206005.26::numeric),
  ('05904970000135', 'INSUMOS', 1050143.72::numeric),
  ('05904970000135', 'SUBVENCAO', 127712.31::numeric),
  ('15202462000169', 'INSUMOS', 3654756.61::numeric),
  ('15202462000169', 'SUBVENCAO', 3638826.96::numeric),
  ('29056262000150', 'INSUMOS', 642805.11::numeric),
  ('26061062000105', 'INSUMOS', 160350.0::numeric),
  ('26061062000105', 'SUBVENCAO', 132566.0::numeric),
  ('30140610000151', 'INSUMOS', 2407515.09::numeric),
  ('30140610000151', 'SUBVENCAO', 3376449.69::numeric),
  ('23672895000106', 'SUBVENCAO', 956644.91::numeric),
  ('23672895000106', 'ICMS_ST', 473348.26::numeric),
  ('30285758000184', 'INSUMOS', 110745.4::numeric),
  ('22546657000191', 'SUBVENCAO', 664997.86::numeric),
  ('30807561000168', 'INSUMOS', 100560.0::numeric),
  ('30807561000168', 'SUBVENCAO', 312522.82::numeric),
  ('03307464000133', 'INSUMOS', 547286.7::numeric),
  ('03307464000133', 'SUBVENCAO', 3032528.01::numeric),
  ('10440200000119', 'INSUMOS', 200250.6::numeric),
  ('16564133000120', 'INSUMOS', 2913131.98::numeric),
  ('16564133000120', 'SUBVENCAO', 1047001.63::numeric),
  ('27833615000155', 'SUBVENCAO', 6516385.68::numeric),
  ('32352751000163', 'INSUMOS', 4264340.57::numeric),
  ('32352751000163', 'SUBVENCAO', 2840879.74::numeric),
  ('32352751000163', 'ICMS_ST', 119503.56::numeric),
  ('28732157000120', 'ICMS_ST', 173889.96::numeric),
  ('28732157000120', 'INSUMOS', 280460.3::numeric),
  ('28732157000120', 'SUBVENCAO', 1146481.03::numeric),
  ('50250937000193', 'INSUMOS', 415594.12::numeric),
  ('50250937000193', 'ICMS_ST', 12131.07::numeric),
  ('50250937000193', 'SUBVENCAO', 244631.02::numeric),
  ('32254332000199', 'INSUMOS', 80560.0::numeric),
  ('32254332000199', 'ICMS_ST', 2283.29::numeric),
  ('32254332000199', 'SUBVENCAO', 420212.41::numeric),
  ('11304945000113', 'INSUMOS', 1484315.43::numeric),
  ('11304945000113', 'ICMS_ST', 322858.68::numeric),
  ('13373989000120', 'INSUMOS', 677054.61::numeric),
  ('13373989000120', 'SUBVENCAO', 61872.72::numeric),
  ('04782837000190', 'PREVIDENCIARIO', 759814.94::numeric),
  ('33333713000126', 'INSUMOS', 151300.0::numeric),
  ('00569560000161', 'INSUMOS', 560700.0::numeric),
  ('00569560000161', 'SUBVENCAO', 307600.53::numeric),
  ('22536813000133', 'ICMS_ST', 196871.06::numeric),
  ('22536813000133', 'SUBVENCAO', 1668605.04::numeric),
  ('50547492000108', 'INSUMOS', 933537.7::numeric),
  ('50547492000108', 'ICMS_ST', 260360.0::numeric),
  ('09633032000107', 'SUBVENCAO', 647083.86::numeric),
  ('09633032000107', 'INSUMOS', 150000.0::numeric),
  ('05229674000186', 'INSUMOS', 598300.0::numeric),
  ('05229674000186', 'ICMS_ST', 318000.0::numeric),
  ('20782168000103', 'INSUMOS', 182035.76::numeric)
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, data_apuracao)
SELECT l.cliente_id, l.tese_id, i.valor_inicial, DATE '2026-05-31'
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
ON CONFLICT (cliente_id, tese_id) DO UPDATE
  SET valor_apurado_inicial = EXCLUDED.valor_apurado_inicial,
      atualizado_em = now();

COMMIT;
