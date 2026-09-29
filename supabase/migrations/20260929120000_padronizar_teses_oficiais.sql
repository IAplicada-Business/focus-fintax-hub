-- Ajustes Grupo AGF (set/2026) · item 2 — lista de teses limpa e padronizada.
--
-- Ficam só as 6 teses oficiais, com estes nomes exatos:
--   INSUMOS         Insumos de PIS/COFINS
--   SUBVENCAO       Subvenção IRPJ/CSLL
--   PREVIDENCIARIO  Créditos Previdenciários
--   ICMS_ST         Exclusão ICMS-ST da base PIS/COFINS
--   PIS_COFINS_JUD  PIS/COFINS da Base — Via Judicial
--   REPORTO         Reporto
--
-- O que muda:
--   1. Backup (schema `backup`, fora do PostgREST) do que é reescrito.
--   2. `EXCLUSAO_ICMS_BC` é fundida em `PIS_COFINS_JUD`: créditos, tese de
--      origem das compensações e tese em uso do cliente migram ANTES de a
--      linha do catálogo ser apagada. O valor do enum fica (Postgres não
--      remove valor de enum), mas nenhuma linha usa mais.
--   3. Rótulos do catálogo = nomes oficiais.
--   4. `processos_teses.tese` passa a guardar o código do catálogo (antes:
--      `subvencao`, `subvencao_icms`, `SUBVENCAO`, `pis_cofins_insumos`,
--      `insumos`, `icms_st_bc_pis_cofins`, `exclusao_icms_st`, `pis_cofins_bc`…)
--      e `nome_exibicao` o nome oficial. Nenhum processo é apagado — o
--      vínculo cliente↔tese e as compensações (FK por id) ficam intactos.
--   5. Motor comercial mantém os slugs (calculadora/leads dependem deles);
--      só os rótulos são padronizados.
--   6. Campos do bloco "Situação fiscal" do novo Mapa Tributário (item 8).
--
-- Não mescla processos duplicados do mesmo cliente (16 clientes têm
-- `subvencao` + `subvencao_icms` com créditos diferentes): ver a consulta de
-- conferência no fim deste arquivo.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Backup
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS backup.processos_teses_20260929 AS
  SELECT id, cliente_id, tese, nome_exibicao, categoria, now() AS copiado_em
  FROM public.processos_teses;

CREATE TABLE IF NOT EXISTS backup.teses_tributarias_20260929 AS
  SELECT *, now() AS copiado_em FROM public.teses_tributarias;

CREATE TABLE IF NOT EXISTS backup.creditos_exclusao_icms_bc_20260929 AS
  SELECT ca.*, now() AS copiado_em
  FROM public.creditos_apurados ca
  JOIN public.teses_tributarias t ON t.id = ca.tese_id
  WHERE t.codigo = 'EXCLUSAO_ICMS_BC';

-- ---------------------------------------------------------------------------
-- 2. EXCLUSAO_ICMS_BC → PIS_COFINS_JUD
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_exc uuid;
  v_jud uuid;
BEGIN
  SELECT id INTO v_exc FROM public.teses_tributarias WHERE codigo = 'EXCLUSAO_ICMS_BC';
  SELECT id INTO v_jud FROM public.teses_tributarias WHERE codigo = 'PIS_COFINS_JUD';

  IF v_jud IS NULL THEN
    RAISE EXCEPTION 'Tese PIS_COFINS_JUD não encontrada no catálogo';
  END IF;

  IF v_exc IS NOT NULL THEN
    -- Cliente que já tem crédito judicial: soma na linha oficial.
    UPDATE public.creditos_apurados jud
       SET valor_apurado_inicial = jud.valor_apurado_inicial + exc.valor_apurado_inicial,
           valor_compensado_manual = CASE
             WHEN jud.valor_compensado_manual IS NULL AND exc.valor_compensado_manual IS NULL THEN NULL
             ELSE COALESCE(jud.valor_compensado_manual, 0) + COALESCE(exc.valor_compensado_manual, 0)
           END,
           incluir_no_calculo = jud.incluir_no_calculo OR exc.incluir_no_calculo,
           observacoes = concat_ws(' · ', jud.observacoes, 'Somado de "Exclusão ICMS base PIS/COFINS" (padronização 29/09/2026)'),
           atualizado_em = now()
      FROM public.creditos_apurados exc
     WHERE exc.tese_id = v_exc
       AND jud.tese_id = v_jud
       AND jud.cliente_id = exc.cliente_id;

    DELETE FROM public.creditos_apurados exc
     WHERE exc.tese_id = v_exc
       AND EXISTS (
         SELECT 1 FROM public.creditos_apurados jud
          WHERE jud.tese_id = v_jud AND jud.cliente_id = exc.cliente_id
       );

    -- Sem crédito judicial: a linha só troca de tese.
    UPDATE public.creditos_apurados
       SET tese_id = v_jud, atualizado_em = now()
     WHERE tese_id = v_exc;

    UPDATE public.compensacoes_mensais SET tese_origem_id = v_jud WHERE tese_origem_id = v_exc;
    UPDATE public.clientes SET tese_ativa_id = v_jud WHERE tese_ativa_id = v_exc;

    IF EXISTS (SELECT 1 FROM public.creditos_apurados WHERE tese_id = v_exc)
       OR EXISTS (SELECT 1 FROM public.compensacoes_mensais WHERE tese_origem_id = v_exc)
       OR EXISTS (SELECT 1 FROM public.clientes WHERE tese_ativa_id = v_exc) THEN
      RAISE EXCEPTION 'Ainda há vínculos com EXCLUSAO_ICMS_BC — abortando para não deixar órfão';
    END IF;

    DELETE FROM public.teses_tributarias WHERE id = v_exc;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Nomes oficiais no catálogo
