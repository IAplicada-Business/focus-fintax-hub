-- ============================================================================
-- PR 4 — Coluna `categoria` (compensacao | reporto) em processos_teses
--         + atualização de v_clientes_status_compensacao pra passar a
--         detectar reporto de verdade (era placeholder no PR 1).
--
-- Contexto: Reporto trabalha com PIS/COFINS acumulado numa dinâmica bem
-- diferente da compensação administrativa comum. Precisamos distinguir os
-- dois pra o dashboard executivo (PR 10), pro filtro por status (PR 7) e
-- pros cards do Resumo Financeiro (RBAC nos cards).
--
-- Vocabulário: 'compensacao' | 'reporto' (CHECK constraint — set fechado)
-- Default: 'compensacao'
-- ============================================================================

-- 1) Coluna --------------------------------------------------------------------
ALTER TABLE public.processos_teses
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'compensacao';

-- CHECK constraint (nome estável pra permitir DROP em migration futura).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'processos_teses_categoria_check'
  ) THEN
    ALTER TABLE public.processos_teses
      ADD CONSTRAINT processos_teses_categoria_check
      CHECK (categoria IN ('compensacao', 'reporto'));
  END IF;
END $$;

COMMENT ON COLUMN public.processos_teses.categoria IS
  'Trilha do processo: compensacao (default) ou reporto (regime PIS/COFINS acumulado).';


-- 2) Backfill ------------------------------------------------------------------
-- Só toca linhas ainda no default. Reporto identificado por nome_exibicao/tese.
UPDATE public.processos_teses
SET categoria = 'reporto'
WHERE categoria = 'compensacao'
  AND (
    nome_exibicao ILIKE '%reporto%'
    OR tese ILIKE '%reporto%'
  );


-- 3) Índice --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_processos_teses_cliente_categoria
  ON public.processos_teses (cliente_id, categoria);


-- 4) Atualiza v_clientes_status_compensacao ------------------------------------
-- Agora tem_reporto sai da categoria de verdade. status_principal também passa
-- a priorizar reporto (>compensando>prevista>encerrado>sem_operacao).
--
-- CREATE OR REPLACE preserva grants existentes.
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
        AND pt.status_processo IN ('a_iniciar', 'a_compensar', 'pedido_feito_receita', 'protocolado', 'nao_protocolado', 'compensando')
      ) AS tem_tese_ativa,
      bool_or(pt.status_contrato = 'assinado') AS tem_alguma_tese_assinada,
      -- reporto: existe processo assinado categorizado como reporto e ainda em curso
      bool_or(
        pt.categoria = 'reporto'
        AND pt.status_contrato = 'assinado'
        AND pt.status_processo <> 'desistiu'
      ) AS tem_reporto,
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
  false AS tem_judicial,   -- módulo ainda não existe

  comp.ultima_competencia_compensada,
  COALESCE(c.compensando_fintax, false)              AS compensando_fintax,
  NULLIF(c.compensacao_outro_escritorio, '')         AS compensacao_outro_escritorio,

  -- Prioridade: judicial > reporto > compensando > prevista > encerrado > sem_operacao
  CASE
    WHEN false THEN 'judicial'
    WHEN COALESCE(proc.tem_reporto, false) THEN 'reporto'
    WHEN COALESCE(comp.tem_compensacao_mes_corrente, false) THEN 'compensando'
    WHEN COALESCE(proc.tem_tese_ativa, false) THEN 'prevista'
    WHEN COALESCE(proc.todos_encerrados, false) THEN 'encerrado'
    ELSE 'sem_operacao'
  END AS status_principal

FROM public.clientes c
LEFT JOIN comp ON comp.cliente_id = c.id
LEFT JOIN proc ON proc.cliente_id = c.id;

COMMENT ON VIEW public.v_clientes_status_compensacao IS
  'Consolida por cliente o status de compensação (reporto/compensando/prevista/encerrado/sem_operacao). '
  'tem_judicial segue placeholder (false) até o módulo judicial existir.';
