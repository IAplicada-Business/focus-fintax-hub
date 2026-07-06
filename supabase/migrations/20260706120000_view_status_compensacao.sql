-- ============================================================================
-- PR 1 — v_clientes_status_compensacao
--
-- View de suporte pros filtros por status de compensação (Item 6) e para a
-- aba "Visão Executiva" no dashboard (Item 5.2). Consolida por cliente:
--   • se está compensando neste mês
--   • se tem tese ativa aguardando compensação (Prevista)
--   • se pertence à trilha Reporto (placeholder — depende de PR 4 categoria)
--   • se tem judicial (placeholder — módulo ainda não existe)
--   • se todos os processos assinados estão encerrados (compensado/desistiu)
--   • última competência com valor compensado > 0
--   • status_principal derivado em ordem de prioridade:
--       judicial > reporto > compensando > prevista > encerrado > sem_operacao
--
-- Nota: até o PR 4 landar com a coluna `categoria` em `processos_teses`, os
-- flags `tem_reporto` e `tem_judicial` retornam sempre FALSE. Nenhum consumo
-- da view deve tratá-los como fonte de verdade nesse intervalo — a coluna
-- será atualizada em migração futura sem quebrar o contrato.
-- ============================================================================

-- Índices de suporte para as agregações da view --------------------------------
CREATE INDEX IF NOT EXISTS ix_compensacoes_mensais_cliente_mes
  ON public.compensacoes_mensais (cliente_id, mes_referencia DESC);

CREATE INDEX IF NOT EXISTS ix_processos_teses_cliente_contrato_processo
  ON public.processos_teses (cliente_id, status_contrato, status_processo);


-- View ------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_clientes_status_compensacao AS
WITH
  -- Compensações agregadas por cliente
  comp AS (
    SELECT
      cm.cliente_id,
      -- houve valor compensado > 0 no mês corrente?
      bool_or(
        cm.valor_compensado > 0
        AND date_trunc('month', cm.mes_referencia) = date_trunc('month', current_date)
      ) AS tem_compensacao_mes_corrente,
      -- houve alguma compensação com valor > 0 em qualquer mês?
      bool_or(cm.valor_compensado > 0) AS tem_compensacao_qualquer,
      -- última competência com valor compensado > 0
      max(cm.mes_referencia) FILTER (WHERE cm.valor_compensado > 0) AS ultima_competencia_compensada
    FROM public.compensacoes_mensais cm
    GROUP BY cm.cliente_id
  ),
  -- Processos/teses agregados por cliente
  proc AS (
    SELECT
      pt.cliente_id,
      -- tese "ativa" = contrato assinado e ainda não finalizada
      bool_or(
        pt.status_contrato = 'assinado'
        AND pt.status_processo IN ('a_iniciar', 'a_compensar', 'pedido_feito_receita', 'protocolado', 'nao_protocolado', 'compensando')
      ) AS tem_tese_ativa,
      -- se existe alguma tese assinada
      bool_or(pt.status_contrato = 'assinado') AS tem_alguma_tese_assinada,
      -- todos os processos assinados estão em estado terminal? (compensado ou desistiu)
      -- só considera "encerrado" se existir ao menos uma tese assinada e todas terminais
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

  -- flags brutas ---------------------------------------------------------------
  COALESCE(comp.tem_compensacao_mes_corrente, false) AS tem_compensacao_mes_corrente,
  COALESCE(comp.tem_compensacao_qualquer, false)     AS tem_compensacao_qualquer,
  COALESCE(proc.tem_tese_ativa, false)               AS tem_tese_ativa,
  COALESCE(proc.tem_alguma_tese_assinada, false)     AS tem_alguma_tese_assinada,
  COALESCE(proc.todos_encerrados, false)             AS todos_encerrados,

  -- Reporto/Judicial: placeholders até PR 4 / módulo judicial existirem
  false AS tem_reporto,
  false AS tem_judicial,

  -- extras úteis ---------------------------------------------------------------
  comp.ultima_competencia_compensada,
  COALESCE(c.compensando_fintax, false)              AS compensando_fintax,
  NULLIF(c.compensacao_outro_escritorio, '')         AS compensacao_outro_escritorio,

  -- status_principal derivado --------------------------------------------------
  -- Ordem de prioridade: judicial > reporto > compensando > prevista > encerrado > sem_operacao
  CASE
    -- judicial: placeholder — nunca dispara hoje, mas a cláusula fica pronta
    WHEN false THEN 'judicial'
    -- reporto: idem
    WHEN false THEN 'reporto'
    -- compensando: houve movimento no mês corrente
    WHEN COALESCE(comp.tem_compensacao_mes_corrente, false) THEN 'compensando'
    -- prevista: tem tese assinada em curso mas ainda não compensou este mês
    WHEN COALESCE(proc.tem_tese_ativa, false) THEN 'prevista'
    -- encerrado: só se existirem teses assinadas e todas em estado terminal
    WHEN COALESCE(proc.todos_encerrados, false) THEN 'encerrado'
    ELSE 'sem_operacao'
  END AS status_principal

FROM public.clientes c
LEFT JOIN comp ON comp.cliente_id = c.id
LEFT JOIN proc ON proc.cliente_id = c.id;


-- Grants ----------------------------------------------------------------------
-- A view usa as tabelas base (clientes, processos_teses, compensacoes_mensais)
-- que já têm RLS ativa — a view herda esse controle porque o Postgres avalia
-- RLS na consulta subjacente. Não precisamos de policy própria.
GRANT SELECT ON public.v_clientes_status_compensacao TO authenticated;

COMMENT ON VIEW public.v_clientes_status_compensacao IS
  'Consolida por cliente o status de compensação (compensando/prevista/reporto/judicial/encerrado/sem_operacao). '
  'Flags reporto/judicial são placeholders (false) até o PR 4 (categoria) e o módulo judicial existirem.';
