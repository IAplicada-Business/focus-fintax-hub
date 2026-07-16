-- =============================================================================
-- Focus FinTax — carga direta das planilhas (sem importação pela UI)
-- Gerado em: 2026-07-16T18:14:57.452Z
-- Fontes:
--   Controle_creditos_FFinTax - Atualizado Sistema.xlsx
--     abas: Detalhamento por Cliente (+ Resumo ignorado)
--   Financeiro Fintax - Atualizado Sistema.xlsx
--     abas processadas (fluxo): 188 linhas de compensação
--     aba Controle (cadastro + créditos iniciais)
--     abas ignoradas: Controle, Fluxo de caixa, RASCUNHO(NÃO UTILIZAR), Planilha1, fluxo caixa jan 2026 (2)
--
-- O que faz:
--   1) Upsert clientes por CNPJ
--   2) Upsert créditos (Controle Financeiro + Detalhamento: inicial, compensado manual, status)
--   3) Upsert compensações mensais (todas abas fluxo válidas) + DCOMPs
--   4) Relaxa processo_tese_id NOT NULL (espelha import da UI)
--
-- Como rodar: Lovable Cloud → SQL Editor → colar tudo → Run
-- Idempotente nas chaves naturais (CNPJ / cliente+tese / cliente+mês+tributo).
-- =============================================================================

BEGIN;

ALTER TABLE public.compensacoes_mensais
  ALTER COLUMN processo_tese_id DROP NOT NULL;


