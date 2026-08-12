-- Épica 3 / Épica 14 — Ramos Ressarcimento e Recuperação Judicial (v1 estrutural).
--
-- Escopo desta migration:
--   1) enum tipo_recuperacao
--   2) coluna em processos_teses (1 tipo por processo)
--   3) v_clientes_status_compensacao — tem_judicial / tem_ressarcimento reais
--   4) v_esteira_clientes — agrega tipos do cliente p/ tags no Kanban
--
-- Fora de escopo (precisa regra comercial Focus):
--   motor de cálculo distinto por tipo (valores / honorários / fluxo).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'tipo_recuperacao'
  ) THEN
    CREATE TYPE public.tipo_recuperacao AS ENUM (
      'compensacao',
      'ressarcimento',
      'recuperacao_judicial'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Coluna em processos_teses
-- ---------------------------------------------------------------------------
ALTER TABLE public.processos_teses
  ADD COLUMN IF NOT EXISTS tipo_recuperacao public.tipo_recuperacao
    NOT NULL DEFAULT 'compensacao';

COMMENT ON COLUMN public.processos_teses.tipo_recuperacao IS
  'Ramo do produto: compensacao (default), ressarcimento ou recuperacao_judicial. '
  'Independente de categoria (compensacao|reporto), que é a trilha operacional.';

CREATE INDEX IF NOT EXISTS ix_processos_teses_cliente_tipo_recuperacao
  ON public.processos_teses (cliente_id, tipo_recuperacao);

-- Heurística de backfill: teses com JUD / JUDICIAL no código/nome.
UPDATE public.processos_teses
SET tipo_recuperacao = 'recuperacao_judicial'
WHERE tipo_recuperacao = 'compensacao'
  AND (
    tese ILIKE '%JUD%'
    OR nome_exibicao ILIKE '%judicial%'
  );

-- ---------------------------------------------------------------------------
-- 3) Status consolidado — judicial/ressarcimento deixam de ser placeholder
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_clientes_status_compensacao AS
WITH
  comp AS (
    SELECT
      cm.cliente_id,
      bool_or(
        cm.valor_compensado > 0
        AND date_trunc('month', cm.mes_referencia) = date_trunc('month', current_date)
      ) AS tem_compensacao_mes_corrente,
      bool_or(cm.valor_compensado > 0) AS tem_compensacao_qualquer,
      max(cm.mes_referencia) FILTER (WHERE cm.valor_compensado > 0) AS ultima_competencia_compensada
    FROM public.compensacoes_mensais cm
    GROUP BY cm.cliente_id
  ),
  proc AS (
    SELECT
      pt.cliente_id,
      bool_or(
        pt.status_contrato = 'assinado'
        AND pt.status_processo IN (
          'a_iniciar', 'a_compensar', 'pedido_feito_receita',
          'protocolado', 'nao_protocolado', 'compensando'
        )
      ) AS tem_tese_ativa,
      bool_or(pt.status_contrato = 'assinado') AS tem_alguma_tese_assinada,
      bool_or(
        pt.categoria = 'reporto'
        AND pt.status_contrato = 'assinado'
        AND pt.status_processo <> 'desistiu'
      ) AS tem_reporto,
      bool_or(
        pt.tipo_recuperacao = 'recuperacao_judicial'
        AND pt.status_contrato = 'assinado'
        AND pt.status_processo <> 'desistiu'
      ) AS tem_judicial,
      bool_or(
        pt.tipo_recuperacao = 'ressarcimento'
        AND pt.status_contrato = 'assinado'
        AND pt.status_processo <> 'desistiu'
      ) AS tem_ressarcimento,
      (
        count(*) FILTER (WHERE pt.status_contrato = 'assinado') > 0
        AND count(*) FILTER (
          WHERE pt.status_contrato = 'assinado'
            AND pt.status_processo NOT IN ('compensado', 'desistiu')
        ) = 0
      ) AS todos_encerrados
    FROM public.processos_teses pt
    GROUP BY pt.cliente_id
  )
