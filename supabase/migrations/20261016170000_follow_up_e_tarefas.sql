-- Follow-up no funil + tarefas/lembretes no card do lead (pedido da Mariana,
-- 15/10/2026): "uma etapa chamada Follow-up depois de Ganho, para quem não
-- foi perdido mas não fechou no momento do contato" e "agendamento de tarefas
-- e lembretes no card do cliente para fazer o follow-up".
--
-- 1. leads.status_funil é text livre (sem CHECK nas migrações deste repo).
--    Mesmo assim, se algum ambiente tiver criado um CHECK à mão, o bloco DO
--    abaixo recria a restrição incluindo 'follow_up' — senão mover o lead pra
--    nova coluna falharia só naquele banco.
-- 2. pipeline_sla_config ganha a linha 'follow_up' (30 dias, editável): é
--    etapa aberta, então entra na régua de tempo parado como as outras.
-- 3. metas_comerciais_realizado: apresentacao → follow_up passa a contar como
--    reunião REALIZADA (a reunião aconteceu; o lead só não fechou na hora) e
--    linhas de anotação (de_etapa = para_etapa, geradas pelas tarefas abaixo)
--    deixam de contar como movimento. Corpo copiado de 20261016120000 com só
--    essas duas mudanças.
-- 4. lead_tarefas: tarefas com vencimento e responsável, ligadas ao lead.
--    Mesmos papéis da RLS comercial (admin/pmo/comercial/sdr/gestor_comercial).
-- 5. Trigger SECURITY DEFINER registra em lead_historico "Tarefa criada" /
--    "Tarefa concluída" (de_etapa = para_etapa = etapa atual). Trigger e não
--    cliente porque a linha precisa existir mesmo se a tarefa vier de outro
--    caminho (SQL, automação) e porque a RLS de lead_historico não precisa ser
--    aberta pra isso. Quem lê histórico como movimento de etapa deve ignorar
--    linhas com de_etapa = para_etapa (ver ehAnotacaoHistorico no app).

BEGIN;

-- ───────────────────────────────────────── 1. CHECK opcional em leads.status_funil

DO $$
DECLARE
  r record;
  v_tinha_check boolean := false;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.leads'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%status_funil%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', r.conname);
    v_tinha_check := true;
  END LOOP;

  -- Só recria se havia restrição: sem CHECK original o campo continua livre,
  -- como no schema versionado aqui.
  IF v_tinha_check THEN
    -- NOT VALID: não revalida linhas antigas (podem ter valores legados que a
    -- restrição original tolerava); vale pra toda escrita nova.
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_status_funil_check CHECK (
        status_funil IN (
          'novo', 'qualificado', 'apresentacao', 'em_apresentacao', 'triagem',
          'em_negociacao', 'levantamento_teses', 'contrato_emitido',
          'contrato_assinado', 'ganho', 'cliente_ativo', 'follow_up',
          'perdido', 'nao_vai_fazer'
        )
      ) NOT VALID;
  END IF;
END $$;

-- ───────────────────────────────────────── 2. SLA da etapa Follow-up

INSERT INTO public.pipeline_sla_config (etapa, label, sla_dias, ordem, ativo, atualizado_em)
SELECT 'follow_up', 'Follow-up', 30, COALESCE(max(ordem), 0) + 1, true, now()
  FROM public.pipeline_sla_config
ON CONFLICT (etapa) DO UPDATE
  SET ativo = true, atualizado_em = now();

