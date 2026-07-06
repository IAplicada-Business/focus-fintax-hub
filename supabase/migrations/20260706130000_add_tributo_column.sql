-- ============================================================================
-- PR 2 — Coluna `tributo` em processos_teses e compensacoes_mensais
--         + backfill heurístico dos dados legados
--
-- Contexto: o frontend (CompensacoesTab, ImportCompensacoesModal, WhatsApp
-- messages, Mapa Tributário) já lê/escreve `tributo` como campo isolado, com
-- fallback para `observacao` e default "INSS". Esta migration cria a coluna
-- de verdade e migra o que der pra ser migrado de forma determinística.
--
-- Estratégia:
--   1) Adiciona colunas nullable (sem CHECK — Focus pode adicionar tributos
--      novos sem migration futura).
--   2) Backfill em `compensacoes_mensais.tributo` a partir de `observacao`.
--   3) Backfill em `processos_teses.tributo` a partir de `tese`/`nome_exibicao`.
--   4) Índices para filtros ad-hoc (dashboard executivo agrega por tributo).
--
-- Vocabulário canônico (mesmo do TRIBUTO_OPTIONS no front):
--   INSS · PIS/COFINS · IRPJ · CSLL · ICMS · Outros · NULL (desconhecido)
--
-- Nada é destrutivo: linhas cujo texto legado não bate com nenhuma heurística
-- ficam com tributo NULL e o frontend segue usando seu fallback histórico.
-- ============================================================================

-- 1) Colunas ------------------------------------------------------------------
ALTER TABLE public.compensacoes_mensais
  ADD COLUMN IF NOT EXISTS tributo text;

ALTER TABLE public.processos_teses
  ADD COLUMN IF NOT EXISTS tributo text;

COMMENT ON COLUMN public.compensacoes_mensais.tributo IS
  'Tributo compensado (INSS, PIS/COFINS, IRPJ, CSLL, ICMS, Outros). NULL = desconhecido; frontend cai no fallback histórico.';
COMMENT ON COLUMN public.processos_teses.tributo IS
  'Tributo principal do processo/tese. Um mesmo processo pode gerar compensações em múltiplos tributos; use compensacoes_mensais.tributo pra o valor real por movimento.';


-- 2) Backfill compensacoes_mensais.tributo ------------------------------------
-- Só toca linhas com tributo IS NULL — reruns são idempotentes.
UPDATE public.compensacoes_mensais
SET tributo = CASE
  -- padrões mais específicos primeiro (PIS/COFINS antes de PIS solto)
  WHEN observacao ILIKE '%pis/cofins%'
    OR observacao ILIKE '%pis e cofins%'
    OR observacao ILIKE '%pis-cofins%'
    OR (observacao ILIKE '%pis%' AND observacao ILIKE '%cofins%') THEN 'PIS/COFINS'
  WHEN observacao ~* '\mpis\M'    THEN 'PIS/COFINS'  -- PIS isolado é raro; jogamos no par
  WHEN observacao ~* '\mcofins\M' THEN 'PIS/COFINS'
  WHEN observacao ~* '\mirpj\M'   THEN 'IRPJ'
  WHEN observacao ~* '\mcsll\M'   THEN 'CSLL'
  WHEN observacao ~* '\minss\M'   THEN 'INSS'
  WHEN observacao ~* '\micms\M'   THEN 'ICMS'
  ELSE NULL
END
WHERE tributo IS NULL
  AND observacao IS NOT NULL
  AND observacao <> '';


-- 3) Backfill processos_teses.tributo -----------------------------------------
-- Usa tese + nome_exibicao. Idem: só quando tributo IS NULL.
UPDATE public.processos_teses
SET tributo = CASE
  -- Subvenção ICMS → é uma exclusão de base pra IRPJ/CSLL; classifico como IRPJ
  -- (é o tributo predominante nas compensações desse tipo). Ajustar se necessário.
  WHEN nome_exibicao ILIKE '%subven%icms%' OR tese ILIKE '%subven%icms%' THEN 'IRPJ'
  -- Reporto trabalha PIS/COFINS acumulado
  WHEN nome_exibicao ILIKE '%reporto%' OR tese ILIKE '%reporto%' THEN 'PIS/COFINS'
  -- ICMS na base PIS/COFINS (Tema 69) → o crédito recuperado é de PIS/COFINS
  WHEN nome_exibicao ILIKE '%icms%base%pis%'
    OR nome_exibicao ILIKE '%exclusao%icms%pis%'
    OR nome_exibicao ILIKE '%exclusão%icms%pis%'
    OR nome_exibicao ILIKE '%icms-st%'
    OR nome_exibicao ILIKE '%icms st%' THEN 'PIS/COFINS'
  -- Insumos PIS/COFINS
  WHEN nome_exibicao ILIKE '%pis%cofins%'
    OR nome_exibicao ILIKE '%pis/cofins%'
    OR nome_exibicao ILIKE '%pis-cofins%'
    OR tese ILIKE '%pis%cofins%' THEN 'PIS/COFINS'
  -- Palavras isoladas
  WHEN nome_exibicao ~* '\minss\M' OR tese ~* '\minss\M' THEN 'INSS'
  WHEN nome_exibicao ~* '\micms\M' OR tese ~* '\micms\M' THEN 'ICMS'
  WHEN nome_exibicao ~* '\mirpj\M' OR tese ~* '\mirpj\M' THEN 'IRPJ'
  WHEN nome_exibicao ~* '\mcsll\M' OR tese ~* '\mcsll\M' THEN 'CSLL'
  ELSE NULL
END
WHERE tributo IS NULL;


-- 4) Propaga o tributo do processo pras compensações que ainda estão NULL -----
-- Se a compensação não teve match na observação mas o processo pai tem tributo,
-- herda dele. Isso cobre o caso comum "importação em lote via XLSX" onde a
-- observacao é genérica ("Importado via planilha XLSX").
UPDATE public.compensacoes_mensais cm
SET tributo = pt.tributo
FROM public.processos_teses pt
WHERE cm.processo_tese_id = pt.id
  AND cm.tributo IS NULL
  AND pt.tributo IS NOT NULL;


-- 5) Índices ------------------------------------------------------------------
-- Filtro por tributo cruzando todo o cadastro (dashboard Visão Executiva
-- do PR 10). Partial index economiza espaço porque a maioria das linhas
-- terá tributo depois do backfill, mas queries só pegam linhas conhecidas.
CREATE INDEX IF NOT EXISTS ix_compensacoes_mensais_tributo
  ON public.compensacoes_mensais (tributo)
  WHERE tributo IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_processos_teses_tributo
  ON public.processos_teses (tributo)
  WHERE tributo IS NOT NULL;
