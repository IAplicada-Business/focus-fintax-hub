-- Aperta os grants de 20260826120000. Os default privileges do Supabase dão
-- DML completo a anon/authenticated em toda tabela nova de public — o GRANT
-- SELECT da migration anterior somou a isso em vez de substituir. O RLS já
-- bloqueava (só há policy de SELECT), mas grant largo + policy é defesa em
-- camada única: se alguém adicionar uma policy permissiva depois, o DML volta
-- a valer sem ninguém perceber.
--
-- Aplicada em 26/08/2026 (ledger: relatorio_semanal_hardening_grants).

BEGIN;

-- 1) weekly_report_log: authenticated só lê (e ainda passa pela policy).
--    anon não toca. service_role (n8n, via PostgREST) escreve.
REVOKE ALL ON public.weekly_report_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.weekly_report_log FROM authenticated;
GRANT SELECT ON public.weekly_report_log TO authenticated;
GRANT SELECT, INSERT ON public.weekly_report_log TO service_role;

-- 2) A função do relatório é endpoint de automação, não de aplicação.
--    Sem isso ela fica exposta como RPC público em /rest/v1/rpc/.
REVOKE EXECUTE ON FUNCTION public.relatorio_semanal_esteira(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.relatorio_semanal_esteira(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.relatorio_semanal_esteira(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_semanal_esteira(date) TO service_role;

COMMIT;