-- ---------------------------------------------------------------------------
UPDATE public.teses_tributarias t
   SET label = v.label, atualizado_em = now()
  FROM (VALUES
    ('INSUMOS', 'Insumos de PIS/COFINS'),
    ('SUBVENCAO', 'Subvenção IRPJ/CSLL'),
    ('PREVIDENCIARIO', 'Créditos Previdenciários'),
    ('ICMS_ST', 'Exclusão ICMS-ST da base PIS/COFINS'),
    ('PIS_COFINS_JUD', 'PIS/COFINS da Base — Via Judicial'),
    ('REPORTO', 'Reporto')
  ) AS v(codigo, label)
 WHERE t.codigo::text = v.codigo;

-- ---------------------------------------------------------------------------
-- 4. Processos: código do catálogo + nome oficial
-- ---------------------------------------------------------------------------
-- Mesma regra de `normalizeTeseCatalogCodigo` (src/lib/clientes-constants.ts).
CREATE OR REPLACE FUNCTION public.tese_codigo_oficial(p_tese text, p_nome text DEFAULT '')
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH b AS (
    SELECT regexp_replace(lower(coalesce(p_tese, '') || ' ' || coalesce(p_nome, '')), '[\s-]+', '_', 'g') AS blob
  )
  SELECT CASE
    WHEN blob LIKE '%reporto%' THEN 'REPORTO'
    WHEN blob LIKE '%insumo%' THEN 'INSUMOS'
    WHEN blob LIKE '%subvenc%' OR blob LIKE '%subvenç%' THEN 'SUBVENCAO'
    WHEN blob LIKE '%icms_st%' OR blob LIKE '%icmsst%' THEN 'ICMS_ST'
    WHEN blob LIKE '%pis_cofins_jud%'
      OR (blob LIKE '%jud%' AND blob LIKE '%pis%')
      OR ((blob LIKE '%exclusao%' OR blob LIKE '%exclusão%') AND blob LIKE '%icms%')
      OR blob LIKE '%pis_cofins_bc%'
      OR blob LIKE '%pis/cofins_bc%'
      OR blob LIKE '%pis_cofins_da_base%'
      OR blob LIKE '%pis/cofins_da_base%' THEN 'PIS_COFINS_JUD'
    WHEN blob LIKE '%previdenc%' THEN 'PREVIDENCIARIO'
    ELSE NULL
  END
  FROM b;
$$;

WITH alvo AS (
  SELECT pt.id,
         public.tese_codigo_oficial(
           CASE WHEN pt.categoria = 'reporto' THEN 'reporto' ELSE pt.tese END,
           pt.nome_exibicao
         ) AS codigo
    FROM public.processos_teses pt
)
UPDATE public.processos_teses pt
   SET tese = alvo.codigo,
       nome_exibicao = t.label,
       categoria = CASE WHEN alvo.codigo = 'REPORTO' THEN 'reporto' ELSE pt.categoria END,
       atualizado_em = now()
  FROM alvo
  JOIN public.teses_tributarias t ON t.codigo::text = alvo.codigo
 WHERE pt.id = alvo.id
   AND alvo.codigo IS NOT NULL
   AND (pt.tese IS DISTINCT FROM alvo.codigo OR pt.nome_exibicao IS DISTINCT FROM t.label);

DO $$
DECLARE
  v_fora int;
