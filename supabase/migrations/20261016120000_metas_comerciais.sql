-- Lote 3A – Gestão comercial (reunião com Janaina, head comercial, 08/10/2026).
--
-- A SDR (Ágatha, Larissa) qualifica e agenda reuniões; o closer (Sampaio,
-- Maurício, Guilherme) conduz. A meta da SDR é mensal: reuniões AGENDADAS e
-- reuniões REALIZADAS. Janaina também quer meta de conversão por etapa do
-- funil (planilha "Growth Machine"; valores ainda indefinidos, por isso
-- editáveis na tela).
--
-- 1. metas_comerciais: meta por mês, por SDR (escopo 'sdr' + user_id) ou da
--    equipe inteira (escopo 'equipe', user_id NULL). UNIQUE (escopo, user_id,
--    mes) é o alvo do upsert da tela.
-- 2. pipeline_sla_config.meta_conversao_pct: % alvo de conversão da etapa
--    para a seguinte, editada inline na mesma régua do SLA.
-- 3. metas_comerciais_realizado(p_mes): o "realizado" do mês por SDR, lido de
--    lead_historico + leads. Convenção adotada (documentada também em
--    src/lib/metas-comerciais.ts):
--      · reunião AGENDADA  = movimento com para_etapa = 'apresentacao';
--      · reunião REALIZADA = movimento saindo de 'apresentacao' para uma
--        etapa posterior (triagem, contrato_emitido, contrato_assinado, ganho);
--      · apresentacao → perdido = reunião NÃO realizada (não conta);
--      · leads novos  = leads.criado_em no mês;
--      · contratos    = movimento com para_etapa = 'contrato_emitido'.
--    Tudo agrupado por leads.sdr_id (dono do lead), no fuso America/Sao_Paulo,
--    com uma linha user_id NULL para leads sem SDR. SECURITY DEFINER porque
--    profiles (full_name) não é legível pelos papéis comerciais — mesmo
--    padrão de equipe_comercial_cargos (20261015120000). O total da equipe é
--    a soma das linhas, feita no cliente.

BEGIN;

-- ───────────────────────────────────────── metas_comerciais

CREATE TABLE IF NOT EXISTS public.metas_comerciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL CHECK (escopo IN ('sdr', 'equipe')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  mes date NOT NULL,
  reunioes_agendadas integer,
  reunioes_realizadas integer,
  leads_novos integer,
  contratos integer,
  criado_por uuid DEFAULT auth.uid(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_comerciais_mes_primeiro_dia CHECK (mes = date_trunc('month', mes)::date),
  CONSTRAINT metas_comerciais_escopo_user CHECK (
    (escopo = 'sdr' AND user_id IS NOT NULL) OR (escopo = 'equipe' AND user_id IS NULL)
  ),
  CONSTRAINT metas_comerciais_valores_chk CHECK (
    COALESCE(reunioes_agendadas, 0) >= 0 AND COALESCE(reunioes_realizadas, 0) >= 0
    AND COALESCE(leads_novos, 0) >= 0 AND COALESCE(contratos, 0) >= 0
  )
);

-- UNIQUE (escopo, user_id, mes) é o alvo do upsert. NULLS NOT DISTINCT
-- porque a linha da equipe tem user_id NULL e, sem isso, o Postgres
-- aceitaria duas metas da equipe pro mesmo mês.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'metas_comerciais_escopo_user_mes_key' AND conrelid = 'public.metas_comerciais'::regclass
  ) THEN
    ALTER TABLE public.metas_comerciais
      ADD CONSTRAINT metas_comerciais_escopo_user_mes_key
      UNIQUE NULLS NOT DISTINCT (escopo, user_id, mes);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS metas_comerciais_mes_idx ON public.metas_comerciais (mes);

COMMENT ON TABLE public.metas_comerciais IS
  'Metas mensais da equipe comercial: por SDR (escopo sdr) ou da equipe (escopo equipe, user_id NULL). mes = primeiro dia do mês.';
COMMENT ON COLUMN public.metas_comerciais.reunioes_agendadas IS
  'Meta de reuniões agendadas no mês (= leads movidos para a etapa apresentacao).';
COMMENT ON COLUMN public.metas_comerciais.reunioes_realizadas IS
  'Meta de reuniões realizadas no mês (= leads que saíram de apresentacao para etapa posterior).';

ALTER TABLE public.metas_comerciais ENABLE ROW LEVEL SECURITY;

-- Leitura: quem vê o dashboard comercial (mesmos papéis de pipeline_sla_config).
DROP POLICY IF EXISTS "metas_comerciais_select" ON public.metas_comerciais;
CREATE POLICY "metas_comerciais_select" ON public.metas_comerciais
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

-- Escrita: admin/PMO e a gestora comercial (Janaina) definem as metas.
DROP POLICY IF EXISTS "metas_comerciais_insert" ON public.metas_comerciais;
CREATE POLICY "metas_comerciais_insert" ON public.metas_comerciais
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "metas_comerciais_update" ON public.metas_comerciais;
CREATE POLICY "metas_comerciais_update" ON public.metas_comerciais
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "metas_comerciais_delete" ON public.metas_comerciais;
CREATE POLICY "metas_comerciais_delete" ON public.metas_comerciais
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_comerciais TO authenticated;

