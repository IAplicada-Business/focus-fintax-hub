-- "Enviar para equipe comercial" no card da Triagem (escopo AGF 14/10/2026).
--
-- 1. profiles.whatsapp: número de cada pessoa do time comercial (preenchido
--    em Usuários). Sem ele o envio por WhatsApp para essa pessoa é pulado.
-- 2. equipe_comercial_destinatarios(cliente): quem pode receber o envio,
--    marcando quem trouxe o lead (leads.created_by via clientes.lead_id).
--    SECURITY DEFINER porque profiles/user_roles não são legíveis por todos
--    os papéis que operam a esteira.
-- O disparo em si fica na Edge Function `notificar-equipe-comercial`.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp text;

COMMENT ON COLUMN public.profiles.whatsapp IS
  'WhatsApp do usuário (com DDD). Usado para avisos internos, ex.: envio do cliente da Triagem para a equipe comercial.';

CREATE OR REPLACE FUNCTION public.equipe_comercial_destinatarios(p_cliente_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  cargo text,
  papel text,
  tem_whatsapp boolean,
  tem_email boolean,
  trouxe_o_lead boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_origem uuid;
BEGIN
  IF NOT public.pode_editar_clientes(auth.uid()) THEN
    RAISE EXCEPTION 'Usuário sem permissão de edição de clientes'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.created_by INTO v_origem
    FROM public.clientes c
    LEFT JOIN public.leads l ON l.id = c.lead_id
   WHERE c.id = p_cliente_id;

  RETURN QUERY
  SELECT DISTINCT ON (p.user_id)
         p.user_id,
         p.full_name,
         p.cargo,
         ur.role::text,
         COALESCE(NULLIF(regexp_replace(p.whatsapp, '\D', '', 'g'), ''), NULL) IS NOT NULL,
         COALESCE(NULLIF(trim(p.email), ''), NULL) IS NOT NULL,
         p.user_id = v_origem
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE p.is_active
     AND ur.role::text IN ('comercial', 'gestor_comercial', 'sdr')
   ORDER BY p.user_id, ur.role::text;
END;
$$;

REVOKE ALL ON FUNCTION public.equipe_comercial_destinatarios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipe_comercial_destinatarios(uuid) TO authenticated;

COMMIT;