-- ───────────────────────────────────────── 3. metas_comerciais_realizado(p_mes)

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
       -- Anotação (tarefa criada/concluída) não é movimento de etapa.
       AND h.de_etapa IS DISTINCT FROM h.para_etapa
  ),
  por_sdr AS (
    SELECT m.sdr_id,
           -- Agendada: entrou em apresentação (legado em_apresentacao conta igual).
           COUNT(DISTINCT m.lead_id) FILTER (WHERE m.para_etapa IN ('apresentacao', 'em_apresentacao'))::integer AS agendadas,
           -- Realizada: saiu de apresentação para etapa posterior ou follow-up; perdido não conta.
           COUNT(DISTINCT m.lead_id) FILTER (
             WHERE m.de_etapa IN ('apresentacao', 'em_apresentacao')
               AND m.para_etapa IN ('triagem', 'levantamento_teses', 'em_negociacao', 'contrato_emitido', 'contrato_assinado', 'ganho', 'cliente_ativo', 'follow_up')
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
  'Realizado do mês por SDR (agendadas = entrou em apresentacao; realizadas = saiu de apresentacao para etapa posterior ou follow_up; leads novos; contratos emitidos). Ignora anotações (de_etapa = para_etapa). Linha user_id NULL = leads sem SDR.';

REVOKE ALL ON FUNCTION public.metas_comerciais_realizado(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metas_comerciais_realizado(date) TO authenticated;

-- ───────────────────────────────────────── 4. lead_tarefas

CREATE TABLE IF NOT EXISTS public.lead_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'follow_up'
    CHECK (tipo IN ('follow_up', 'ligacao', 'reuniao', 'whatsapp', 'email', 'outro')),
  vence_em timestamptz NOT NULL,
  responsavel_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  concluida_em timestamptz,
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_tarefas_lead_idx ON public.lead_tarefas (lead_id);
-- "Minhas tarefas abertas por vencimento" é a consulta do lembrete do Pipeline.
CREATE INDEX IF NOT EXISTS lead_tarefas_responsavel_idx ON public.lead_tarefas (responsavel_id, concluida_em, vence_em);

COMMENT ON TABLE public.lead_tarefas IS
  'Tarefas/lembretes de follow-up no card do lead (aba Tarefas do Pipeline). concluida_em NULL = aberta.';

ALTER TABLE public.lead_tarefas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_tarefas_select" ON public.lead_tarefas;
CREATE POLICY "lead_tarefas_select" ON public.lead_tarefas
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "lead_tarefas_insert" ON public.lead_tarefas;
CREATE POLICY "lead_tarefas_insert" ON public.lead_tarefas
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "lead_tarefas_update" ON public.lead_tarefas;
CREATE POLICY "lead_tarefas_update" ON public.lead_tarefas
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "lead_tarefas_delete" ON public.lead_tarefas;
CREATE POLICY "lead_tarefas_delete" ON public.lead_tarefas
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tarefas TO authenticated;

-- ───────────────────────────────────────── 5. Histórico automático das tarefas

CREATE OR REPLACE FUNCTION public.lead_tarefas_registrar_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_etapa text;
  v_anotacao text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_anotacao := 'Tarefa criada: ' || NEW.titulo || ' (vence '
      || to_char(NEW.vence_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ')';
  ELSIF TG_OP = 'UPDATE' AND OLD.concluida_em IS NULL AND NEW.concluida_em IS NOT NULL THEN
    v_anotacao := 'Tarefa concluída: ' || NEW.titulo;
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(l.status_funil, ''), 'novo') INTO v_etapa
    FROM public.leads l
   WHERE l.id = NEW.lead_id;

  -- de_etapa = para_etapa marca a linha como anotação (não é movimento).
  INSERT INTO public.lead_historico (lead_id, de_etapa, para_etapa, anotacao, criado_por)
  VALUES (NEW.lead_id, v_etapa, v_etapa, v_anotacao, COALESCE(auth.uid(), NEW.criado_por));

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lead_tarefas_registrar_historico() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_lead_tarefas_historico ON public.lead_tarefas;
CREATE TRIGGER trg_lead_tarefas_historico
  AFTER INSERT OR UPDATE OF concluida_em ON public.lead_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.lead_tarefas_registrar_historico();

-- ---------------------------------------------------------------------------
-- resumo_semanal_dados: as anotações de tarefa entram em lead_historico com
-- de_etapa = para_etapa. Num lead em Apresentação elas contariam como
-- "reunião agendada". Ajusta só esse filtro, sem recopiar a função inteira.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_old text := $q$WHERE h.para_etapa IN ('apresentacao', 'em_apresentacao')$q$;
  v_new text := $q$WHERE h.para_etapa IN ('apresentacao', 'em_apresentacao')
      AND h.de_etapa IS DISTINCT FROM h.para_etapa$q$;
BEGIN
  IF to_regprocedure('public.resumo_semanal_dados(text,date)') IS NULL THEN
    RETURN;
  END IF;
  v_def := pg_get_functiondef('public.resumo_semanal_dados(text,date)'::regprocedure);
  IF position(v_old in v_def) > 0 AND position('h.de_etapa IS DISTINCT FROM h.para_etapa' in v_def) = 0 THEN
    EXECUTE replace(v_def, v_old, v_new);
  END IF;
END $$;

COMMIT;