-- ───────────────────────────────────────── pipeline_sla_config.meta_conversao_pct

ALTER TABLE public.pipeline_sla_config
  ADD COLUMN IF NOT EXISTS meta_conversao_pct numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pipeline_sla_config_meta_conversao_chk' AND conrelid = 'public.pipeline_sla_config'::regclass
  ) THEN
    ALTER TABLE public.pipeline_sla_config
      ADD CONSTRAINT pipeline_sla_config_meta_conversao_chk
      CHECK (meta_conversao_pct IS NULL OR (meta_conversao_pct >= 0 AND meta_conversao_pct <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.pipeline_sla_config.meta_conversao_pct IS
  'Meta de conversão (%) desta etapa para a seguinte. NULL = sem meta definida.';

-- A policy de UPDATE já existe; só a lista de colunas do GRANT precisa da nova.
GRANT UPDATE (meta_conversao_pct) ON public.pipeline_sla_config TO authenticated;

-- gestor_comercial passa a editar as metas da régua do funil (dias e conversão),
-- junto de admin/PMO — era o que faltava pra Janaina ajustar sem pedir ao PMO.
DROP POLICY IF EXISTS "pipeline_sla_config_update" ON public.pipeline_sla_config;
CREATE POLICY "pipeline_sla_config_update" ON public.pipeline_sla_config
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

-- ───────────────────────────────────────── metas_comerciais_realizado(p_mes)

CREATE OR REPLACE FUNCTION public.metas_comerciais_realizado(p_mes date)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  reunioes_agendadas integer,
  reunioes_realizadas integer,
  leads_novos integer,
  contratos integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem permissão para consultar as metas comerciais' USING ERRCODE = '42501';
  END IF;

  -- Limites do mês no calendário de negócio (meia-noite em São Paulo), não em UTC.
  v_inicio := (date_trunc('month', p_mes)::date)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := ((date_trunc('month', p_mes)::date + INTERVAL '1 month')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  WITH movimentos AS (
    SELECT l.sdr_id,
           h.lead_id,
           COALESCE(h.de_etapa, '') AS de_etapa,
           h.para_etapa
      FROM public.lead_historico h
      JOIN public.leads l ON l.id = h.lead_id
     WHERE h.criado_em >= v_inicio AND h.criado_em < v_fim
  ),
  por_sdr AS (
    SELECT m.sdr_id,
           -- Agendada: entrou em apresentação (legado em_apresentacao conta igual).
           COUNT(DISTINCT m.lead_id) FILTER (WHERE m.para_etapa IN ('apresentacao', 'em_apresentacao'))::integer AS agendadas,
           -- Realizada: saiu de apresentação para etapa posterior; perdido não conta.
           COUNT(DISTINCT m.lead_id) FILTER (
             WHERE m.de_etapa IN ('apresentacao', 'em_apresentacao')
               AND m.para_etapa IN ('triagem', 'levantamento_teses', 'em_negociacao', 'contrato_emitido', 'contrato_assinado', 'ganho', 'cliente_ativo')
           )::integer AS realizadas,
           COUNT(DISTINCT m.lead_id) FILTER (WHERE m.para_etapa = 'contrato_emitido')::integer AS contratos
      FROM movimentos m
     GROUP BY m.sdr_id
  ),
  novos AS (
    SELECT l.sdr_id, COUNT(*)::integer AS leads_novos
      FROM public.leads l
     WHERE l.criado_em >= v_inicio AND l.criado_em < v_fim
     GROUP BY l.sdr_id
  ),
  chaves AS (
    SELECT sdr_id FROM por_sdr
    UNION
    SELECT sdr_id FROM novos
  )
  SELECT c.sdr_id AS user_id,
         p.full_name,
         COALESCE(s.agendadas, 0) AS reunioes_agendadas,
         COALESCE(s.realizadas, 0) AS reunioes_realizadas,
         COALESCE(n.leads_novos, 0) AS leads_novos,
         COALESCE(s.contratos, 0) AS contratos
    FROM chaves c
    LEFT JOIN por_sdr s ON s.sdr_id IS NOT DISTINCT FROM c.sdr_id
    LEFT JOIN novos n ON n.sdr_id IS NOT DISTINCT FROM c.sdr_id
    LEFT JOIN public.profiles p ON p.user_id = c.sdr_id
   ORDER BY p.full_name NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.metas_comerciais_realizado(date) IS
  'Realizado do mês por SDR (agendadas = entrou em apresentacao; realizadas = saiu de apresentacao para etapa posterior; leads novos; contratos emitidos). Linha user_id NULL = leads sem SDR.';

REVOKE ALL ON FUNCTION public.metas_comerciais_realizado(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metas_comerciais_realizado(date) TO authenticated;

COMMIT;
