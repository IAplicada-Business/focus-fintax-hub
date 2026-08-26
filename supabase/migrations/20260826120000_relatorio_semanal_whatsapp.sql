-- Step 10 — Relatório WhatsApp semanal (toda sexta 08:00 BRT).
--
-- A automação roda no n8n (automacoes/n8n/relatorio-semanal-whatsapp.json):
-- Cron → Postgres → Code (formata) → Z-API → log. Toda a SEMÂNTICA do
-- relatório mora aqui, em relatorio_semanal_esteira(), e não no Code node do
-- n8n — assim os números batem por construção com /esteira e com o painel SLA
-- (mesmas tabelas, mesma regra de atraso do v_esteira_sla), e a agregação é
-- testável via `select relatorio_semanal_esteira()` sem subir o n8n.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) clientes.motivo_parada — texto livre, opcional
--
-- Alcir pediu "motivo de parada" no relatório (blueprint Step 10). Existem
-- duas leituras possíveis e esta migration atende as duas sem escolher uma:
--   - derivado: quem passou do SLA da etapa entra como "Além do SLA em <etapa>"
--     (é o que acontece hoje, sem ninguém preencher nada);
--   - manual: quando o time escreve o motivo real ("cliente não enviou XML"),
--     esse texto SUBSTITUI o derivado na agregação (COALESCE abaixo).
-- Não há UI pra editar este campo ainda — as policies de UPDATE em clientes
-- (admin/gestor/pmo) já cobrem a coluna quando a tela existir.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS motivo_parada text;

COMMENT ON COLUMN public.clientes.motivo_parada IS
  'Motivo pelo qual o cliente não avança na esteira. NULL = relatório semanal deriva o motivo do SLA da etapa. Preenchido = sobrescreve o derivado.';

-- ---------------------------------------------------------------------------
-- 2) weekly_report_log — auditoria de cada disparo (sucesso E falha)
--
-- Sem este log ninguém percebe o robô morrendo em silêncio, e o "mecanismo de
-- pressão" do Step 10 simplesmente para de existir sem aviso.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_report_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executado_em timestamptz NOT NULL DEFAULT now(),
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  destinatario text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL,
  zapi_response jsonb,
  erro text,
  CONSTRAINT weekly_report_log_status_chk CHECK (status IN ('sucesso', 'falha'))
);

COMMENT ON TABLE public.weekly_report_log IS
  'Um registro por disparo do relatório semanal WhatsApp (Step 10). Escrito pelo n8n via conexão direta ao Postgres.';

CREATE INDEX IF NOT EXISTS ix_weekly_report_log_executado
  ON public.weekly_report_log (executado_em DESC);

-- RLS: leitura só pra quem administra a operação. O n8n conecta como owner do
-- schema (conexão direta/pooler), então o INSERT dele não passa por policy —
-- de propósito: nenhum usuário final precisa escrever aqui.
ALTER TABLE public.weekly_report_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gestor pmo select weekly_report_log" ON public.weekly_report_log;
CREATE POLICY "Admin gestor pmo select weekly_report_log" ON public.weekly_report_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_tributario'::app_role) OR
    has_role(auth.uid(), 'pmo'::app_role)
  );