SELECT
  c.id AS cliente_id,
  COALESCE(comp.tem_compensacao_mes_corrente, false) AS tem_compensacao_mes_corrente,
  COALESCE(comp.tem_compensacao_qualquer, false)     AS tem_compensacao_qualquer,
  COALESCE(proc.tem_tese_ativa, false)               AS tem_tese_ativa,
  COALESCE(proc.tem_alguma_tese_assinada, false)     AS tem_alguma_tese_assinada,
  COALESCE(proc.todos_encerrados, false)             AS todos_encerrados,
  COALESCE(proc.tem_reporto, false)                  AS tem_reporto,
  COALESCE(proc.tem_judicial, false)                 AS tem_judicial,
  comp.ultima_competencia_compensada,
  COALESCE(c.compensando_fintax, false)              AS compensando_fintax,
  NULLIF(c.compensacao_outro_escritorio, '')         AS compensacao_outro_escritorio,
  -- Prioridade: judicial > ressarcimento > reporto > compensando > prevista > encerrado > sem_operacao
  CASE
    WHEN COALESCE(proc.tem_judicial, false) THEN 'judicial'
    WHEN COALESCE(proc.tem_ressarcimento, false) THEN 'ressarcimento'
    WHEN COALESCE(proc.tem_reporto, false) THEN 'reporto'
    WHEN COALESCE(comp.tem_compensacao_mes_corrente, false) THEN 'compensando'
    WHEN COALESCE(proc.tem_tese_ativa, false) THEN 'prevista'
    WHEN COALESCE(proc.todos_encerrados, false) THEN 'encerrado'
    ELSE 'sem_operacao'
  END AS status_principal,
  -- Nova coluna só no final (CREATE OR REPLACE não permite inserir no meio).
  COALESCE(proc.tem_ressarcimento, false)            AS tem_ressarcimento
FROM public.clientes c
LEFT JOIN comp ON comp.cliente_id = c.id
LEFT JOIN proc ON proc.cliente_id = c.id;

COMMENT ON VIEW public.v_clientes_status_compensacao IS
  'Consolida status de recuperação por cliente. '
  'tem_judicial/tem_ressarcimento vêm de processos_teses.tipo_recuperacao.';

-- ---------------------------------------------------------------------------
-- 4) Esteira — expor ramos agregados p/ tags no Kanban
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_esteira_clientes;

CREATE VIEW public.v_esteira_clientes AS
SELECT
  c.id,
  c.empresa,
  c.cnpj,
  c.segmento,
  c.regime_tributario,
  c.estagio_esteira,
  c.data_entrada_estagio,
  EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int AS dias_na_etapa,
  CASE c.estagio_esteira
    WHEN 'triagem' THEN 1
    WHEN 'levantamento' THEN 3
    WHEN 'emitir_contrato' THEN 1
    WHEN 'receber_assinado' THEN 3
    WHEN 'em_compensacao' THEN 30
    ELSE NULL
  END AS sla_dias,
  CASE
    WHEN c.estagio_esteira = 'concluido' THEN false
    WHEN c.estagio_esteira = 'triagem'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 1 THEN true
    WHEN c.estagio_esteira = 'levantamento'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 3 THEN true
    WHEN c.estagio_esteira = 'emitir_contrato'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 1 THEN true
    WHEN c.estagio_esteira = 'receber_assinado'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 3 THEN true
    WHEN c.estagio_esteira = 'em_compensacao'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 30 THEN true
    ELSE false
  END AS atrasado,
  c.responsavel_id,
  p.full_name AS responsavel_nome,
  COALESCE(l.origem, 'manual') AS origem,
  c.status,
  c.status_operacional,
  c.criado_em,
  COALESCE(ramos.tem_compensacao, false) AS tem_ramo_compensacao,
  COALESCE(ramos.tem_ressarcimento, false) AS tem_ramo_ressarcimento,
  COALESCE(ramos.tem_judicial, false) AS tem_ramo_judicial
FROM public.clientes c
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.profiles p ON p.user_id = c.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    bool_or(pt.tipo_recuperacao = 'compensacao') AS tem_compensacao,
    bool_or(pt.tipo_recuperacao = 'ressarcimento') AS tem_ressarcimento,
    bool_or(pt.tipo_recuperacao = 'recuperacao_judicial') AS tem_judicial
  FROM public.processos_teses pt
  WHERE pt.cliente_id = c.id
) ramos ON true
WHERE c.status = 'ativo';

ALTER VIEW public.v_esteira_clientes SET (security_invoker = true);
GRANT SELECT ON public.v_esteira_clientes TO authenticated;

COMMIT;