-- ---------------------------------------------------------------------------
-- 1) Clientes (CNPJ)
-- ---------------------------------------------------------------------------
INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'AM MACAE COMERCIO', '18343960000110', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '18343960000110'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('AM MACAE COMERCIO', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '18343960000110';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'AP MEDEIROS', '31224769000117', 'lucro_real', 'fechado'::public.status_cliente, NULL, '2001-12-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '31224769000117'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('AP MEDEIROS', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE('2001-12-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '31224769000117';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'CGX', '15580294000145', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '15580294000145'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('CGX', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '15580294000145';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'COMERCIAL 2 REZENDE ALIMENTOS LTDA', '17479543000136', 'lucro_real', NULL, 'RJ', '2026-01-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '17479543000136'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('COMERCIAL 2 REZENDE ALIMENTOS LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '17479543000136';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'COMERCIAL DE ALIMENTOS MANO', '05904978000100', 'lucro_real', NULL, 'SP', '2026-01-15'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '05904978000100'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('COMERCIAL DE ALIMENTOS MANO', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('SP', regiao),
  data_apuracao = COALESCE('2026-01-15'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '05904978000100';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'COMERCIAL DE ALIMENTOS PRIMUS', '05904970000135', 'lucro_real', NULL, 'SP', '2026-01-15'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '05904970000135'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('COMERCIAL DE ALIMENTOS PRIMUS', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('SP', regiao),
  data_apuracao = COALESCE('2026-01-15'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '05904970000135';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'DONA BALBINA', '32028466000191', 'lucro_real', NULL, NULL, '2001-12-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '32028466000191'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('DONA BALBINA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE('2001-12-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '32028466000191';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'EMPORIO PETROLPOLIS', '15202462000169', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '15202462000169'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('EMPORIO PETROLPOLIS', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '15202462000169';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'FJC COMERCIO DE PRODUTO (Flavio)', '22802549000132', 'lucro_presumido', 'fechado'::public.status_cliente, 'Brasilia - DF', '2025-10-24'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '22802549000132'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('FJC COMERCIO DE PRODUTO (Flavio)', ''), empresa),
  regime_tributario = COALESCE('lucro_presumido', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Brasilia - DF', regiao),
  data_apuracao = COALESCE('2025-10-24'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '22802549000132';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'GRANO E FARINA PADARIA E COMERCIO LTDA', '29056262000150', 'lucro_real', 'fechado'::public.status_cliente, 'Rio de Janeiro - RJ', '2025-11-07'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '29056262000150'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('GRANO E FARINA PADARIA E COMERCIO LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Rio de Janeiro - RJ', regiao),
  data_apuracao = COALESCE('2025-11-07'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '29056262000150';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'IMPERIUM GENEROS ALIMENTICIOS LTDA', '13159094000198', 'lucro_real', 'fechado'::public.status_cliente, 'Macaé - RJ', '2025-11-26'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '13159094000198'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('IMPERIUM GENEROS ALIMENTICIOS LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Macaé - RJ', regiao),
  data_apuracao = COALESCE('2025-11-26'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '13159094000198';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'IRMAOS FLORENTINOS CEREAIS LTDA (MATRIZ)', '68746239000149', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '68746239000149'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('IRMAOS FLORENTINOS CEREAIS LTDA (MATRIZ)', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '68746239000149';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'IRMAOS FLORENTINOS CEREAIS LTDA(FILIAL)', '68746239000220', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '68746239000220'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('IRMAOS FLORENTINOS CEREAIS LTDA(FILIAL)', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '68746239000220';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'J PINTO COMÉRCIO DE ALIMENTOS (SERRA AZUL)', '11820069000188', 'lucro_real', 'relatorio_enviado'::public.status_cliente, 'Friburgo - RJ', '2025-11-07'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '11820069000188'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('J PINTO COMÉRCIO DE ALIMENTOS (SERRA AZUL)', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('relatorio_enviado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Friburgo - RJ', regiao),
  data_apuracao = COALESCE('2025-11-07'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '11820069000188';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'L.C.D. ENGENHARIA, CONSTRUCOES, MONTAGENS E MANUTENCOES', '03593765000170', 'lucro_real', 'relatorio_enviado'::public.status_cliente, 'Rio de Janeiro - RJ', '2025-11-06'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '03593765000170'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('L.C.D. ENGENHARIA, CONSTRUCOES, MONTAGENS E MANUTENCOES', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('relatorio_enviado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Rio de Janeiro - RJ', regiao),
  data_apuracao = COALESCE('2025-11-06'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '03593765000170';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'LGH', '26061062000105', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '26061062000105'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('LGH', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '26061062000105';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'LONGOS VALES', '30118426000105', 'lucro_real', NULL, NULL, '2001-12-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '30118426000105'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('LONGOS VALES', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE('2001-12-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '30118426000105';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MARAVISTA COMERCIO DE ALIMENTOS', '30140610000151', 'lucro_real', 'fechado'::public.status_cliente, 'Niterói - RJ', '2025-11-04'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '30140610000151'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MARAVISTA COMERCIO DE ALIMENTOS', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Niterói - RJ', regiao),
  data_apuracao = COALESCE('2025-11-04'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '30140610000151';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MARICA TAXI AEREO LTDA', '31548241000101', 'lucro_real', 'relatorio_enviado'::public.status_cliente, 'Rio de Janeiro - RJ', '2025-11-06'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '31548241000101'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MARICA TAXI AEREO LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('relatorio_enviado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Rio de Janeiro - RJ', regiao),
  data_apuracao = COALESCE('2025-11-06'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '31548241000101';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCADO 24 HORAS DA ROCINHA LTDA', '23672895000106', 'lucro_real', NULL, 'RJ', '2026-01-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '23672895000106'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCADO 24 HORAS DA ROCINHA LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '23672895000106';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCADO E PADARIA L M LOUZADA LTDA', '13537908000180', 'lucro_real', NULL, NULL, '2001-12-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '13537908000180'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCADO E PADARIA L M LOUZADA LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE('2001-12-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '13537908000180';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCADO UNIÃO DE NOVA BRASILIA LTDA', '30285758000184', 'lucro_real', NULL, 'RJ', '2026-01-28'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '30285758000184'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCADO UNIÃO DE NOVA BRASILIA LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-28'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '30285758000184';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCEARIA 6 ESTRELAS LTDA (Paulo)', '22546657000191', 'lucro_real', 'fechado'::public.status_cliente, 'Rio de Janeiro - RJ', '2025-12-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '22546657000191'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCEARIA 6 ESTRELAS LTDA (Paulo)', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Rio de Janeiro - RJ', regiao),
  data_apuracao = COALESCE('2025-12-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '22546657000191';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCEARIA BAR TEMPO BOM', '31862204000165', 'lucro_real', NULL, NULL, '2001-12-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '31862204000165'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCEARIA BAR TEMPO BOM', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE('2001-12-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '31862204000165';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCEARIA E COMERCIO DE CEREAIS DO PARQUE UNIÃO', '11272592000117', 'lucro_real', NULL, NULL, '2001-12-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '11272592000117'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCEARIA E COMERCIO DE CEREAIS DO PARQUE UNIÃO', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE('2001-12-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '11272592000117';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCEARIA VIDAL LTDA (FILIAL)', '28882587000200', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '28882587000200'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCEARIA VIDAL LTDA (FILIAL)', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '28882587000200';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MERCEARIA VIDAL LTDA (MATRIZ)', '28882587000129', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '28882587000129'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MERCEARIA VIDAL LTDA (MATRIZ)', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '28882587000129';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MULTI ALIMENTOS MENDANHA LTDA', '30807561000168', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '30807561000168'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MULTI ALIMENTOS MENDANHA LTDA', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '30807561000168';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'MULTIMIX', '03307464000133', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '03307464000133'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('MULTIMIX', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '03307464000133';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'PADARIA JANDRES', '10440200000119', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '10440200000119'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('PADARIA JANDRES', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '10440200000119';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'PEROLA DE NITEROI SUPERMERCADOS LTDA', '16564133000120', 'lucro_real', 'fechado'::public.status_cliente, 'Niterói - RJ', '2025-11-26'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '16564133000120'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('PEROLA DE NITEROI SUPERMERCADOS LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Niterói - RJ', regiao),
  data_apuracao = COALESCE('2025-11-26'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '16564133000120';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'POLISUPER DISTRIBUIDORA DE ALIMENTOS LTDA', '07369040000154', 'lucro_real', 'relatorio_enviado'::public.status_cliente, 'Rio de Janeiro - RJ', '2025-11-03'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '07369040000154'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('POLISUPER DISTRIBUIDORA DE ALIMENTOS LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('relatorio_enviado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Rio de Janeiro - RJ', regiao),
  data_apuracao = COALESCE('2025-11-03'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '07369040000154';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'PRINCESA', '27833615000155', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '27833615000155'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('PRINCESA', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '27833615000155';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'REUNIDOS', '32352751000163', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '32352751000163'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('REUNIDOS', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '32352751000163';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'REZENDE ALIMENTOS CDD LTDA', '28782157000120', 'lucro_real', NULL, 'RJ', '2026-01-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '28782157000120'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('REZENDE ALIMENTOS CDD LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '28782157000120';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'REZENDE ALIMENTOS CDD LTDA', '28732157000120', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '28732157000120'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('REZENDE ALIMENTOS CDD LTDA', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '28732157000120';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'REZENDE ALIMENTOS JPA LTDA', '50250937000193', 'lucro_real', NULL, 'RJ', '2026-01-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '50250937000193'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('REZENDE ALIMENTOS JPA LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '50250937000193';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'REZENDE ALIMENTOS NOVA HOLANDA LTDA', '32254332000199', 'lucro_real', NULL, 'RJ', '2026-01-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '32254332000199'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('REZENDE ALIMENTOS NOVA HOLANDA LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '32254332000199';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SÃO FERNANDO', '11304945000113', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '11304945000113'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SÃO FERNANDO', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '11304945000113';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SHOPPING D CARNE BOI DE OURO', '13373989000120', 'lucro_real', NULL, 'SP', '2026-01-15'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '13373989000120'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SHOPPING D CARNE BOI DE OURO', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('SP', regiao),
  data_apuracao = COALESCE('2026-01-15'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '13373989000120';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SOLIDICON', '04782837000190', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '04782837000190'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SOLIDICON', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '04782837000190';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SOUZA E CAMPOS COM DE PROD ALIMENTICIOS EIRELI', '34852621000115', 'lucro_real', NULL, 'RJ', '2026-01-26'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '34852621000115'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SOUZA E CAMPOS COM DE PROD ALIMENTICIOS EIRELI', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-26'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '34852621000115';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SUPERMERCADO CAMPOS NOVOS', '33333713000126', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '33333713000126'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SUPERMERCADO CAMPOS NOVOS', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '33333713000126';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SUPERMERCADO COURTS LTDA', '00569560000161', 'lucro_real', 'fechado'::public.status_cliente, 'Rio de Janeiro - RJ', '2025-12-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '00569560000161'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SUPERMERCADO COURTS LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Rio de Janeiro - RJ', regiao),
  data_apuracao = COALESCE('2025-12-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '00569560000161';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SUPERMERCADO ECONOMICO JJ LTDA', '22536813000133', 'lucro_real', NULL, 'RJ', '2026-01-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '22536813000133'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SUPERMERCADO ECONOMICO JJ LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '22536813000133';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SUPERMERCADO GUIMARAES
FILHOS LTDA', '50547492000108', 'lucro_real', 'fechado'::public.status_cliente, 'Saquarema - RJ', '2025-11-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '50547492000108'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SUPERMERCADO GUIMARAES
FILHOS LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE('Saquarema - RJ', regiao),
  data_apuracao = COALESCE('2025-11-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '50547492000108';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SUPERMERCADO LIBERDADE', '09633032000107', 'lucro_real', 'fechado'::public.status_cliente, NULL, '2001-12-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '09633032000107'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SUPERMERCADO LIBERDADE', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('fechado'::public.status_cliente, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE('2001-12-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '09633032000107';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SUPERMERCADOS FEIRA NOVA LTDA', '36525319000188', 'lucro_real', NULL, 'RJ', '2026-01-13'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '36525319000188'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SUPERMERCADOS FEIRA NOVA LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-13'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '36525319000188';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'SUPREMO', '05229674000186', NULL, NULL, NULL, NULL, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '05229674000186'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('SUPREMO', ''), empresa),
  regime_tributario = COALESCE(NULL, regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE(NULL, regiao),
  data_apuracao = COALESCE(NULL, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '05229674000186';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'UNIÃO DA FAMILIA MERCEARIA LTDA', '20782168000103', 'lucro_real', NULL, 'RJ', '2026-01-28'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '20782168000103'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('UNIÃO DA FAMILIA MERCEARIA LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE(NULL, status_operacional),
  regiao = COALESCE('RJ', regiao),
  data_apuracao = COALESCE('2026-01-28'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '20782168000103';

INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT 'USINA DE LEITE PARAISO LTDA', '45621875000149', 'lucro_real', 'relatorio_enviado'::public.status_cliente, 'São Gonçalo - RJ', '2025-11-17'::date, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\D', '', 'g') = '45621875000149'
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF('USINA DE LEITE PARAISO LTDA', ''), empresa),
  regime_tributario = COALESCE('lucro_real', regime_tributario),
  status_operacional = COALESCE('relatorio_enviado'::public.status_cliente, status_operacional),
  regiao = COALESCE('São Gonçalo - RJ', regiao),
  data_apuracao = COALESCE('2025-11-17'::date, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\D', '', 'g') = '45621875000149';


-- ---------------------------------------------------------------------------
-- 2a) Créditos iniciais — aba Controle (Financeiro)
-- ---------------------------------------------------------------------------

WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo::text AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
)
, incoming(cnpj, tese_codigo, valor_inicial, data_apuracao, incluir_no_calculo) AS (VALUES
('22802549000132', 'EXCLUSAO_ICMS_BC', 722125.02::numeric, '2025-10-24'::date, false::boolean),
('07369040000154', 'REPORTO', 26942306.85::numeric, '2025-11-03'::date, false::boolean),
('30140610000151', 'INSUMOS', 2407515.09::numeric, '2025-11-04'::date, true::boolean),
('30140610000151', 'SUBVENCAO', 3376449.69::numeric, '2025-11-04'::date, true::boolean),
('31548241000101', 'INSUMOS', 522124.32::numeric, '2025-11-06'::date, true::boolean),
('29056262000150', 'INSUMOS', 642805.11::numeric, '2025-11-07'::date, true::boolean),
('50547492000108', 'INSUMOS', 933537.70::numeric, '2025-11-17'::date, true::boolean),
('50547492000108', 'ICMS_ST', 260360.00::numeric, '2025-11-17'::date, false::boolean),
('45621875000149', 'INSUMOS', 778264.12::numeric, '2025-11-17'::date, true::boolean),
('13159094000198', 'SUBVENCAO', 1548067.50::numeric, '2025-11-26'::date, true::boolean),
('13159094000198', 'REPORTO', 7266275.33::numeric, '2025-11-26'::date, false::boolean),
('16564133000120', 'INSUMOS', 2913131.98::numeric, '2025-11-26'::date, true::boolean),
('16564133000120', 'SUBVENCAO', 1047001.63::numeric, '2025-11-26'::date, true::boolean),
('16564133000120', 'REPORTO', 10016407.12::numeric, '2025-11-26'::date, false::boolean),
('22546657000191', 'SUBVENCAO', 664997.86::numeric, '2025-12-13'::date, true::boolean),
('00569560000161', 'INSUMOS', 560700.00::numeric, '2025-12-13'::date, true::boolean),
('00569560000161', 'SUBVENCAO', 307600.53::numeric, '2025-12-13'::date, true::boolean),
('31862204000165', 'INSUMOS', 36904.10::numeric, '2001-12-17'::date, true::boolean),
('31862204000165', 'ICMS_ST', 86290.71::numeric, '2001-12-17'::date, false::boolean),
('31862204000165', 'PIS_COFINS_JUD', 654351.76::numeric, '2001-12-17'::date, false::boolean),
('11272592000117', 'PIS_COFINS_JUD', 500742.00::numeric, '2001-12-17'::date, false::boolean),
('30118426000105', 'INSUMOS', 30094.94::numeric, '2001-12-17'::date, true::boolean),
('30118426000105', 'SUBVENCAO', 122123.54::numeric, '2001-12-17'::date, true::boolean),
('30118426000105', 'PIS_COFINS_JUD', 202899.53::numeric, '2001-12-17'::date, false::boolean),
('32028466000191', 'INSUMOS', 23668.49::numeric, '2001-12-17'::date, true::boolean),
('32028466000191', 'SUBVENCAO', 549451.31::numeric, '2001-12-17'::date, true::boolean),
('32028466000191', 'ICMS_ST', 158364.73::numeric, '2001-12-17'::date, false::boolean),
('09633032000107', 'INSUMOS', 150000.00::numeric, '2001-12-17'::date, true::boolean),
('09633032000107', 'SUBVENCAO', 647083.86::numeric, '2001-12-17'::date, true::boolean),
('13537908000180', 'SUBVENCAO', 60536.11::numeric, '2001-12-17'::date, true::boolean),
('31224769000117', 'INSUMOS', 1913869.28::numeric, '2001-12-17'::date, true::boolean),
('31224769000117', 'SUBVENCAO', 1609135.86::numeric, '2001-12-17'::date, true::boolean),
('31224769000117', 'PIS_COFINS_JUD', 755091.00::numeric, '2001-12-17'::date, false::boolean),
('36525319000188', 'ICMS_ST', 1238461.48::numeric, '2026-01-13'::date, false::boolean),
('36525319000188', 'REPORTO', 69435690.28::numeric, '2026-01-13'::date, false::boolean),
('22536813000133', 'SUBVENCAO', 1668605.04::numeric, '2026-01-13'::date, true::boolean),
('22536813000133', 'ICMS_ST', 196871.06::numeric, '2026-01-13'::date, false::boolean),
('22536813000133', 'PIS_COFINS_JUD', 867813.12::numeric, '2026-01-13'::date, false::boolean),
('32254332000199', 'INSUMOS', 80560.00::numeric, '2026-01-13'::date, true::boolean),
('32254332000199', 'SUBVENCAO', 420212.41::numeric, '2026-01-13'::date, true::boolean),
('32254332000199', 'ICMS_ST', 2283.29::numeric, '2026-01-13'::date, false::boolean),
('32254332000199', 'PIS_COFINS_JUD', 134852.29::numeric, '2026-01-13'::date, false::boolean),
('50250937000193', 'INSUMOS', 415594.12::numeric, '2026-01-13'::date, true::boolean),
('50250937000193', 'SUBVENCAO', 244631.02::numeric, '2026-01-13'::date, true::boolean),
('50250937000193', 'ICMS_ST', 12131.07::numeric, '2026-01-13'::date, false::boolean),
('50250937000193', 'PIS_COFINS_JUD', 93215.06::numeric, '2026-01-13'::date, false::boolean),
('23672895000106', 'INSUMOS', 250360.00::numeric, '2026-01-13'::date, true::boolean),
('23672895000106', 'SUBVENCAO', 956644.91::numeric, '2026-01-13'::date, true::boolean),
('23672895000106', 'ICMS_ST', 222988.26::numeric, '2026-01-13'::date, false::boolean),
('23672895000106', 'PIS_COFINS_JUD', 385910.66::numeric, '2026-01-13'::date, false::boolean),
('28782157000120', 'INSUMOS', 280460.30::numeric, '2026-01-13'::date, true::boolean),
('28782157000120', 'SUBVENCAO', 1146481.03::numeric, '2026-01-13'::date, true::boolean),
('28782157000120', 'ICMS_ST', 173889.96::numeric, '2026-01-13'::date, false::boolean),
('28782157000120', 'PIS_COFINS_JUD', 527184.36::numeric, '2026-01-13'::date, false::boolean),
('17479543000136', 'INSUMOS', 90560.00::numeric, '2026-01-13'::date, true::boolean),
('17479543000136', 'ICMS_ST', 38213.92::numeric, '2026-01-13'::date, false::boolean),
('17479543000136', 'PIS_COFINS_JUD', 283514.39::numeric, '2026-01-13'::date, false::boolean),
('05904970000135', 'INSUMOS', 1050143.72::numeric, '2026-01-15'::date, true::boolean),
('05904970000135', 'SUBVENCAO', 127712.31::numeric, '2026-01-15'::date, true::boolean),
('05904970000135', 'PIS_COFINS_JUD', 102282.67::numeric, '2026-01-15'::date, false::boolean)
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, data_apuracao, incluir_no_calculo)
SELECT l.cliente_id, l.tese_id, i.valor_inicial, i.data_apuracao, i.incluir_no_calculo
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
ON CONFLICT (cliente_id, tese_id) DO UPDATE
SET valor_apurado_inicial = EXCLUDED.valor_apurado_inicial,
    data_apuracao = COALESCE(EXCLUDED.data_apuracao, public.creditos_apurados.data_apuracao),
    incluir_no_calculo = EXCLUDED.incluir_no_calculo,
    atualizado_em = now();

WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo::text AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
)
, incoming(cnpj, tese_codigo, valor_inicial, data_apuracao, incluir_no_calculo) AS (VALUES
('05904978000100', 'INSUMOS', 358617.91::numeric, '2026-01-15'::date, true::boolean),
('05904978000100', 'SUBVENCAO', 206005.26::numeric, '2026-01-15'::date, true::boolean),
('05904978000100', 'PIS_COFINS_JUD', 100616.03::numeric, '2026-01-15'::date, false::boolean),
('13373989000120', 'INSUMOS', 677054.61::numeric, '2026-01-15'::date, true::boolean),
('13373989000120', 'SUBVENCAO', 61872.72::numeric, '2026-01-15'::date, true::boolean),
('13373989000120', 'PIS_COFINS_JUD', 54882.96::numeric, '2026-01-15'::date, false::boolean),
('34852621000115', 'INSUMOS', 160500.30::numeric, '2026-01-26'::date, true::boolean),
('34852621000115', 'SUBVENCAO', 35260.30::numeric, '2026-01-26'::date, true::boolean),
('20782168000103', 'INSUMOS', 182035.76::numeric, '2026-01-28'::date, true::boolean),
('30285758000184', 'INSUMOS', 110745.40::numeric, '2026-01-28'::date, true::boolean)
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, data_apuracao, incluir_no_calculo)
SELECT l.cliente_id, l.tese_id, i.valor_inicial, i.data_apuracao, i.incluir_no_calculo
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
ON CONFLICT (cliente_id, tese_id) DO UPDATE
SET valor_apurado_inicial = EXCLUDED.valor_apurado_inicial,
    data_apuracao = COALESCE(EXCLUDED.data_apuracao, public.creditos_apurados.data_apuracao),
    incluir_no_calculo = EXCLUDED.incluir_no_calculo,
    atualizado_em = now();


-- ---------------------------------------------------------------------------
-- 2b) Detalhamento por Cliente — inicial + compensado manual + status
-- ---------------------------------------------------------------------------

WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo::text AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
)
, incoming(cnpj, tese_codigo, valor_inicial, incluir_no_calculo) AS (VALUES
('18343960000110', 'INSUMOS', 51628.85::numeric, true::boolean),
('31224769000117', 'INSUMOS', 1913869.28::numeric, true::boolean),
('31224769000117', 'SUBVENCAO', 1609135.86::numeric, true::boolean),
('15580294000145', 'SUBVENCAO', 707943.48::numeric, true::boolean),
('17479543000136', 'INSUMOS', 90560.00::numeric, true::boolean),
('17479543000136', 'ICMS_ST', 38213.92::numeric, false::boolean),
('05904978000100', 'INSUMOS', 358617.91::numeric, true::boolean),
('05904978000100', 'SUBVENCAO', 206005.26::numeric, true::boolean),
('05904970000135', 'INSUMOS', 1050143.72::numeric, true::boolean),
('05904970000135', 'SUBVENCAO', 127712.31::numeric, true::boolean),
('15202462000169', 'INSUMOS', 3654756.61::numeric, true::boolean),
('15202462000169', 'SUBVENCAO', 3638826.96::numeric, true::boolean),
('29056262000150', 'INSUMOS', 642805.11::numeric, true::boolean),
('26061062000105', 'INSUMOS', 160350.00::numeric, true::boolean),
('26061062000105', 'SUBVENCAO', 132566.00::numeric, true::boolean),
('30140610000151', 'INSUMOS', 2407515.09::numeric, true::boolean),
('30140610000151', 'SUBVENCAO', 3376449.69::numeric, true::boolean),
('23672895000106', 'SUBVENCAO', 956644.91::numeric, true::boolean),
('23672895000106', 'ICMS_ST', 473348.26::numeric, false::boolean),
('30285758000184', 'INSUMOS', 110745.40::numeric, true::boolean),
('22546657000191', 'SUBVENCAO', 664997.86::numeric, true::boolean),
('30807561000168', 'INSUMOS', 100560.00::numeric, true::boolean),
('30807561000168', 'SUBVENCAO', 312522.82::numeric, true::boolean),
('03307464000133', 'INSUMOS', 547286.70::numeric, true::boolean),
('03307464000133', 'SUBVENCAO', 3032528.01::numeric, true::boolean),
('10440200000119', 'INSUMOS', 200250.60::numeric, true::boolean),
('16564133000120', 'INSUMOS', 2913131.98::numeric, true::boolean),
('16564133000120', 'SUBVENCAO', 1047001.63::numeric, true::boolean),
('27833615000155', 'SUBVENCAO', 6516385.68::numeric, true::boolean),
('32352751000163', 'INSUMOS', 4264340.57::numeric, true::boolean),
('32352751000163', 'SUBVENCAO', 2840879.74::numeric, true::boolean),
('32352751000163', 'ICMS_ST', 119503.56::numeric, false::boolean),
('28732157000120', 'ICMS_ST', 173889.96::numeric, false::boolean),
('28732157000120', 'INSUMOS', 280460.30::numeric, true::boolean),
('28732157000120', 'SUBVENCAO', 1146481.03::numeric, true::boolean),
('50250937000193', 'INSUMOS', 415594.12::numeric, true::boolean),
('50250937000193', 'ICMS_ST', 12131.07::numeric, false::boolean),
('50250937000193', 'SUBVENCAO', 244631.02::numeric, true::boolean),
('32254332000199', 'INSUMOS', 80560.00::numeric, true::boolean),
('32254332000199', 'ICMS_ST', 2283.29::numeric, false::boolean),
('32254332000199', 'SUBVENCAO', 420212.41::numeric, true::boolean),
('11304945000113', 'INSUMOS', 1484315.43::numeric, true::boolean),
('11304945000113', 'ICMS_ST', 322858.68::numeric, false::boolean),
('13373989000120', 'INSUMOS', 677054.61::numeric, true::boolean),
('13373989000120', 'SUBVENCAO', 61872.72::numeric, true::boolean),
('04782837000190', 'PREVIDENCIARIO', 759814.94::numeric, false::boolean),
('33333713000126', 'INSUMOS', 151300.00::numeric, true::boolean),
('00569560000161', 'INSUMOS', 560700.00::numeric, true::boolean),
('00569560000161', 'SUBVENCAO', 307600.53::numeric, true::boolean),
('22536813000133', 'ICMS_ST', 196871.06::numeric, false::boolean),
('22536813000133', 'SUBVENCAO', 1668605.04::numeric, true::boolean),
('50547492000108', 'INSUMOS', 933537.70::numeric, true::boolean),
('50547492000108', 'ICMS_ST', 260360.00::numeric, false::boolean),
('09633032000107', 'SUBVENCAO', 647083.86::numeric, true::boolean),
('09633032000107', 'INSUMOS', 150000.00::numeric, true::boolean),
('05229674000186', 'INSUMOS', 598300.00::numeric, true::boolean),
('05229674000186', 'ICMS_ST', 318000.00::numeric, false::boolean),
('20782168000103', 'INSUMOS', 182035.76::numeric, true::boolean)
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, data_apuracao, incluir_no_calculo)
SELECT l.cliente_id, l.tese_id, i.valor_inicial, DATE '2026-05-01', i.incluir_no_calculo
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
ON CONFLICT (cliente_id, tese_id) DO UPDATE
SET valor_apurado_inicial = EXCLUDED.valor_apurado_inicial,
    incluir_no_calculo = EXCLUDED.incluir_no_calculo,
    atualizado_em = now();

WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo::text AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
)
, incoming(cnpj, tese_codigo, valor_compensado, status_utilizacao, incluir_no_calculo) AS (VALUES
('18343960000110', 'INSUMOS', 31791.13::numeric, 'utilizado', true::boolean),
('31224769000117', 'INSUMOS', 1448650.15::numeric, 'a_utilizar', true::boolean),
('31224769000117', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('15580294000145', 'SUBVENCAO', 620281.82::numeric, 'em_uso', true::boolean),
('17479543000136', 'INSUMOS', 74959.26::numeric, 'em_uso', true::boolean),
('17479543000136', 'ICMS_ST', 0.00::numeric, 'a_utilizar', false::boolean),
('05904978000100', 'INSUMOS', 7192.91::numeric, 'em_uso', true::boolean),
('05904978000100', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('05904970000135', 'INSUMOS', 127053.48::numeric, 'em_uso', true::boolean),
('05904970000135', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('15202462000169', 'INSUMOS', 231195.77::numeric, 'em_uso', true::boolean),
('15202462000169', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('29056262000150', 'INSUMOS', 379497.96::numeric, 'em_uso', true::boolean),
('26061062000105', 'INSUMOS', 160350.00::numeric, 'utilizado', true::boolean),
('26061062000105', 'SUBVENCAO', 1508.15::numeric, 'em_uso', true::boolean),
('30140610000151', 'INSUMOS', 2407515.09::numeric, 'utilizado', true::boolean),
('30140610000151', 'SUBVENCAO', 363956.55::numeric, 'em_uso', true::boolean),
('23672895000106', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('23672895000106', 'ICMS_ST', 237095.22::numeric, 'em_uso', false::boolean),
('30285758000184', 'INSUMOS', 63474.94::numeric, 'em_uso', true::boolean),
('22546657000191', 'SUBVENCAO', 480260.00::numeric, 'em_uso', true::boolean),
('30807561000168', 'INSUMOS', 63345.58::numeric, 'em_uso', true::boolean),
('30807561000168', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('03307464000133', 'INSUMOS', 69999.75::numeric, 'em_uso', true::boolean),
('03307464000133', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('10440200000119', 'INSUMOS', 131794.65::numeric, 'em_uso', true::boolean),
('16564133000120', 'INSUMOS', 1242521.47::numeric, 'em_uso', true::boolean),
('16564133000120', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('27833615000155', 'SUBVENCAO', 1894338.27::numeric, 'em_uso', true::boolean),
('32352751000163', 'INSUMOS', 4152033.66::numeric, 'em_uso', true::boolean),
('32352751000163', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('32352751000163', 'ICMS_ST', 0.00::numeric, 'a_utilizar', false::boolean),
('28732157000120', 'ICMS_ST', 0.00::numeric, 'a_utilizar', false::boolean),
('28732157000120', 'INSUMOS', 270321.00::numeric, 'em_uso', true::boolean),
('28732157000120', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('50250937000193', 'INSUMOS', 415594.12::numeric, 'utilizado', true::boolean),
('50250937000193', 'ICMS_ST', 0.00::numeric, 'a_utilizar', false::boolean),
('50250937000193', 'SUBVENCAO', 57089.33::numeric, 'em_uso', true::boolean),
('32254332000199', 'INSUMOS', 51665.19::numeric, 'em_uso', true::boolean),
('32254332000199', 'ICMS_ST', 0.00::numeric, 'a_utilizar', false::boolean),
('32254332000199', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('11304945000113', 'INSUMOS', 1484315.43::numeric, 'utilizado', true::boolean),
('11304945000113', 'ICMS_ST', 73586.78::numeric, 'em_uso', false::boolean),
('13373989000120', 'INSUMOS', 49275.04::numeric, 'em_uso', true::boolean),
('13373989000120', 'SUBVENCAO', 0.00::numeric, 'a_utilizar', true::boolean),
('04782837000190', 'PREVIDENCIARIO', 769775.54::numeric, 'utilizado', false::boolean),
('33333713000126', 'INSUMOS', 9239.07::numeric, 'em_uso', true::boolean),
('00569560000161', 'INSUMOS', 560700.00::numeric, 'utilizado', true::boolean),
('00569560000161', 'SUBVENCAO', 30992.86::numeric, 'em_uso', true::boolean),
('22536813000133', 'ICMS_ST', 0.00::numeric, 'a_utilizar', false::boolean),
('22536813000133', 'SUBVENCAO', 1447291.89::numeric, 'em_uso', true::boolean),
('50547492000108', 'INSUMOS', 933537.70::numeric, 'utilizado', true::boolean),
('50547492000108', 'ICMS_ST', 84390.01::numeric, 'em_uso', false::boolean),
('09633032000107', 'SUBVENCAO', 123243.00::numeric, 'em_uso', true::boolean),
('09633032000107', 'INSUMOS', 150000.00::numeric, 'utilizado', true::boolean),
('05229674000186', 'INSUMOS', 573931.30::numeric, 'em_uso', true::boolean),
('05229674000186', 'ICMS_ST', 0.00::numeric, 'a_utilizar', false::boolean),
('20782168000103', 'INSUMOS', 91421.13::numeric, 'em_uso', true::boolean)
)
UPDATE public.creditos_apurados ca
SET valor_compensado_manual = i.valor_compensado,
    status_utilizacao = i.status_utilizacao,
    incluir_no_calculo = i.incluir_no_calculo,
    atualizado_em = now()
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
WHERE ca.cliente_id = l.cliente_id AND ca.tese_id = l.tese_id;


-- REPORTO sempre fora do cálculo
UPDATE public.creditos_apurados ca
SET incluir_no_calculo = false, atualizado_em = now()
FROM public.teses_tributarias t
WHERE ca.tese_id = t.id AND t.codigo = 'REPORTO';


-- ---------------------------------------------------------------------------
-- 3) Compensações mensais (fluxo) + DCOMPs
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_comp_carga (
  cnpj text NOT NULL,
  mes_referencia date NOT NULL,
  tributo_enum text NOT NULL,
  valor_compensado numeric NOT NULL DEFAULT 0,
  honorario_valor numeric,
  honorario_percentual numeric,
  lancado_mapa boolean NOT NULL DEFAULT false,
  vencimento_debito date,
  nfse_valor numeric,
  observacao text,
  dcomps text[] NOT NULL DEFAULT '{}',
  UNIQUE (cnpj, mes_referencia, tributo_enum)
) ON COMMIT DROP;

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('30140610000151', '2025-11-01'::date, 'INSS_52', 269738.69, 67424.44, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('30140610000151', '2025-11-01'::date, 'outros', 67383.52, NULL, NULL, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('29056262000150', '2025-11-01'::date, 'INSS_52', 56896.31, 10680.35, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('29056262000150', '2025-11-01'::date, 'outros', 8477.93, NULL, NULL, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('29056262000150', '2025-11-01'::date, 'IRPJ_CSLL_agregado', 20068.58, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('15580294000145', '2025-11-01'::date, 'INSS_52', 72595.82, 17459.51, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('15580294000145', '2025-11-01'::date, 'IRPJ_CSLL_agregado', 67080.23, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('50547492000108', '2025-11-01'::date, 'INSS_52', 158753.25, 22187.63, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('50547492000108', '2025-11-01'::date, 'outros', 18747.80, NULL, NULL, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('16564133000120', '2025-11-01'::date, 'INSS_52', 154501.40, 29578.29, 0.1500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('16564133000120', '2025-11-01'::date, 'outros', 42687.23, NULL, NULL, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('00569560000161', '2025-11-01'::date, 'INSS_52', 94484.48, 22424.67, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('00569560000161', '2025-11-01'::date, 'outros', 17638.88, NULL, NULL, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('22546657000191', '2025-11-01'::date, 'INSS_52', 41563.37, 12430.92, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('22546657000191', '2025-11-01'::date, 'IRPJ_CSLL_agregado', 20591.22, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('09633032000107', '2025-11-01'::date, 'outros', 9994.51, 1998.90, 0.2000, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('11304945000113', '2025-11-01'::date, 'IRPJ_CSLL_agregado', 79452.59, 11917.89, 0.1500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('05229674000186', '2025-11-01'::date, 'INSS_52', 60683.29, 12136.66, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('26061062000105', '2025-11-01'::date, 'INSS_52', 4080.08, 816.02, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('31224769000117', '2025-11-01'::date, 'INSS_52', 128102.04, 90354.12, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('31224769000117', '2025-11-01'::date, 'outros', 64988.70, NULL, NULL, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('31224769000117', '2025-11-01'::date, 'IRPJ_CSLL_agregado', 77770.53, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('31224769000117', '2025-11-01'::date, 'DCTWEB_trimestral', 180909.33, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('22802549000132', '2025-11-01'::date, 'INSS_52', 2167.91, 50274.38, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('22802549000132', '2025-11-01'::date, 'outros', 130695.38, NULL, NULL, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('22802549000132', '2025-11-01'::date, 'IRPJ_CSLL_agregado', 118508.59, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa dez 2025, variante antigo)', '{}'::text[]),
('30140610000151', '2025-12-01'::date, 'INSS_52', 131228.90, 40754.77, 0.1500, false, NULL, 23898.66, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['17300.78779.160126.1.3.19-2064','33883.13403.160126.1.3.19-2817','23621.25335.230126.1.3.19-5490','03761.93908.230126.1.3.19-5961']::text[]),
('30140610000151', '2025-12-01'::date, 'outros', 140469.56, NULL, NULL, false, NULL, 23898.66, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['17300.78779.160126.1.3.19-2064','33883.13403.160126.1.3.19-2817','23621.25335.230126.1.3.19-5490','03761.93908.230126.1.3.19-5961']::text[]),
('29056262000150', '2025-12-01'::date, 'INSS_52', 28611.69, 11436.59, 0.1250, false, NULL, 11261.10, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['04095.95327.150126.1.3.19-3931','25341.13808.150126.1.3.19-1044','07357.28543.230126.1.3.19-9597','39634.47398.280126.1.1.19-4068','07053.49133.280126.1.3.19-0027']::text[]),
('29056262000150', '2025-12-01'::date, 'outros', 8729.64, NULL, NULL, false, NULL, 11261.10, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['04095.95327.150126.1.3.19-3931','25341.13808.150126.1.3.19-1044','07357.28543.230126.1.3.19-9597','39634.47398.280126.1.1.19-4068','07053.49133.280126.1.3.19-0027']::text[]),
('29056262000150', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 45673.43, NULL, NULL, false, NULL, 11261.10, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['04095.95327.150126.1.3.19-3931','25341.13808.150126.1.3.19-1044','07357.28543.230126.1.3.19-9597','39634.47398.280126.1.1.19-4068','07053.49133.280126.1.3.19-0027']::text[]),
('29056262000150', '2025-12-01'::date, 'DCTWEB_trimestral', 8477.93, NULL, NULL, false, NULL, 11261.10, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['04095.95327.150126.1.3.19-3931','25341.13808.150126.1.3.19-1044','07357.28543.230126.1.3.19-9597','39634.47398.280126.1.1.19-4068','07053.49133.280126.1.3.19-0027']::text[]),
('15580294000145', '2025-12-01'::date, 'INSS_52', 37533.08, 24870.89, 0.1250, false, NULL, 23674.95, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['25341.13808.150126.1.3.19-1044','04095.95327.150126.1.3.19-3931']::text[]),
('15580294000145', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 161434.07, NULL, NULL, false, NULL, 23674.95, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['25341.13808.150126.1.3.19-1044','04095.95327.150126.1.3.19-3931']::text[]),
('50547492000108', '2025-12-01'::date, 'INSS_52', 96893.75, 17587.85, 0.1250, false, NULL, 17587.85, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['14818.19074.160126.1.3.19-6800','21279.35657.160126.1.3.19-3315']::text[]),
('50547492000108', '2025-12-01'::date, 'outros', 43809.07, NULL, NULL, false, NULL, 17587.85, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['14818.19074.160126.1.3.19-6800','21279.35657.160126.1.3.19-3315']::text[]),
('16564133000120', '2025-12-01'::date, 'INSS_52', 79303.13, 47969.08, 0.1500, false, NULL, 47969.08, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['15030.94485.150126.1.3.19-0562','34384.31549.150126.1.3.19-7678','08268.04410.230126.1.3.19-6086','16899.18729.280126.1.3.19-6950']::text[]),
('16564133000120', '2025-12-01'::date, 'outros', 56634.64, NULL, NULL, false, NULL, 47969.08, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['15030.94485.150126.1.3.19-0562','34384.31549.150126.1.3.19-7678','08268.04410.230126.1.3.19-6086','16899.18729.280126.1.3.19-6950']::text[]),
('16564133000120', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 183856.12, NULL, NULL, false, NULL, 47969.08, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['15030.94485.150126.1.3.19-0562','34384.31549.150126.1.3.19-7678','08268.04410.230126.1.3.19-6086','16899.18729.280126.1.3.19-6950']::text[]),
('00569560000161', '2025-12-01'::date, 'INSS_52', 50065.22, 16296.35, 0.2000, false, NULL, 16296.35, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['02405.91673.150126.1.3.19-6918','09003.01357.150126.1.3.19-7771','08436.38790.270126.1.3.19-4052']::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('00569560000161', '2025-12-01'::date, 'outros', 16445.24, NULL, NULL, false, NULL, 16296.35, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['02405.91673.150126.1.3.19-6918','09003.01357.150126.1.3.19-7771','08436.38790.270126.1.3.19-4052']::text[]),
('00569560000161', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 14971.27, NULL, NULL, false, NULL, 16296.35, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['02405.91673.150126.1.3.19-6918','09003.01357.150126.1.3.19-7771','08436.38790.270126.1.3.19-4052']::text[]),
('22546657000191', '2025-12-01'::date, 'INSS_52', 24795.80, 48157.74, 0.2000, false, NULL, 44039.49, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['01876.37126.150126.1.3.04-8750','10244.34586.150126.1.3.04-3105','15730.77247.150126.1.3.04-0557','16022.07223.150126.1.3.04-1039','24335.78821.150126.1.3.04-0608','07667.63853.270126.1.1.19-8302']::text[]),
('22546657000191', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 215992.92, NULL, NULL, false, NULL, 44039.49, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['01876.37126.150126.1.3.04-8750','10244.34586.150126.1.3.04-3105','15730.77247.150126.1.3.04-0557','16022.07223.150126.1.3.04-1039','24335.78821.150126.1.3.04-0608','07667.63853.270126.1.1.19-8302']::text[]),
('09633032000107', '2025-12-01'::date, 'INSS_52', 21716.03, 9733.19, 0.1500, false, NULL, 9733.19, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['22029.18618.150126.1.3.18-1435','22232.78400.150126.1.3.18-4459','28773.61048.150126.1.3.19-3750','01314.10762.270126.1.3.18-3714']::text[]),
('09633032000107', '2025-12-01'::date, 'outros', 13640.80, NULL, NULL, false, NULL, 9733.19, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['22029.18618.150126.1.3.18-1435','22232.78400.150126.1.3.18-4459','28773.61048.150126.1.3.19-3750','01314.10762.270126.1.3.18-3714']::text[]),
('09633032000107', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 29531.09, NULL, NULL, false, NULL, 9733.19, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['22029.18618.150126.1.3.18-1435','22232.78400.150126.1.3.18-4459','28773.61048.150126.1.3.19-3750','01314.10762.270126.1.3.18-3714']::text[]),
('11304945000113', '2025-12-01'::date, 'INSS_52', 98781.51, 65875.05, 0.1500, false, NULL, 68690.45, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['18602.60343.150126.1.3.19-1062','15744.48190.150126.1.3.19-0080','41636.47156.261225.1.1.19-7607','25818.82650.261225.1.3.19-4104','19620.51548.270126.1.1.19-2231','27812.30712.270126.1.3.19-9856']::text[]),
('11304945000113', '2025-12-01'::date, 'outros', 69726.88, NULL, NULL, false, NULL, 68690.45, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['18602.60343.150126.1.3.19-1062','15744.48190.150126.1.3.19-0080','41636.47156.261225.1.1.19-7607','25818.82650.261225.1.3.19-4104','19620.51548.270126.1.1.19-2231','27812.30712.270126.1.3.19-9856']::text[]),
('11304945000113', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 270658.64, NULL, NULL, false, NULL, 68690.45, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['18602.60343.150126.1.3.19-1062','15744.48190.150126.1.3.19-0080','41636.47156.261225.1.1.19-7607','25818.82650.261225.1.3.19-4104','19620.51548.270126.1.1.19-2231','27812.30712.270126.1.3.19-9856']::text[]),
('05229674000186', '2025-12-01'::date, 'INSS_52', 33498.29, 31126.62, 0.2000, false, NULL, 31126.62, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['33264.72763.150126.1.3.19-0989','40157.33676.150126.1.3.19-2029','40271.34269.150126.1.3.19-5938','37486.56052.230126.1.3.19-2957','17173.01128.280126.1.1.19-2013','11433.17846.280126.1.3.19-8040']::text[]),
('05229674000186', '2025-12-01'::date, 'outros', 28098.74, NULL, NULL, false, NULL, 31126.62, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['33264.72763.150126.1.3.19-0989','40157.33676.150126.1.3.19-2029','40271.34269.150126.1.3.19-5938','37486.56052.230126.1.3.19-2957','17173.01128.280126.1.1.19-2013','11433.17846.280126.1.3.19-8040']::text[]),
('05229674000186', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 94036.08, NULL, NULL, false, NULL, 31126.62, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['33264.72763.150126.1.3.19-0989','40157.33676.150126.1.3.19-2029','40271.34269.150126.1.3.19-5938','37486.56052.230126.1.3.19-2957','17173.01128.280126.1.1.19-2013','11433.17846.280126.1.3.19-8040']::text[]),
('26061062000105', '2025-12-01'::date, 'INSS_52', 2762.40, 18103.39, 0.2000, false, NULL, 18103.39, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['26241.05281.160126.1.3.19-8900','08495.28809.280126.1.3.19-2941','12318.77957.280126.1.1.19-1580']::text[]),
('26061062000105', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 87754.55, NULL, NULL, false, NULL, 18103.39, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['26241.05281.160126.1.3.19-8900','08495.28809.280126.1.3.19-2941','12318.77957.280126.1.1.19-1580']::text[]),
('31224769000117', '2025-12-01'::date, 'INSS_52', 34097.05, 70328.99, 0.2000, false, NULL, 70328.99, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['38218.51641.150126.1.3.18-2136','26519.48994.150126.1.1.18-1809','15942.32381.150126.1.3.18-9788','12267.25756.280126.1.1.19-1950','36923.64823.280126.1.3.19-9078']::text[]),
('31224769000117', '2025-12-01'::date, 'outros', 61798.12, NULL, NULL, false, NULL, 70328.99, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['38218.51641.150126.1.3.18-2136','26519.48994.150126.1.1.18-1809','15942.32381.150126.1.3.18-9788','12267.25756.280126.1.1.19-1950','36923.64823.280126.1.3.19-9078']::text[]),
('31224769000117', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 255749.77, NULL, NULL, false, NULL, 70328.99, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['38218.51641.150126.1.3.18-2136','26519.48994.150126.1.1.18-1809','15942.32381.150126.1.3.18-9788','12267.25756.280126.1.1.19-1950','36923.64823.280126.1.3.19-9078']::text[]),
('36525319000188', '2025-12-01'::date, 'INSS_52', 897672.59, 89767.26, 0.1000, false, NULL, 89767.26, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['15058.02495.160126.1.3.19-4752']::text[]),
('22536813000133', '2025-12-01'::date, 'INSS_52', 127115.63, 58297.52, 0.1500, false, NULL, 58297.52, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['25342.70439.230126.1.3.04-3340','14009.83451.230126.1.3.04-7126','35496.64570.230126.1.3.04-0380','03526.30462.230126.1.3.19-1778','08515.54513.240126.1.3.18-5868','01665.96498.270126.1.1.19-5080']::text[]),
('22536813000133', '2025-12-01'::date, 'outros', 136905.60, NULL, NULL, false, NULL, 58297.52, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['25342.70439.230126.1.3.04-3340','14009.83451.230126.1.3.04-7126','35496.64570.230126.1.3.04-0380','03526.30462.230126.1.3.19-1778','08515.54513.240126.1.3.18-5868','01665.96498.270126.1.1.19-5080']::text[]),
('22536813000133', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 124628.93, NULL, NULL, false, NULL, 58297.52, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['25342.70439.230126.1.3.04-3340','14009.83451.230126.1.3.04-7126','35496.64570.230126.1.3.04-0380','03526.30462.230126.1.3.19-1778','08515.54513.240126.1.3.18-5868','01665.96498.270126.1.1.19-5080']::text[]),
('32254332000199', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 25303.49, 3162.94, 0.1250, false, NULL, 3162.94, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['37478.68134.270126.1.1.19-0597','18610.51180.290126.1.3.19-2723']::text[]),
('50250937000193', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 235457.45, 35506.65, 0.1250, false, NULL, 35506.65, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['22899.53035.270126.1.1.19-0323','31873.69683.270126.1.3.19-8961','06161.76072.270126.1.1.18-9308']::text[]),
('50250937000193', '2025-12-01'::date, 'DCTWEB_trimestral', 48595.79, NULL, NULL, false, NULL, 35506.65, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['22899.53035.270126.1.1.19-0323','31873.69683.270126.1.3.19-8961','06161.76072.270126.1.1.18-9308']::text[]),
('23672895000106', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 103255.42, 16018.72, 0.1250, false, NULL, 16018.72, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['30097.48283.160126.1.3.19-3338','00019.48046.270126.1.3.19-0646']::text[]),
('23672895000106', '2025-12-01'::date, 'DCTWEB_trimestral', 24894.38, NULL, NULL, false, NULL, 16018.72, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['30097.48283.160126.1.3.19-3338','00019.48046.270126.1.3.19-0646']::text[]),
('30807561000168', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 47901.71, 7762.78, 0.1250, false, NULL, 7762.78, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['04132.22811.270126.1.1.19-0703','07585.20794.270126.1.3.19-2363','10598.28328.270126.1.3.19-6070']::text[]),
('30807561000168', '2025-12-01'::date, 'DCTWEB_trimestral', 14200.53, NULL, NULL, false, NULL, 7762.78, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['04132.22811.270126.1.1.19-0703','07585.20794.270126.1.3.19-2363','10598.28328.270126.1.3.19-6070']::text[]),
('28732157000120', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 179096.94, 26270.70, 0.1250, false, NULL, 26270.70, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['13632.17123.270126.1.3.19-1696','05937.54906.270126.1.1.19-7594','15999.16611.270126.1.3.19-8479']::text[]),
('28732157000120', '2025-12-01'::date, 'DCTWEB_trimestral', 31068.65, NULL, NULL, false, NULL, 26270.70, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['13632.17123.270126.1.3.19-1696','05937.54906.270126.1.1.19-7594','15999.16611.270126.1.3.19-8479']::text[]),
('17479543000136', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 46566.94, 6825.24, 0.1250, false, NULL, 6825.24, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['21944.39559.270126.1.1.19-7641','38713.19911.270126.1.3.19-8890','37425.08119.270126.1.3.19-9802']::text[]),
('17479543000136', '2025-12-01'::date, 'DCTWEB_trimestral', 8034.99, NULL, NULL, false, NULL, 6825.24, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['21944.39559.270126.1.1.19-7641','38713.19911.270126.1.3.19-8890','37425.08119.270126.1.3.19-9802']::text[]),
('05904970000135', '2025-12-01'::date, 'INSS_52', 12616.09, 2523.22, 0.2000, false, NULL, 2523.22, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['33199.62621.160126.1.3.19-6938']::text[]),
('05904978000100', '2025-12-01'::date, 'INSS_52', 944.88, 188.98, 0.2000, false, NULL, 188.98, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['40088.79112.160126.1.3.19-3906']::text[]),
('13373989000120', '2025-12-01'::date, 'INSS_52', 5527.42, 1105.48, 0.2000, false, NULL, 1105.48, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['33465.68752.160126.1.3.19-6231']::text[]),
('20782168000103', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 18484.66, 3696.93, 0.2000, false, NULL, 3696.93, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['24591.17799.290126.1.3.19-6281']::text[]),
('30285758000184', '2025-12-01'::date, 'IRPJ_CSLL_agregado', 9678.78, 1935.76, 0.2000, false, NULL, 1935.76, 'Importado via SQL fluxo (fluxo caixa jan 2026, variante antigo)', ARRAY['07278.67239.290126.1.1.19-9085','36050.46345.290126.1.3.19-0817']::text[]),
('30140610000151', '2026-01-01'::date, 'INSS_52', 147729.32, 33727.81, 0.1500, false, NULL, 33727.81, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('30140610000151', '2026-01-01'::date, 'outros', 77122.77, NULL, NULL, false, NULL, 33727.81, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('29056262000150', '2026-01-01'::date, 'INSS_52', 29275.87, 4555.49, 0.1250, false, NULL, 4555.49, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('29056262000150', '2026-01-01'::date, 'outros', 7168.03, NULL, NULL, false, NULL, 4555.49, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('15580294000145', '2026-01-01'::date, 'INSS_52', 39241.90, 4905.24, 0.1250, false, NULL, 4905.24, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('50547492000108', '2026-01-01'::date, 'INSS_52', 98469.37, 14509.25, 0.1250, false, NULL, 14509.25, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('50547492000108', '2026-01-01'::date, 'outros', 17604.63, NULL, NULL, false, NULL, 14509.25, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('16564133000120', '2026-01-01'::date, 'INSS_52', 87135.15, 18471.03, 0.1500, false, NULL, 18471.03, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('16564133000120', '2026-01-01'::date, 'outros', 45844.23, NULL, NULL, false, NULL, 18471.03, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('00569560000161', '2026-01-01'::date, 'INSS_52', 43868.49, 13267.31, 0.2000, false, NULL, 13267.31, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('00569560000161', '2026-01-01'::date, 'outros', 22468.04, NULL, NULL, false, NULL, 13267.31, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('22546657000191', '2026-01-01'::date, 'INSS_52', 24410.75, 4882.15, 0.2000, false, NULL, 4882.15, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('09633032000107', '2026-01-01'::date, 'INSS_52', 23946.17, 3845.35, 0.1500, false, NULL, 3845.35, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('09633032000107', '2026-01-01'::date, 'outros', 1689.48, NULL, NULL, false, NULL, 3845.35, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('11304945000113', '2026-01-01'::date, 'INSS_52', 100063.26, 18319.16, 0.1500, false, NULL, 18319.16, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('11304945000113', '2026-01-01'::date, 'outros', 22064.50, NULL, NULL, false, NULL, 18319.16, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('05229674000186', '2026-01-01'::date, 'INSS_52', 34521.09, 9178.38, 0.2000, false, NULL, 9178.38, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('05229674000186', '2026-01-01'::date, 'outros', 11370.83, NULL, NULL, false, NULL, 9178.38, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('26061062000105', '2026-01-01'::date, 'INSS_52', 2070.83, 414.17, 0.2000, false, NULL, 414.17, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('31224769000117', '2026-01-01'::date, 'INSS_52', 35201.03, 18759.60, 0.2000, false, NULL, 18759.60, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('31224769000117', '2026-01-01'::date, 'outros', 58596.95, NULL, NULL, false, NULL, 18759.60, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('36525319000188', '2026-01-01'::date, 'INSS_52', 340788.89, 34078.89, 0.1000, false, NULL, 34078.89, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('22536813000133', '2026-01-01'::date, 'INSS_52', 122421.26, 30311.13, 0.1500, false, NULL, 30311.13, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('22536813000133', '2026-01-01'::date, 'outros', 79652.93, NULL, NULL, false, NULL, 30311.13, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('32254332000199', '2026-01-01'::date, 'INSS_52', 1853.70, 1365.78, 0.1250, false, NULL, 1365.78, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('32254332000199', '2026-01-01'::date, 'outros', 9072.54, NULL, NULL, false, NULL, 1365.78, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('50250937000193', '2026-01-01'::date, 'INSS_52', 448.15, 56.02, 0.1250, false, NULL, 56.02, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('23672895000106', '2026-01-01'::date, 'INSS_52', 256.85, 3514.38, 0.1250, false, NULL, 3514.38, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('23672895000106', '2026-01-01'::date, 'outros', 27858.18, NULL, NULL, false, NULL, 3514.38, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('30807561000168', '2026-01-01'::date, 'INSS_52', 242.57, 30.32, 0.1250, false, NULL, 30.32, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('28732157000120', '2026-01-01'::date, 'INSS_52', 1274.14, 1840.74, 0.1250, false, NULL, 1840.74, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('28732157000120', '2026-01-01'::date, 'outros', 13451.80, NULL, NULL, false, NULL, 1840.74, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('17479543000136', '2026-01-01'::date, 'INSS_52', 2771.87, 346.48, 0.1250, false, NULL, 346.48, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('05904970000135', '2026-01-01'::date, 'INSS_52', 12760.99, 2552.20, 0.2000, false, NULL, 2552.20, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('05904978000100', '2026-01-01'::date, 'INSS_52', 704.68, 140.94, 0.2000, false, NULL, 140.94, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('13373989000120', '2026-01-01'::date, 'INSS_52', 5938.74, 1187.75, 0.2000, false, NULL, 1187.75, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('20782168000103', '2026-01-01'::date, 'INSS_52', 8505.02, 2109.40, 0.2000, false, NULL, 2109.40, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('20782168000103', '2026-01-01'::date, 'outros', 2041.96, NULL, NULL, false, NULL, 2109.40, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('30285758000184', '2026-01-01'::date, 'INSS_52', 6738.45, 1582.05, 0.2000, false, NULL, 1582.05, 'Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('30285758000184', '2026-01-01'::date, 'outros', 1171.78, NULL, NULL, false, NULL, 1582.05, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('10440200000119', '2026-01-01'::date, 'outros', 18905.27, 3781.05, 0.0000, false, NULL, NULL, 'PIS_COFINS agregado — importado do formato antigo | Importado via SQL fluxo (fluxo caixa fev 2026, variante antigo)', '{}'::text[]),
('30140610000151', '2026-02-01'::date, 'INSS_52', 140341.11, 36704.97, 0.1500, false, NULL, 36704.97, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('30140610000151', '2026-02-01'::date, 'outros', 104358.68, NULL, NULL, false, NULL, 36704.97, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('29056262000150', '2026-02-01'::date, 'INSS_52', 30886.84, 4752.67, 0.1250, false, NULL, 4752.67, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('29056262000150', '2026-02-01'::date, 'outros', 7134.54, NULL, NULL, false, NULL, 4752.67, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('15580294000145', '2026-02-01'::date, 'INSS_52', 40274.56, 5034.32, 0.1250, false, NULL, 5034.32, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('50547492000108', '2026-02-01'::date, 'INSS_52', 100631.24, 16967.86, 0.1250, false, NULL, 16967.86, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('50547492000108', '2026-02-01'::date, 'outros', 35111.61, NULL, NULL, false, NULL, 16967.86, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('16564133000120', '2026-02-01'::date, 'INSS_52', 90043.84, 17686.47, 0.1500, false, NULL, 17686.47, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('16564133000120', '2026-02-01'::date, 'outros', 37705.17, NULL, NULL, false, NULL, 17686.47, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('00569560000161', '2026-02-01'::date, 'INSS_52', 58074.82, 15863.04, 0.2000, false, NULL, 15863.04, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('00569560000161', '2026-02-01'::date, 'outros', 21240.36, NULL, NULL, false, NULL, 15863.04, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('22546657000191', '2026-02-01'::date, 'INSS_52', 26136.44, 5227.29, 0.2000, false, NULL, 5227.29, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('09633032000107', '2026-02-01'::date, 'INSS_52', 24199.82, 3932.39, NULL, false, NULL, 3932.39, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('09633032000107', '2026-02-01'::date, 'outros', 2016.12, NULL, NULL, false, NULL, 3932.39, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('11304945000113', '2026-02-01'::date, 'INSS_52', 102481.83, 17245.41, 0.1500, false, NULL, 17245.41, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('11304945000113', '2026-02-01'::date, 'outros', 12487.58, NULL, NULL, false, NULL, 17245.41, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('05229674000186', '2026-02-01'::date, 'INSS_52', 33925.27, 8523.44, 0.2000, false, NULL, 8523.44, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('05229674000186', '2026-02-01'::date, 'outros', 8691.92, NULL, NULL, false, NULL, 8523.44, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('26061062000105', '2026-02-01'::date, 'INSS_52', 2765.04, 553.01, 0.2000, false, NULL, 553.01, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('31224769000117', '2026-02-01'::date, 'INSS_52', 36114.03, 16633.89, 0.2000, false, NULL, 16633.89, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('31224769000117', '2026-02-01'::date, 'outros', 47055.43, NULL, NULL, false, NULL, 16633.89, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('22536813000133', '2026-02-01'::date, 'INSS_52', 122454.89, 27580.72, 0.1500, false, NULL, 27580.72, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('22536813000133', '2026-02-01'::date, 'outros', 61416.59, NULL, NULL, false, NULL, 27580.72, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('32254332000199', '2026-02-01'::date, 'INSS_52', 1913.13, 239.14, 0.1250, false, NULL, 239.14, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('50250937000193', '2026-02-01'::date, 'INSS_52', 841.50, 2805.87, 0.1250, false, NULL, 2805.87, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('50250937000193', '2026-02-01'::date, 'outros', 21605.47, NULL, NULL, false, NULL, 2805.87, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('23672895000106', '2026-02-01'::date, 'INSS_52', 574.58, 71.82, 0.1250, false, NULL, 71.82, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('30807561000168', '2026-02-01'::date, 'INSS_52', 101.39, 12.67, 0.1250, false, NULL, 12.67, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('28732157000120', '2026-02-01'::date, 'INSS_52', 3831.28, 478.91, 0.1250, false, NULL, 478.91, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('17479543000136', '2026-02-01'::date, 'INSS_52', 2660.94, 332.62, 0.1250, false, NULL, 332.62, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('05904970000135', '2026-02-01'::date, 'INSS_52', 17243.69, 3448.74, 0.2000, false, NULL, 3448.74, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('05904978000100', '2026-02-01'::date, 'INSS_52', 2015.54, 403.11, 0.2000, false, NULL, 403.11, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('13373989000120', '2026-02-01'::date, 'INSS_52', 6771.93, 1354.39, 0.2000, false, NULL, 1354.39, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('20782168000103', '2026-02-01'::date, 'INSS_52', 9143.04, 2687.64, 0.2000, false, NULL, 2687.64, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('20782168000103', '2026-02-01'::date, 'outros', 4295.18, NULL, NULL, false, NULL, 2687.64, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('30285758000184', '2026-02-01'::date, 'INSS_52', 7306.73, 2178.07, 0.2000, false, NULL, 2178.07, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('30285758000184', '2026-02-01'::date, 'outros', 3583.62, NULL, NULL, false, NULL, 2178.07, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('03307464000133', '2026-02-01'::date, 'INSS_52', 69999.75, 13999.95, 0.2000, false, NULL, 13999.95, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('15202462000169', '2026-02-01'::date, 'INSS_52', 157151.32, 46239.15, 0.2000, false, NULL, 46239.15, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('15202462000169', '2026-02-01'::date, 'outros', 74044.45, NULL, NULL, false, NULL, 46239.15, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('10440200000119', '2026-02-01'::date, 'INSS_52', 15663.29, 5421.16, 0.2000, false, NULL, 5421.16, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('10440200000119', '2026-02-01'::date, 'outros', 11442.51, NULL, NULL, false, NULL, 5421.16, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('32352751000163', '2026-02-01'::date, 'INSS_52', 863529.85, 224899.15, 0.1000, false, NULL, 224899.15, 'Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('32352751000163', '2026-02-01'::date, 'outros', 260965.90, NULL, NULL, false, NULL, 224899.15, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa mar 2026, variante transicao)', '{}'::text[]),
('30140610000151', '2026-03-01'::date, 'INSS_52', 142323.01, 180377.11, 0.1500, false, NULL, 180377.11, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('30140610000151', '2026-03-01'::date, 'outros', 78314.52, NULL, NULL, false, NULL, 180377.11, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('30140610000151', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 981876.55, NULL, NULL, false, NULL, 180377.11, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('29056262000150', '2026-03-01'::date, 'INSS_52', 29725.33, 5350.19, 0.1250, true, NULL, 5350.19, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('29056262000150', '2026-03-01'::date, 'outros', 7882.40, NULL, NULL, true, NULL, 5350.19, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('29056262000150', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 5193.81, NULL, NULL, true, NULL, 5350.19, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('15580294000145', '2026-03-01'::date, 'INSS_52', 40430.77, 14736.53, 0.1250, true, NULL, 14736.53, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('15580294000145', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 77461.46, NULL, NULL, true, NULL, 14736.53, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('50547492000108', '2026-03-01'::date, 'INSS_52', 106181.10, 21273.20, 0.1250, false, NULL, 21273.20, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('50547492000108', '2026-03-01'::date, 'outros', 28847.29, NULL, NULL, false, NULL, 21273.20, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('50547492000108', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 35157.19, NULL, NULL, false, NULL, 21273.20, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('16564133000120', '2026-03-01'::date, 'INSS_52', 90697.81, 20215.42, 0.1500, false, NULL, 20215.42, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('16564133000120', '2026-03-01'::date, 'outros', 44071.69, NULL, NULL, false, NULL, 20215.42, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('00569560000161', '2026-03-01'::date, 'INSS_52', 59270.24, 17943.33, 0.2000, true, NULL, 17943.33, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('00569560000161', '2026-03-01'::date, 'outros', 7301.88, NULL, NULL, true, NULL, 17943.33, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('00569560000161', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 23144.54, NULL, NULL, true, NULL, 17943.33, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('22546657000191', '2026-03-01'::date, 'INSS_52', 25992.74, 14708.45, 0.2000, true, NULL, 14708.45, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('22546657000191', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 47549.53, NULL, NULL, true, NULL, 14708.45, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('09633032000107', '2026-03-01'::date, 'INSS_52', 24604.93, 9955.33, 0.1500, true, NULL, 9955.33, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('09633032000107', '2026-03-01'::date, 'outros', 1086.91, NULL, NULL, true, NULL, 9955.33, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('09633032000107', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 40677.02, NULL, NULL, true, NULL, 9955.33, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('11304945000113', '2026-03-01'::date, 'INSS_52', 107640.38, 56769.01, 0.1500, true, NULL, 56769.01, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('11304945000113', '2026-03-01'::date, 'outros', 39009.66, NULL, NULL, true, NULL, 56769.01, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('11304945000113', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 231810.01, NULL, NULL, true, NULL, 56769.01, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('05229674000186', '2026-03-01'::date, 'INSS_52', 33369.21, 35413.60, 0.2000, false, NULL, 35413.60, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('05229674000186', '2026-03-01'::date, 'outros', 6280.16, NULL, NULL, false, NULL, 35413.60, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('05229674000186', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 137418.64, NULL, NULL, false, NULL, 35413.60, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('26061062000105', '2026-03-01'::date, 'INSS_52', 2798.61, 11378.64, 0.2000, true, NULL, 11378.64, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('26061062000105', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 54094.61, NULL, NULL, true, NULL, 11378.64, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('31224769000117', '2026-03-01'::date, 'INSS_52', 37572.30, 56175.64, 0.2000, true, NULL, 56175.64, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('31224769000117', '2026-03-01'::date, 'outros', 25432.79, NULL, NULL, true, NULL, 56175.64, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('31224769000117', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 217873.13, NULL, NULL, true, NULL, 56175.64, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('22536813000133', '2026-03-01'::date, 'INSS_52', 125416.70, 34260.95, 0.1500, true, NULL, 34260.95, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('22536813000133', '2026-03-01'::date, 'outros', 19386.25, NULL, NULL, true, NULL, 34260.95, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('22536813000133', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 83603.41, NULL, NULL, true, NULL, 34260.95, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('32254332000199', '2026-03-01'::date, 'INSS_52', 2017.35, 252.17, 0.1250, false, NULL, 252.17, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('50250937000193', '2026-03-01'::date, 'INSS_52', 1242.82, 2287.07, 0.1250, false, NULL, 2287.07, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('50250937000193', '2026-03-01'::date, 'outros', 17053.76, NULL, NULL, false, NULL, 2287.07, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('23672895000106', '2026-03-01'::date, 'INSS_52', 637.98, 1631.63, 0.1250, false, NULL, 1631.63, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('23672895000106', '2026-03-01'::date, 'outros', 12415.08, NULL, NULL, false, NULL, 1631.63, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('30807561000168', '2026-03-01'::date, 'INSS_52', 407.92, 50.99, 0.1250, false, NULL, 50.99, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('28732157000120', '2026-03-01'::date, 'INSS_52', 3103.64, 5036.01, 0.1250, false, NULL, 5036.01, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('28732157000120', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 37184.46, NULL, NULL, false, NULL, 5036.01, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('17479543000136', '2026-03-01'::date, 'INSS_52', 2863.09, 793.56, 0.1250, false, NULL, 793.56, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('17479543000136', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 3485.36, NULL, NULL, false, NULL, 793.56, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('05904970000135', '2026-03-01'::date, 'INSS_52', 17850.26, 8766.79, 0.2000, false, NULL, 8766.79, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('05904970000135', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 25983.70, NULL, NULL, false, NULL, 8766.79, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('05904978000100', '2026-03-01'::date, 'INSS_52', 1829.81, 365.96, 0.2000, false, NULL, 365.96, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('13373989000120', '2026-03-01'::date, 'INSS_52', 7818.50, 2553.67, 0.2000, false, NULL, 2553.67, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('13373989000120', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 4949.87, NULL, NULL, false, NULL, 2553.67, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('20782168000103', '2026-03-01'::date, 'INSS_52', 8333.29, 4863.85, 0.2000, true, NULL, 4863.85, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('20782168000103', '2026-03-01'::date, 'outros', 4064.07, NULL, NULL, true, NULL, 4863.85, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('20782168000103', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 11921.90, NULL, NULL, true, NULL, 4863.85, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('30285758000184', '2026-03-01'::date, 'INSS_52', 6799.92, 3167.01, 0.2000, true, NULL, 3167.01, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('30285758000184', '2026-03-01'::date, 'outros', 634.16, NULL, NULL, true, NULL, 3167.01, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('30285758000184', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 8400.99, NULL, NULL, true, NULL, 3167.01, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('10440200000119', '2026-03-01'::date, 'INSS_52', 16077.16, 6614.32, 0.2500, false, NULL, 6614.32, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('10440200000119', '2026-03-01'::date, 'outros', 10380.12, NULL, NULL, false, NULL, 6614.32, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('32352751000163', '2026-03-01'::date, 'INSS_52', 829466.43, 128183.88, 0.1000, false, NULL, 128183.88, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('32352751000163', '2026-03-01'::date, 'outros', 40439.49, NULL, NULL, false, NULL, 128183.88, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('32352751000163', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 411932.89, NULL, NULL, false, NULL, 128183.88, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('04782837000190', '2026-03-01'::date, 'INSS_52', 87026.52, 111606.72, 0.1000, false, NULL, 111606.72, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('04782837000190', '2026-03-01'::date, 'outros', 14551.41, NULL, NULL, false, NULL, 111606.72, 'PIS_COFINS agregado — importado do formato transição | Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('04782837000190', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 456455.66, NULL, NULL, false, NULL, 111606.72, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('33333713000126', '2026-03-01'::date, 'IRPJ_CSLL_agregado', 7751.06, 1550.21, 0.2000, false, NULL, 1550.21, 'Importado via SQL fluxo (fluxo caixa abr 2026, variante transicao)', '{}'::text[]),
('30140610000151', '2026-04-01'::date, 'INSS_52', 155723.03, 36031.86, 0.1500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30140610000151', '2026-04-01'::date, 'INSS_retidos', 1366.58, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30140610000151', '2026-04-01'::date, 'PIS', 14635.95, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30140610000151', '2026-04-01'::date, 'COFINS', 68486.84, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('29056262000150', '2026-04-01'::date, 'INSS_52', 34022.48, 5320.92, 0.1250, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('29056262000150', '2026-04-01'::date, 'INSS_retidos', 59.51, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('29056262000150', '2026-04-01'::date, 'PIS', 1513.61, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('29056262000150', '2026-04-01'::date, 'COFINS', 6971.77, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('15580294000145', '2026-04-01'::date, 'INSS_52', 41606.52, 5220.54, 0.1250, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('15580294000145', '2026-04-01'::date, 'INSS_retidos', 157.79, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('50547492000108', '2026-04-01'::date, 'INSS_52', 103620.96, 17374.38, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('50547492000108', '2026-04-01'::date, 'INSS_retidos', 276.79, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('50547492000108', '2026-04-01'::date, 'PIS', 6071.46, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('50547492000108', '2026-04-01'::date, 'COFINS', 29025.84, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('16564133000120', '2026-04-01'::date, 'INSS_52', 98959.22, 28398.84, 0.1500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('16564133000120', '2026-04-01'::date, 'INSS_retidos', 344.32, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('16564133000120', '2026-04-01'::date, 'PIS', 16056.33, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('16564133000120', '2026-04-01'::date, 'COFINS', 73965.70, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('00569560000161', '2026-04-01'::date, 'INSS_52', 63574.60, 16224.42, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('00569560000161', '2026-04-01'::date, 'INSS_retidos', 174.37, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('00569560000161', '2026-04-01'::date, 'PIS', 3078.48, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('00569560000161', '2026-04-01'::date, 'COFINS', 14294.63, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('22546657000191', '2026-04-01'::date, 'INSS_52', 25907.59, 5220.27, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('22546657000191', '2026-04-01'::date, 'INSS_retidos', 193.77, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('09633032000107', '2026-04-01'::date, 'INSS_52', 27872.31, 6672.06, 0.1500, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('09633032000107', '2026-04-01'::date, 'INSS_retidos', 78.19, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('09633032000107', '2026-04-01'::date, 'PIS', 2943.29, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('09633032000107', '2026-04-01'::date, 'COFINS', 13586.60, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('11304945000113', '2026-04-01'::date, 'INSS_52', 112436.02, 36182.45, 0.1500, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('11304945000113', '2026-04-01'::date, 'INSS_retidos', 6677.17, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('11304945000113', '2026-04-01'::date, 'PIS', 21475.23, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('11304945000113', '2026-04-01'::date, 'COFINS', 100627.92, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('05229674000186', '2026-04-01'::date, 'INSS_52', 31698.61, 9588.70, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('05229674000186', '2026-04-01'::date, 'INSS_retidos', 189.96, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('05229674000186', '2026-04-01'::date, 'PIS', 2863.83, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('05229674000186', '2026-04-01'::date, 'COFINS', 13191.11, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('26061062000105', '2026-04-01'::date, 'INSS_52', 2444.87, 510.59, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('26061062000105', '2026-04-01'::date, 'INSS_retidos', 108.08, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('31224769000117', '2026-04-01'::date, 'INSS_52', 38249.67, 18649.59, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('31224769000117', '2026-04-01'::date, 'PIS', 9810.13, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('31224769000117', '2026-04-01'::date, 'COFINS', 45188.16, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('22536813000133', '2026-04-01'::date, 'INSS_52', 128955.81, 29580.58, 0.1500, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('22536813000133', '2026-04-01'::date, 'INSS_retidos', 390.56, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('22536813000133', '2026-04-01'::date, 'PIS', 11944.56, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('22536813000133', '2026-04-01'::date, 'COFINS', 55912.94, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('32254332000199', '2026-04-01'::date, 'INSS_52', 19.23, 610.13, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('32254332000199', '2026-04-01'::date, 'INSS_retidos', 4861.82, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('50250937000193', '2026-04-01'::date, 'INSS_52', 206.45, 8926.19, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('50250937000193', '2026-04-01'::date, 'INSS_retidos', 3634.14, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('50250937000193', '2026-04-01'::date, 'PIS', 11769.04, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('50250937000193', '2026-04-01'::date, 'COFINS', 55799.90, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('23672895000106', '2026-04-01'::date, 'INSS_52', 47.51, 4494.16, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('23672895000106', '2026-04-01'::date, 'INSS_retidos', 24.77, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('23672895000106', '2026-04-01'::date, 'PIS', 6313.88, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('23672895000106', '2026-04-01'::date, 'COFINS', 29567.11, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30807561000168', '2026-04-01'::date, 'INSS_52', 119.65, 27.58, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30807561000168', '2026-04-01'::date, 'INSS_retidos', 100.97, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('28732157000120', '2026-04-01'::date, 'INSS_52', 213.73, 107.15, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('28732157000120', '2026-04-01'::date, 'INSS_retidos', 643.48, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('17479543000136', '2026-04-01'::date, 'INSS_52', 705.53, 546.54, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('17479543000136', '2026-04-01'::date, 'INSS_retidos', 3666.76, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('05904970000135', '2026-04-01'::date, 'INSS_52', 20710.36, 4142.07, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('05904978000100', '2026-04-01'::date, 'INSS_52', 1698.00, 339.60, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('13373989000120', '2026-04-01'::date, 'INSS_52', 8551.88, 1710.38, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('20782168000103', '2026-04-01'::date, 'INSS_52', 9053.79, 2091.06, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('20782168000103', '2026-04-01'::date, 'INSS_retidos', 399.88, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('20782168000103', '2026-04-01'::date, 'PIS', 170.26, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('20782168000103', '2026-04-01'::date, 'COFINS', 831.38, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30285758000184', '2026-04-01'::date, 'INSS_52', 6628.12, 2017.88, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30285758000184', '2026-04-01'::date, 'INSS_retidos', 324.60, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30285758000184', '2026-04-01'::date, 'PIS', 551.03, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30285758000184', '2026-04-01'::date, 'COFINS', 2585.66, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('10440200000119', '2026-04-01'::date, 'INSS_52', 18476.46, 7670.07, 0.2500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('10440200000119', '2026-04-01'::date, 'PIS', 2175.41, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('10440200000119', '2026-04-01'::date, 'COFINS', 10028.42, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('32352751000163', '2026-04-01'::date, 'INSS_52', 848058.33, 94860.73, 0.1000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('32352751000163', '2026-04-01'::date, 'INSS_retidos', 26148.80, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('32352751000163', '2026-04-01'::date, 'PIS', 13271.38, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('32352751000163', '2026-04-01'::date, 'COFINS', 61128.81, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('04782837000190', '2026-04-01'::date, 'INSS_52', 91002.84, 21444.89, 0.1000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('04782837000190', '2026-04-01'::date, 'PIS', 2888.79, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('04782837000190', '2026-04-01'::date, 'COFINS', 13332.84, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('33333713000126', '2026-04-01'::date, 'INSS_52', 586.38, 117.28, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('18343960000110', '2026-04-01'::date, 'INSS_52', 15410.88, 3084.59, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('18343960000110', '2026-04-01'::date, 'INSS_retidos', 12.08, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa maio 2026, variante novo)', '{}'::text[]),
('30140610000151', '2026-05-01'::date, 'INSS_52', 142926.78, 67500.02, 0.1500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30140610000151', '2026-05-01'::date, 'INSS_retidos', 1134.91, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30140610000151', '2026-05-01'::date, 'PIS', 18859.35, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30140610000151', '2026-05-01'::date, 'COFINS', 87451.57, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30140610000151', '2026-05-01'::date, 'ICMS', 199627.51, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('29056262000150', '2026-05-01'::date, 'INSS_52', 33669.68, 5341.03, 0.1250, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('29056262000150', '2026-05-01'::date, 'INSS_retidos', 59.51, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('29056262000150', '2026-05-01'::date, 'PIS', 1605.24, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('29056262000150', '2026-05-01'::date, 'COFINS', 7393.83, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('15580294000145', '2026-05-01'::date, 'INSS_52', 42316.95, 5308.20, 0.1250, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('15580294000145', '2026-05-01'::date, 'INSS_retidos', 148.67, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50547492000108', '2026-05-01'::date, 'INSS_52', 104040.40, 17340.79, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50547492000108', '2026-05-01'::date, 'INSS_retidos', 386.22, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50547492000108', '2026-05-01'::date, 'PIS', 6016.42, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50547492000108', '2026-05-01'::date, 'COFINS', 28283.32, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('16564133000120', '2026-05-01'::date, 'INSS_52', 96496.85, 21107.32, 0.1500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('16564133000120', '2026-05-01'::date, 'INSS_retidos', 241.70, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('16564133000120', '2026-05-01'::date, 'PIS', 7799.51, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('16564133000120', '2026-05-01'::date, 'COFINS', 36177.43, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('00569560000161', '2026-05-01'::date, 'INSS_52', 62557.34, 16319.46, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('00569560000161', '2026-05-01'::date, 'INSS_retidos', 178.64, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('00569560000161', '2026-05-01'::date, 'PIS', 3343.95, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('00569560000161', '2026-05-01'::date, 'COFINS', 15517.39, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('22546657000191', '2026-05-01'::date, 'INSS_52', 26880.95, 26307.84, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('22546657000191', '2026-05-01'::date, 'INSS_retidos', 244.92, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('22546657000191', '2026-05-01'::date, 'ICMS', 104413.35, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('09633032000107', '2026-05-01'::date, 'INSS_52', 24948.56, 5348.96, 0.1500, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('09633032000107', '2026-05-01'::date, 'INSS_retidos', 78.19, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('09633032000107', '2026-05-01'::date, 'PIS', 1890.30, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('09633032000107', '2026-05-01'::date, 'COFINS', 8742.68, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('11304945000113', '2026-05-01'::date, 'INSS_52', 113987.80, 27376.35, 0.1500, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('11304945000113', '2026-05-01'::date, 'INSS_retidos', 6743.32, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('11304945000113', '2026-05-01'::date, 'PIS', 10823.67, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('11304945000113', '2026-05-01'::date, 'COFINS', 50954.24, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('05229674000186', '2026-05-01'::date, 'INSS_52', 32542.68, 8818.85, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('05229674000186', '2026-05-01'::date, 'INSS_retidos', 215.58, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('05229674000186', '2026-05-01'::date, 'PIS', 2022.10, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('05229674000186', '2026-05-01'::date, 'COFINS', 9313.91, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('26061062000105', '2026-05-01'::date, 'INSS_52', 2879.73, 595.82, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('26061062000105', '2026-05-01'::date, 'INSS_retidos', 99.35, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('31224769000117', '2026-05-01'::date, 'INSS_52', 37644.79, 18828.20, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('31224769000117', '2026-05-01'::date, 'PIS', 10077.70, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('31224769000117', '2026-05-01'::date, 'COFINS', 46418.50, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('22536813000133', '2026-05-01'::date, 'INSS_52', 128031.50, 37062.87, 0.1500, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('22536813000133', '2026-05-01'::date, 'INSS_retidos', 380.45, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('22536813000133', '2026-05-01'::date, 'PIS', 21074.13, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('22536813000133', '2026-05-01'::date, 'COFINS', 97599.75, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('32254332000199', '2026-05-01'::date, 'INSS_52', 15.17, 827.99, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('32254332000199', '2026-05-01'::date, 'INSS_retidos', 6608.76, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50250937000193', '2026-05-01'::date, 'INSS_52', 607.47, 9503.62, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50250937000193', '2026-05-01'::date, 'INSS_retidos', 516.60, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50250937000193', '2026-05-01'::date, 'PIS', 13329.52, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('50250937000193', '2026-05-01'::date, 'COFINS', 61575.39, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('23672895000106', '2026-05-01'::date, 'INSS_52', 57.41, 3906.18, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('23672895000106', '2026-05-01'::date, 'INSS_retidos', 25.79, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('23672895000106', '2026-05-01'::date, 'PIS', 5545.84, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('23672895000106', '2026-05-01'::date, 'COFINS', 25620.44, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30807561000168', '2026-05-01'::date, 'INSS_52', 170.44, 33.86, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30807561000168', '2026-05-01'::date, 'INSS_retidos', 100.40, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('28732157000120', '2026-05-01'::date, 'INSS_52', 227.31, 56.61, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('28732157000120', '2026-05-01'::date, 'INSS_retidos', 225.57, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('17479543000136', '2026-05-01'::date, 'INSS_52', 661.28, 525.47, 0.1250, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('17479543000136', '2026-05-01'::date, 'INSS_retidos', 3542.50, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('05904970000135', '2026-05-01'::date, 'INSS_52', 19888.39, 3977.68, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('13373989000120', '2026-05-01'::date, 'INSS_52', 9716.70, 1943.34, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('20782168000103', '2026-05-01'::date, 'INSS_52', 8271.77, 2835.34, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('20782168000103', '2026-05-01'::date, 'INSS_retidos', 413.16, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('20782168000103', '2026-05-01'::date, 'PIS', 963.78, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('20782168000103', '2026-05-01'::date, 'COFINS', 4527.99, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30285758000184', '2026-05-01'::date, 'INSS_52', 6745.45, 1814.22, 0.2000, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30285758000184', '2026-05-01'::date, 'INSS_retidos', 324.60, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30285758000184', '2026-05-01'::date, 'PIS', 347.35, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('30285758000184', '2026-05-01'::date, 'COFINS', 1653.70, NULL, NULL, true, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('10440200000119', '2026-05-01'::date, 'INSS_52', 17244.66, 7161.50, 0.2500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('10440200000119', '2026-05-01'::date, 'PIS', 2033.67, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('10440200000119', '2026-05-01'::date, 'COFINS', 9367.68, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('32352751000163', '2026-05-01'::date, 'INSS_52', 765685.66, 79709.18, 0.1000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('32352751000163', '2026-05-01'::date, 'INSS_retidos', 25429.05, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('32352751000163', '2026-05-01'::date, 'PIS', 1066.18, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('32352751000163', '2026-05-01'::date, 'COFINS', 4910.89, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('04782837000190', '2026-05-01'::date, 'INSS_52', 90060.07, 20903.40, 0.1000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('04782837000190', '2026-05-01'::date, 'PIS', 2574.52, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('04782837000190', '2026-05-01'::date, 'COFINS', 11882.39, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('33333713000126', '2026-05-01'::date, 'INSS_52', 901.63, 180.33, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('18343960000110', '2026-05-01'::date, 'INSS_52', 16356.09, 3273.63, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('18343960000110', '2026-05-01'::date, 'INSS_retidos', 12.08, NULL, NULL, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('28882587000129', '2026-05-01'::date, 'ICMS', 5538.45, 1384.61, 0.2500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );

INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
('28882587000200', '2026-05-01'::date, 'ICMS', 4789.61, 1197.40, 0.2500, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('68746239000149', '2026-05-01'::date, 'ICMS', 16739.69, 3347.94, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[]),
('68746239000220', '2026-05-01'::date, 'ICMS', 26947.52, 5389.50, 0.2000, false, NULL, NULL, 'Importado via SQL fluxo (fluxo caixa jun 2026, variante novo_icms)', '{}'::text[])
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );


-- Atualiza linhas existentes (tese_origem_id IS NULL — mesmo critério do import UI)
UPDATE public.compensacoes_mensais cm
SET
  valor_compensado = t.valor_compensado,
  tributo = t.tributo_enum,
  honorario_valor = COALESCE(t.honorario_valor, cm.honorario_valor),
  honorario_percentual = COALESCE(t.honorario_percentual, cm.honorario_percentual),
  lancado_mapa = t.lancado_mapa,
  vencimento_debito = COALESCE(t.vencimento_debito, cm.vencimento_debito),
  nfse_valor = COALESCE(t.nfse_valor, cm.nfse_valor),
  observacao = COALESCE(t.observacao, cm.observacao)
FROM tmp_comp_carga t
JOIN public.clientes c ON regexp_replace(c.cnpj, '\D', '', 'g') = t.cnpj
WHERE cm.cliente_id = c.id
  AND cm.mes_referencia = t.mes_referencia
  AND cm.tributo_enum::text = t.tributo_enum
  AND cm.tese_origem_id IS NULL;

-- Insere novas
INSERT INTO public.compensacoes_mensais (
  cliente_id, mes_referencia, tributo_enum, tributo, valor_compensado,
  honorario_valor, honorario_percentual, lancado_mapa, vencimento_debito,
  nfse_valor, observacao, processo_tese_id, tese_origem_id
)
SELECT
  c.id, t.mes_referencia, t.tributo_enum::public.tributo, t.tributo_enum, t.valor_compensado,
  t.honorario_valor, t.honorario_percentual, t.lancado_mapa, t.vencimento_debito,
  t.nfse_valor, t.observacao, NULL, NULL
FROM tmp_comp_carga t
JOIN public.clientes c ON regexp_replace(c.cnpj, '\D', '', 'g') = t.cnpj
WHERE NOT EXISTS (
  SELECT 1 FROM public.compensacoes_mensais cm
  WHERE cm.cliente_id = c.id
    AND cm.mes_referencia = t.mes_referencia
    AND cm.tributo_enum::text = t.tributo_enum
    AND cm.tese_origem_id IS NULL
);

-- DCOMPs vinculadas às compensações carregadas (DISTINCT evita 21000)
INSERT INTO public.dcomps (compensacao_id, numero_declaracao)
SELECT DISTINCT cm.id, d.numero
FROM tmp_comp_carga t
JOIN public.clientes c ON regexp_replace(c.cnpj, '\D', '', 'g') = t.cnpj
JOIN public.compensacoes_mensais cm
  ON cm.cliente_id = c.id
 AND cm.mes_referencia = t.mes_referencia
 AND cm.tributo_enum::text = t.tributo_enum
 AND cm.tese_origem_id IS NULL
CROSS JOIN LATERAL unnest(t.dcomps) AS d(numero)
WHERE d.numero IS NOT NULL AND btrim(d.numero) <> ''
ON CONFLICT (compensacao_id, numero_declaracao) DO NOTHING;

COMMIT;

-- Resumo esperado (após o Run, rode se quiser validar):
-- SELECT COUNT(*) FROM compensacoes_mensais WHERE observacao ILIKE '%Importado via SQL fluxo%';
-- SELECT empresa, credito_apurado_calculo, total_compensado_calculo, saldo_calculo
-- FROM v_cliente_totais_calculo WHERE empresa ILIKE '%MARAVISTA%';