GRANT SELECT ON public.weekly_report_log TO authenticated;

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- 3) relatorio_semanal_esteira() — payload único do relatório
--
-- Retorna UM jsonb com tudo que a mensagem precisa. Um jsonb (em vez de N
-- queries no n8n) porque:
--   - o período é calculado uma vez só, no timezone certo, e volta no payload
--     — o Code node não recalcula data nenhuma (era o ponto mais fácil de
--     divergir: n8n roda no timezone do container, não em BRT);
--   - todas as contagens saem da MESMA transação/snapshot, então "total" nunca
--     briga com a soma das etapas.
--
-- p_referencia permite reprocessar uma semana passada (backfill/teste):
--   select relatorio_semanal_esteira('2026-08-14');
-- Atenção: só os números de FLUXO (leads_semana, movimentacao_esteira_semana)
-- respeitam p_referencia. Os de ESTOQUE (leads_por_etapa, esteira_por_etapa,
-- parados) são sempre a foto de agora — não existe histórico de estágio de lead
-- pra reconstruir o funil de uma sexta passada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.relatorio_semanal_esteira(
  p_referencia date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH periodo AS (
  SELECT
    (date_trunc('week', COALESCE(p_referencia, (now() AT TIME ZONE 'America/Sao_Paulo')::date)))::date AS inicio,
    (date_trunc('week', COALESCE(p_referencia, (now() AT TIME ZONE 'America/Sao_Paulo')::date)) + interval '4 days')::date AS fim
),

-- Leads tocados na semana: criados OU movidos de etapa entre seg e sex.
-- 'perdido' fica fora — Alcir quer "em tratamento", não histórico de descarte.
leads_semana AS (
  SELECT count(*)::int AS total
  FROM public.leads l
  CROSS JOIN periodo p
  WHERE COALESCE(l.status_funil, 'novo') NOT IN ('perdido', 'nao_vai_fazer')
    AND (
      (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p.inicio AND p.fim
      OR (l.status_funil_atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p.inicio AND p.fim
    )
),

-- Snapshot do funil: leads ainda abertos, por etapa do kanban.
-- Os CASE espelham STAGE_MERGE_MAP/PIPELINE_STAGES de src/lib/pipeline-constants.ts
-- — se aquele arquivo mudar de etapa, este bloco precisa acompanhar.
leads_funil AS (
  SELECT
    CASE COALESCE(l.status_funil, 'novo')
      WHEN 'levantamento_teses' THEN 'em_negociacao'
      ELSE COALESCE(l.status_funil, 'novo')
    END AS etapa
  FROM public.leads l
  WHERE COALESCE(l.status_funil, 'novo') NOT IN ('perdido', 'nao_vai_fazer', 'cliente_ativo')
),
leads_por_etapa AS (
  SELECT
    f.etapa,
    CASE f.etapa
      WHEN 'novo'             THEN 'Novo'
      WHEN 'qualificado'      THEN 'Qualificado'
      WHEN 'em_negociacao'    THEN 'Negociação / Teses'
      WHEN 'em_apresentacao'  THEN 'Em Apresentação'
      WHEN 'contrato_emitido' THEN 'Contrato Emitido'
      ELSE f.etapa
    END AS label,
    CASE f.etapa
      WHEN 'novo'             THEN 1
      WHEN 'qualificado'      THEN 2
      WHEN 'em_negociacao'    THEN 3
      WHEN 'em_apresentacao'  THEN 4
      WHEN 'contrato_emitido' THEN 5
      ELSE 99
    END AS ordem,
    count(*)::int AS total
  FROM leads_funil f
  GROUP BY 1, 2, 3
),

-- Esteira administrativa: clientes ativos por etapa. Mesma regra de atraso do
-- v_esteira_sla (EXTRACT(DAY ...) > sla_dias), pra bater com o painel.
esteira AS (
  SELECT
    s.estagio::text AS estagio,
    s.label,
    s.ordem,
    count(c.id)::int AS total,
    count(c.id) FILTER (
      WHERE s.sla_dias IS NOT NULL
        AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > s.sla_dias
    )::int AS atrasados
  FROM public.esteira_sla_config s
  LEFT JOIN public.clientes c
    ON c.estagio_esteira = s.estagio
   AND c.status = 'ativo'
  GROUP BY s.estagio, s.label, s.ordem
),

-- Motivo de parada: manual quando preenchido, derivado do SLA quando não.
parados AS (
  SELECT
    COALESCE(
      nullif(btrim(c.motivo_parada), ''),
      'Além do SLA em ' || s.label
    ) AS motivo,
    count(*)::int AS total,
    max(EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int - s.sla_dias)::int AS pior_atraso_dias
  FROM public.clientes c
  JOIN public.esteira_sla_config s ON s.estagio = c.estagio_esteira
  WHERE c.status = 'ativo'
    AND s.sla_dias IS NOT NULL
    AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > s.sla_dias
  GROUP BY 1
),

-- Movimentação real da semana: clientes que ENTRARAM em alguma etapa entre
-- seg e sex. É este número que denuncia time que não atualizou o sistema.
movimentacao AS (
  SELECT count(DISTINCT h.cliente_id)::int AS total
  FROM public.esteira_historico h
  CROSS JOIN periodo p
  WHERE (h.entrou_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p.inicio AND p.fim
)

SELECT jsonb_build_object(
  'periodo_inicio',  p.inicio,
  'periodo_fim',     p.fim,
  'leads_semana',    (SELECT total FROM leads_semana),
  'movimentacao_esteira_semana', (SELECT total FROM movimentacao),
  'leads_em_andamento', (SELECT COALESCE(sum(total), 0)::int FROM leads_por_etapa),
  'leads_por_etapa', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('etapa', label, 'total', total) ORDER BY ordem)
    FROM leads_por_etapa
  ), '[]'::jsonb),
  'esteira_total', (SELECT COALESCE(sum(total), 0)::int FROM esteira),
  'esteira_por_etapa', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('etapa', label, 'total', total, 'atrasados', atrasados)
      ORDER BY ordem
    )
    FROM esteira
  ), '[]'::jsonb),
  'parados_total', (SELECT COALESCE(sum(total), 0)::int FROM parados),
  'parados', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('motivo', motivo, 'total', total, 'pior_atraso_dias', pior_atraso_dias)
      ORDER BY total DESC, motivo
    )
    FROM parados
  ), '[]'::jsonb)
)
FROM periodo p;
$$;

COMMENT ON FUNCTION public.relatorio_semanal_esteira(date) IS
  'Payload jsonb do relatório WhatsApp semanal (Step 10). Semana seg-sex em America/Sao_Paulo; p_referencia reprocessa semana passada. Consumido pelo workflow n8n relatorio-semanal-whatsapp.';

COMMIT;