BEGIN
  SELECT count(*) INTO v_fora
    FROM public.processos_teses
   WHERE tese NOT IN ('INSUMOS', 'SUBVENCAO', 'PREVIDENCIARIO', 'ICMS_ST', 'PIS_COFINS_JUD', 'REPORTO');
  IF v_fora > 0 THEN
    RAISE NOTICE '% processo(s) com tese fora das 6 oficiais — conferir manualmente (nada foi apagado).', v_fora;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Motor comercial: rótulos padronizados (slugs intocados)
-- ---------------------------------------------------------------------------
UPDATE public.motor_teses_config m
   SET nome_exibicao = t.label
  FROM public.teses_tributarias t
 WHERE m.ativo
   AND t.codigo::text = public.tese_codigo_oficial(m.tese, m.nome_exibicao)
   AND m.nome_exibicao IS DISTINCT FROM t.label;

-- ---------------------------------------------------------------------------
-- 6. Situação fiscal (bloco 03 do Mapa Tributário)
-- ---------------------------------------------------------------------------
ALTER TABLE public.teses_tributarias
  ADD COLUMN IF NOT EXISTS base_legal text,
  ADD COLUMN IF NOT EXISTS obrigacoes_retificadas text;

ALTER TABLE public.processos_teses
  ADD COLUMN IF NOT EXISTS situacao_fiscal text NOT NULL DEFAULT 'Regular e em conformidade',
  ADD COLUMN IF NOT EXISTS credito_tributario_status text NOT NULL DEFAULT 'Formalmente constituído',
  ADD COLUMN IF NOT EXISTS obrigacoes_retificadas text;

COMMENT ON COLUMN public.teses_tributarias.base_legal IS
  'Texto de base legal exibido no Mapa Tributário (bloco Situação fiscal).';
COMMENT ON COLUMN public.teses_tributarias.obrigacoes_retificadas IS
  'Obrigações acessórias retificadas por padrão nesta tese (ex.: ECF e DCTF).';
COMMENT ON COLUMN public.processos_teses.obrigacoes_retificadas IS
  'Sobrescreve teses_tributarias.obrigacoes_retificadas para este cliente.';

UPDATE public.teses_tributarias t
   SET base_legal = COALESCE(t.base_legal, v.base_legal),
       obrigacoes_retificadas = COALESCE(t.obrigacoes_retificadas, v.obrigacoes)
  FROM (VALUES
    ('INSUMOS',
     'Créditos de PIS/COFINS sobre insumos · Leis nº 10.637/2002 e 10.833/2003 · REsp 1.221.170/PR (STJ)',
     'EFD-Contribuições e DCTF'),
    ('SUBVENCAO',
     'Subvenção para investimento · Lei nº 12.973/2014 e LC 160/2017 · Exclusão da base de cálculo do IRPJ e da CSLL',
     'ECF e DCTF'),
    ('PREVIDENCIARIO',
     'Contribuições previdenciárias · Lei nº 8.212/1991 · Verbas indenizatórias e FAP/RAT',
     'DCTFWeb e eSocial'),
    ('ICMS_ST',
     'Exclusão do ICMS-ST da base do PIS/COFINS · Tema 1.125 (STJ)',
     'EFD-Contribuições e DCTF'),
    ('PIS_COFINS_JUD',
     'Exclusão do ICMS da base do PIS/COFINS · RE 574.706 · Tema 69 (STF)',
     'EFD-Contribuições e DCTF'),
    ('REPORTO',
     'REPORTO · Lei nº 11.033/2004 · Manutenção de créditos de PIS/COFINS',
     'EFD-Contribuições e PER/DCOMP')
  ) AS v(codigo, base_legal, obrigacoes)
 WHERE t.codigo::text = v.codigo;

COMMIT;

-- ---------------------------------------------------------------------------
-- Conferência (rodar antes e depois; o total por tese não pode cair):
--
--   SELECT tese, count(DISTINCT cliente_id) AS clientes, count(*) AS processos
--     FROM public.processos_teses GROUP BY 1 ORDER BY 1;
--
-- Clientes com mais de um processo da mesma tese (hoje: 16 em Subvenção).
-- Decidir caso a caso qual crédito vale antes de remover o duplicado:
--
--   SELECT c.empresa, pt.id, pt.nome_exibicao, pt.valor_credito,
--          pt.status_contrato, pt.status_processo,
--          (SELECT count(*) FROM public.compensacoes_mensais cm WHERE cm.processo_tese_id = pt.id) AS comps
--     FROM public.processos_teses pt
--     JOIN public.clientes c ON c.id = pt.cliente_id
--    WHERE (pt.cliente_id, pt.tese) IN (
--      SELECT cliente_id, tese FROM public.processos_teses GROUP BY 1, 2 HAVING count(*) > 1
--    )
--    ORDER BY c.empresa, pt.criado_em;
-- ---------------------------------------------------------------------------
