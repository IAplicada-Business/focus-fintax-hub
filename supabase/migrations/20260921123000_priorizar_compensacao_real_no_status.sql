-- REPORTO é uma tese/possível futuro; movimento no mês corrente é status
-- operacional real e deve ter precedência para todos os recortes gerenciais.
CREATE OR REPLACE VIEW public.v_clientes_status_compensacao AS
WITH
  comp AS (
    SELECT
      cm.cliente_id,
      bool_or(
        cm.valor_compensado > 0
        AND date_trunc('month', cm.mes_referencia) = date_trunc('month', current_date)
        AND COALESCE(t.codigo::text, '') <> 'REPORTO'
        AND COALESCE(pt.categoria::text, '') <> 'reporto'
        AND upper(COALESCE(pt.tese::text, '')) <> 'REPORTO'
      ) AS tem_compensacao_mes_corrente,
      bool_or(
        cm.valor_compensado > 0
        AND COALESCE(t.codigo::text, '') <> 'REPORTO'
        AND COALESCE(pt.categoria::text, '') <> 'reporto'
        AND upper(COALESCE(pt.tese::text, '')) <> 'REPORTO'
      ) AS tem_compensacao_qualquer,
      max(cm.mes_referencia) FILTER (
        WHERE cm.valor_compensado > 0
          AND COALESCE(t.codigo::text, '') <> 'REPORTO'
          AND COALESCE(pt.categoria::text, '') <> 'reporto'
          AND upper(COALESCE(pt.tese::text, '')) <> 'REPORTO'
      ) AS ultima_competencia_compensada
    FROM public.compensacoes_mensais cm
    LEFT JOIN public.teses_tributarias t ON t.id = cm.tese_origem_id
    LEFT JOIN public.processos_teses pt ON pt.id = cm.processo_tese_id
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
  CASE
    WHEN COALESCE(comp.tem_compensacao_mes_corrente, false) THEN 'compensando'
    WHEN COALESCE(proc.tem_reporto, false) THEN 'reporto'
    WHEN COALESCE(proc.tem_tese_ativa, false) THEN 'prevista'
    WHEN COALESCE(proc.todos_encerrados, false) THEN 'encerrado'
    ELSE 'sem_operacao'
  END AS status_principal,
  COALESCE(proc.tem_ressarcimento, false)            AS tem_ressarcimento
FROM public.clientes c
LEFT JOIN comp ON comp.cliente_id = c.id
LEFT JOIN proc ON proc.cliente_id = c.id;

COMMENT ON VIEW public.v_clientes_status_compensacao IS
  'Consolida status operacional por cliente. Movimento no mês corrente tem '
  'precedência sobre REPORTO; ramo permanece dimensão independente.';
