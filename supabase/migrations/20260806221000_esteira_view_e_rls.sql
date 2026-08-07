-- View pro kanban da Esteira + ajuste de RLS em profiles.
--
-- Por que tocar em profiles: a view precisa mostrar o nome de quem é
-- responsável por cada cliente (responsavel_id). Hoje só 'admin' pode
-- SELECT em profiles de outros usuários ("Admins can view all profiles") —
-- teríamos nomes em branco pra pmo/gestor_tributario ao abrir a Esteira,
-- já que a view usa security_invoker (roda com o RLS de quem consulta, não
-- do owner). Estende pra pmo/gestor_tributario, que já compartilham
-- praticamente todas as outras telas administrativas com o admin.

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_tributario'::app_role)
  );

CREATE OR REPLACE VIEW public.v_esteira_clientes AS
SELECT
  c.id,
  c.empresa,
  c.cnpj,
  c.segmento,
  c.regime_tributario,
  c.estagio_esteira,
  c.data_entrada_estagio,
  EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int AS dias_na_etapa,
  c.responsavel_id,
  p.full_name AS responsavel_nome,
  COALESCE(l.origem, 'manual') AS origem,
  c.status,
  c.status_operacional,
  c.criado_em
FROM public.clientes c
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.profiles p ON p.user_id = c.responsavel_id
WHERE c.status = 'ativo';

ALTER VIEW public.v_esteira_clientes SET (security_invoker = true);
