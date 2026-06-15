-- ============================================================================
-- Focus FinTax · Meta Ads Integration · Etapa 3 (Cron pg_cron)
--
-- PRÉ-REQUISITOS:
--   1) pg_cron e pg_net habilitados em Dashboard → Database → Extensions
--   2) Edge functions meta-sync-structure e meta-sync-insights já deployadas
--   3) Substituir <SERVICE_ROLE_KEY> antes de rodar
--
-- Re-run safe: faz unschedule antes do schedule.
-- ============================================================================

-- Limpa jobs antigos com o mesmo nome (idempotência em re-runs)
SELECT cron.unschedule('meta-sync-structure-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-sync-structure-daily');

SELECT cron.unschedule('meta-sync-insights-hourly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-sync-insights-hourly');

-- Sync diário da estrutura (campanhas / adsets / ads / criativos / forms)
-- Roda 04:00 UTC (~01:00 BRT — fora do horário operacional)
SELECT cron.schedule(
  'meta-sync-structure-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-sync-structure',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type',  'application/json'
    )
  );
  $$
);

-- Sync horário de insights (performance dos ads, janela rolante 3d)
-- Roda no minuto :05 de cada hora (evita conflito com :00 sharp)
SELECT cron.schedule(
  'meta-sync-insights-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-sync-insights',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type',  'application/json'
    )
  );
  $$
);

-- Verificação: confere que os dois jobs foram agendados
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('meta-sync-structure-daily', 'meta-sync-insights-hourly')
ORDER BY jobname;
