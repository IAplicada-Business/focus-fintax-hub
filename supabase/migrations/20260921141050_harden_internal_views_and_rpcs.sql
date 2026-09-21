BEGIN;

-- Internal views must evaluate the RLS policies of the caller. Recreating a
-- view drops this option, so keep this hardening in a final, dedicated
-- migration after all current CREATE OR REPLACE VIEW statements.
ALTER VIEW public.v_clientes_status_compensacao
  SET (security_invoker = true);
ALTER VIEW public.v_cliente_totais_calculo
  SET (security_invoker = true);
ALTER VIEW public.v_mapa_creditos
  SET (security_invoker = true);
ALTER VIEW public.v_meta_lead_funnel
  SET (security_invoker = true);

-- Supabase may grant new public-schema relations through default privileges.
-- Make the intended audience explicit instead of relying on those defaults.
REVOKE ALL ON TABLE public.v_clientes_status_compensacao FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.v_cliente_totais_calculo FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.v_mapa_creditos FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.v_meta_lead_funnel FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.v_clientes_status_compensacao TO authenticated;
GRANT SELECT ON TABLE public.v_cliente_totais_calculo TO authenticated;
GRANT SELECT ON TABLE public.v_mapa_creditos TO authenticated;
GRANT SELECT ON TABLE public.v_meta_lead_funnel TO authenticated;

-- This mutating SECURITY DEFINER RPC is called only by submit-lead-public,
-- whose Supabase client uses the service-role key. It must not be callable
-- directly with the browser's publishable key.
REVOKE EXECUTE ON FUNCTION public.calcular_diagnostico(uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_diagnostico(uuid, numeric, text, text)
  TO service_role;

-- RLS policies call has_role for signed-in users. Anonymous callers do not
-- need a role-membership oracle.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)
  TO authenticated, service_role;

-- Trigger functions are not application RPCs. Remove PostgreSQL's implicit
-- PUBLIC execution privilege; existing triggers continue to execute them.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_intimacao_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_data_entrada_estagio() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_esteira_historico() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notificar_compensacao_registrada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atendimento_garantir_conversa() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atendimento_disparar_envio() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bot_desligar_ao_responder_humano() FROM PUBLIC, anon, authenticated;

-- These are the only intentionally anonymous SECURITY DEFINER RPCs. Both
-- require an unguessable token and return NULL when it is invalid (or, for a
-- map, revoked). Revoke the implicit PUBLIC grant, then restore only the roles
-- used by the public pages and backend.
REVOKE EXECUTE ON FUNCTION public.get_diagnostico_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_diagnostico_by_token(uuid)
  TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_mapa_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mapa_by_token(text)
  TO anon, authenticated, service_role;

COMMIT;
