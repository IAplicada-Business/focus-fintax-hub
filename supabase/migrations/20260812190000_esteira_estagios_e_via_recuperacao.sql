-- Estágios configuráveis da esteira (ativo) + via de recuperação padrão por
-- tese (spec: docs/superpowers/specs/2026-08-12-esteira-estagios-e-via-recuperacao-design.md).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) esteira_sla_config ganha `ativo` — admin pode esconder etapa do kanban
--    sem deploy (coluna de ordem já existia desde a criação da tabela).
-- ---------------------------------------------------------------------------
ALTER TABLE public.esteira_sla_config
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.esteira_sla_config.ativo IS
  'Etapa aparece no kanban quando true, OU quando false mas ainda tem cliente alocado nela (nunca esconde cliente por toggle administrativo).';

GRANT UPDATE (label, sla_dias, ordem, ativo, atualizado_em) ON public.esteira_sla_config TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) motor_teses_config ganha via de recuperação padrão por tese — substitui
--    a heurística de regex (sugerirTipoRecuperacao) como fonte de verdade,
--    mantendo a heurística só como fallback no client-side.
-- ---------------------------------------------------------------------------
ALTER TABLE public.motor_teses_config
  ADD COLUMN IF NOT EXISTS tipo_recuperacao_padrao public.tipo_recuperacao NOT NULL DEFAULT 'compensacao';

COMMENT ON COLUMN public.motor_teses_config.tipo_recuperacao_padrao IS
  'Ramo padrão sugerido ao escolher esta tese em ProcessoFormModal. Editável em /configuracoes/motor. Usuário pode sobrescrever por processo.';

-- Backfill: mesma heurística de src/lib/tipo-recuperacao.ts#sugerirTipoRecuperacao,
-- pra não mudar comportamento nenhuma tese que já existia antes desta coluna.
UPDATE public.motor_teses_config
SET tipo_recuperacao_padrao = 'recuperacao_judicial'
WHERE tese ILIKE '%jud%' OR nome_exibicao ILIKE '%judicial%';

UPDATE public.motor_teses_config
SET tipo_recuperacao_padrao = 'ressarcimento'
WHERE tipo_recuperacao_padrao = 'compensacao'
  AND (tese ILIKE '%ressarc%' OR nome_exibicao ILIKE '%ressarc%');

COMMIT;
