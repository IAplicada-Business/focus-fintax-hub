-- Lote 2 – Comercial (reuniões Grupo AGF, out/2026).
--
-- O CRM só atendia a "AGF Fintex" (recuperação de crédito). A comercial
-- precisa prospectar também para "AGF Contábil" e "ATAX", com listas de até
-- 20k contatos vindas de planilha, saber para qual produto cada lead é e
-- quem cuida dele (SDR qualifica/agenda, closer fecha).
--
-- 1. leads.produto: a qual produto o lead pertence. Default 'agf_fintex'
--    porque toda a base atual é Fintex.
-- 2. leads.sdr_id / leads.closer_id: dono do lead. Uma lista pode ficar
--    "solta" (sem SDR) para qualquer SDR pegar, ou pertencer a um closer.
--    ON DELETE SET NULL: excluir usuário não apaga lead.
-- 3. leads.importacao_id + tabela leads_importacoes: rastro de cada planilha
--    importada (quantos entraram, duplicados, erros) para auditar e desfazer.
-- 4. profiles.cargo_comercial: 'sdr' | 'closer', preenchido em Usuários.
--    Separado de `cargo` (texto livre, ex.: "Analista Fiscal") porque os
--    selects de SDR/closer precisam de um valor fechado.
-- 5. equipe_comercial_cargos(): profiles só é legível por admin/pmo/gestor
--    tributário ("Admins can view all profiles"); comercial/sdr precisam
--    listar a equipe nos selects. SECURITY DEFINER, mesmo padrão de
--    equipe_comercial_destinatarios (20261013120000).
--
-- Atribuição em lote (sdr_id/closer_id): NÃO precisa de RPC. A policy
-- "Admin comercial update leads" (20260806211000) libera UPDATE em leads
-- para admin/comercial/sdr/gestor_comercial sem WITH CHECK restritivo, então
-- o `update().in("id", ...)` do cliente já passa pelo RLS.

BEGIN;

-- ───────────────────────────────────────── leads: produto, SDR, closer, importação

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS produto text NOT NULL DEFAULT 'agf_fintex';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'leads_produto_check' AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_produto_check
      CHECK (produto IN ('agf_contabil', 'agf_fintex', 'agf_atax'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_produto_idx ON public.leads (produto);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sdr_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS importacao_id uuid;

CREATE INDEX IF NOT EXISTS leads_sdr_id_idx ON public.leads (sdr_id);
CREATE INDEX IF NOT EXISTS leads_closer_id_idx ON public.leads (closer_id);
CREATE INDEX IF NOT EXISTS leads_importacao_id_idx ON public.leads (importacao_id);

COMMENT ON COLUMN public.leads.produto IS
  'Produto do grupo para o qual o lead é prospectado: agf_contabil | agf_fintex | agf_atax.';
COMMENT ON COLUMN public.leads.sdr_id IS
  'SDR dono do lead (qualifica e agenda). NULL = lead solto, qualquer SDR pode pegar.';
COMMENT ON COLUMN public.leads.closer_id IS
  'Closer dono do lead (conduz a reunião). NULL = ainda sem closer.';
COMMENT ON COLUMN public.leads.importacao_id IS
  'Planilha de origem (leads_importacoes.id) quando o lead veio de importação.';

-- ───────────────────────────────────────── profiles.cargo_comercial

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo_comercial text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'profiles_cargo_comercial_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_cargo_comercial_check
      CHECK (cargo_comercial IS NULL OR cargo_comercial IN ('sdr', 'closer'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.cargo_comercial IS
  'Papel na equipe comercial: sdr (qualifica/agenda) ou closer (fecha). NULL = fora da equipe comercial.';

-- ───────────────────────────────────────── leads_importacoes

CREATE TABLE IF NOT EXISTS public.leads_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo text,
  produto text,
  origem text,
  sdr_id uuid,
  closer_id uuid,
  total_linhas integer,
  inseridos integer,
  duplicados integer,
  invalidos integer,
  erros jsonb DEFAULT '[]'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads_importacoes IS
  'Uma linha por planilha de leads importada: configuração do lote e contadores do resultado.';

ALTER TABLE public.leads_importacoes ENABLE ROW LEVEL SECURITY;

-- Mesmo público que vê/cria leads ("Admin comercial select/insert leads").
DROP POLICY IF EXISTS "Admin comercial select leads_importacoes" ON public.leads_importacoes;
CREATE POLICY "Admin comercial select leads_importacoes" ON public.leads_importacoes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Admin comercial insert leads_importacoes" ON public.leads_importacoes;
CREATE POLICY "Admin comercial insert leads_importacoes" ON public.leads_importacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

-- Quem importou atualiza os contadores ao final do lote.
DROP POLICY IF EXISTS "Admin comercial update leads_importacoes" ON public.leads_importacoes;
CREATE POLICY "Admin comercial update leads_importacoes" ON public.leads_importacoes
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

-- ───────────────────────────────────────── equipe_comercial_cargos()

CREATE OR REPLACE FUNCTION public.equipe_comercial_cargos()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  cargo_comercial text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.full_name, p.cargo_comercial
    FROM public.profiles p
   WHERE p.is_active
     AND p.cargo_comercial IS NOT NULL
     AND auth.uid() IS NOT NULL
   ORDER BY p.full_name;
$$;

REVOKE ALL ON FUNCTION public.equipe_comercial_cargos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipe_comercial_cargos() TO authenticated;

COMMIT;
