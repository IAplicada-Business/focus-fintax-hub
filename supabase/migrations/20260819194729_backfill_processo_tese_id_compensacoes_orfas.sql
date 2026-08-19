-- ============================================================================
-- Backfill: compensações órfãs (processo_tese_id NULL) ganham processo/tese
--
-- Contexto: o importador de Fluxo de Caixa (ImportFluxoCaixaModal) só setava
-- tese_origem_id (catálogo genérico teses_tributarias), nunca processo_tese_id
-- — a FK que a UI usa pra exibir a coluna "Tese" em Compensações e pra montar
-- o Mapa Tributário / Processos por Tese (CompensacoesTab.tsx itera sobre
-- processos_teses do cliente, não sobre o catálogo genérico). O importador
-- foi corrigido pra sempre linkar processo_tese_id (busca ou cria o processo,
-- mesmo padrão do ImportCompensacoesModal); esta migration corrige
-- retroativamente as linhas já importadas antes do fix.
--
-- A migration 20260806125000_fix_soma_orfa_tese_cast_both.sql já tentou esse
-- backfill (seção 3), mas só linkava a um processo já existente — clientes
-- sem processo cadastrado pra aquela tese continuaram órfãos. Esta migration
-- cria o processo que faltar antes de linkar.
--
-- Estratégia:
--   1) tese-alvo de cada órfã = tese_origem_id (via teses_tributarias.codigo)
--      ou, na falta dele, inferência pelo tributo (mesma regra do frontend
--      em inferTeseCodigoFromTributo / src/lib/clientes-constants.ts):
--        IRPJ/CSLL          → SUBVENCAO
--        ICMS               → ICMS_ST
--        PIS/COFINS/INSS/*  → INSUMOS
--   2) cria processos_teses (cliente, tese) que ainda não existir.
--   3) linka processo_tese_id.
-- Idempotente: só toca linhas com processo_tese_id IS NULL; rerodar não
-- duplica processo (chave cliente+tese) nem re-atualiza linhas já linkadas.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_orfas_alvo ON COMMIT DROP AS
SELECT
  cm.id AS compensacao_id,
  cm.cliente_id,
  COALESCE(
    t.codigo::text,
    CASE
      WHEN cm.tributo_enum::text = 'IRPJ_CSLL_agregado' THEN 'SUBVENCAO'
      WHEN cm.tributo_enum::text = 'ICMS' THEN 'ICMS_ST'
      WHEN cm.tributo_enum::text IN ('PIS', 'COFINS', 'INSS_52', 'INSS_retidos', 'outros') THEN 'INSUMOS'
      ELSE NULL
    END
  ) AS tese_codigo
FROM public.compensacoes_mensais cm
LEFT JOIN public.teses_tributarias t ON t.id = cm.tese_origem_id
WHERE cm.processo_tese_id IS NULL;

-- Cria o processo do cliente pra tese-alvo quando ainda não existir.
INSERT INTO public.processos_teses (cliente_id, tese, nome_exibicao, status_contrato, status_processo)
SELECT DISTINCT
  o.cliente_id,
  o.tese_codigo,
  CASE o.tese_codigo
    WHEN 'INSUMOS' THEN 'PIS/COFINS Insumos'
    WHEN 'SUBVENCAO' THEN 'Subvenção ICMS'
    WHEN 'ICMS_ST' THEN 'ICMS-ST'
    ELSE o.tese_codigo
  END,
  'assinado',
  'compensando'
FROM tmp_orfas_alvo o
WHERE o.tese_codigo IS NOT NULL
  AND o.tese_codigo <> 'REPORTO'
  AND NOT EXISTS (
    SELECT 1 FROM public.processos_teses pt
    WHERE pt.cliente_id = o.cliente_id AND upper(pt.tese) = o.tese_codigo
  );

-- Linka processo_tese_id agora que o processo com certeza existe.
UPDATE public.compensacoes_mensais cm
SET processo_tese_id = pt.id
FROM tmp_orfas_alvo o
JOIN public.processos_teses pt
  ON pt.cliente_id = o.cliente_id AND upper(pt.tese) = o.tese_codigo
WHERE cm.id = o.compensacao_id
  AND o.tese_codigo IS NOT NULL
  AND o.tese_codigo <> 'REPORTO';

COMMIT;
