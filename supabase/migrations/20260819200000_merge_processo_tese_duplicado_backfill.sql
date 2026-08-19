-- ============================================================================
-- Corrige duplicidade criada pela migration anterior
-- (20260819194729_backfill_processo_tese_id_compensacoes_orfas.sql)
--
-- Aquela migration criava um processos_teses novo sempre que não achava um
-- com `tese` batendo EXATAMENTE com o código do catálogo (INSUMOS/SUBVENCAO/
-- ICMS_ST). Em alguns clientes já existia um processo equivalente cadastrado
-- manualmente com um slug diferente (ex.: "pis_cofins_insumos" em vez de
-- "INSUMOS", ou "subvencao_icms" em vez de "SUBVENCAO") — resultado: duas
-- linhas "PIS/COFINS Insumos" (ou "Subvenção ICMS") na aba Processos por
-- Tese do mesmo cliente, uma delas com R$ 0,00 de crédito.
--
-- Importante: só mescla quando o slug antigo é uma variação textual ÓBVIA do
-- mesmo código (pis_cofins_insumos = INSUMOS; subvencao_icms = SUBVENCAO).
-- NÃO mescla com slugs parecidos mas de tese diferente (ex.: "pis_cofins_bc"
-- = Exclusão de ICMS da base de cálculo, "icms_st_bc_pis_cofins" = ICMS-ST —
-- ambas teses distintas de Insumos, mesmo citando "pis"/"cofins" no nome).
--
-- Ação: move as compensações do processo novo (fantasma, sem crédito) pro
-- processo antigo (que já tem crédito/honorário configurados) e apaga o
-- fantasma. Idempotente: só mexe em processos criados pela migration anterior
-- (criado_em == mesmo instante da rodada) que ainda tiverem esse par exato.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_merge_pares ON COMMIT DROP AS
SELECT
  g.id AS ghost_id,
  sib.id AS sibling_id
FROM public.processos_teses g
JOIN public.processos_teses sib
  ON sib.cliente_id = g.cliente_id
  AND sib.id <> g.id
  AND (
    (g.tese = 'INSUMOS' AND lower(replace(sib.tese, '_', '')) = 'piscofinsinsumos')
    OR (g.tese = 'SUBVENCAO' AND lower(replace(sib.tese, '_', '')) = 'subvencaoicms')
  )
WHERE g.nome_exibicao IN ('PIS/COFINS Insumos', 'Subvenção ICMS')
  AND COALESCE(g.valor_credito, 0) = 0
  AND g.status_contrato = 'assinado'
  AND g.status_processo = 'compensando';

UPDATE public.compensacoes_mensais cm
SET processo_tese_id = m.sibling_id
FROM tmp_merge_pares m
WHERE cm.processo_tese_id = m.ghost_id;

DELETE FROM public.processos_teses p
USING tmp_merge_pares m
WHERE p.id = m.ghost_id;

COMMIT;
