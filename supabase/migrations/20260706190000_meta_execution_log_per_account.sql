-- ============================================================================
-- Hardening Meta Sync — colunas por conta em meta_execution_log
--
-- Contexto: hoje o for (const c of creds) na meta-sync-* joga throw dentro
-- do try externo — 1 conta com problema para TODAS as outras. O refactor
-- isola por conta e loga cada falha independente. Precisamos das colunas
-- pra registrar POR EXECUÇÃO:
--   * ad_account_id     — a conta específica que falhou (uma linha por
--                          falha; a linha "master" da execução fica sem)
--   * success_count     — quantas contas processaram OK nessa execução
--   * error_count       — quantas falharam
--   * failed_accounts   — jsonb ["act_123", "act_456", ...]
-- ============================================================================

ALTER TABLE public.meta_execution_log
  ADD COLUMN IF NOT EXISTS ad_account_id     text,
  ADD COLUMN IF NOT EXISTS success_count     int,
  ADD COLUMN IF NOT EXISTS error_count       int,
  ADD COLUMN IF NOT EXISTS failed_accounts   jsonb;

COMMENT ON COLUMN public.meta_execution_log.ad_account_id IS
  'Conta específica que falhou (uma linha por falha por conta). Linha master da execução fica NULL aqui e usa success_count/error_count.';
COMMENT ON COLUMN public.meta_execution_log.success_count IS
  'Nº de contas processadas OK nesta execução (na linha master).';
COMMENT ON COLUMN public.meta_execution_log.error_count IS
  'Nº de contas que falharam nesta execução (na linha master).';
COMMENT ON COLUMN public.meta_execution_log.failed_accounts IS
  'Lista de ad_account_ids que falharam. Array JSON.';

-- Index útil pra debug ("quais contas falharam nos últimos 7 dias?")
CREATE INDEX IF NOT EXISTS ix_meta_execution_log_ad_account
  ON public.meta_execution_log (ad_account_id, started_at DESC)
  WHERE ad_account_id IS NOT NULL;
