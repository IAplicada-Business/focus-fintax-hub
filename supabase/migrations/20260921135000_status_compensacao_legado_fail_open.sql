-- Hotfix pós-PR 133: classifica sinais legados sem transformar ausência de
-- preenchimento em "encerrado" nem esconder a carteira dos dashboards.
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
        AND COALESCE(pt.status_processo::text, '') NOT IN ('compensado', 'desistiu')
      ) AS tem_tese_ativa,
      bool_or(pt.status_contrato = 'assinado') AS tem_alguma_tese_assinada,
      bool_or(
        (
          COALESCE(pt.categoria::text, '') = 'reporto'
          OR upper(COALESCE(pt.tese::text, '')) = 'REPORTO'
        )
        AND pt.status_contrato = 'assinado'
        AND COALESCE(pt.status_processo::text, '') <> 'desistiu'
      ) AS tem_reporto,
      bool_or(
        pt.tipo_recuperacao = 'recuperacao_judicial'
        AND pt.status_contrato = 'assinado'
        AND COALESCE(pt.status_processo::text, '') <> 'desistiu'
      ) AS tem_judicial,
      bool_or(
        pt.tipo_recuperacao = 'ressarcimento'
        AND pt.status_contrato = 'assinado'
        AND COALESCE(pt.status_processo::text, '') <> 'desistiu'
      ) AS tem_ressarcimento,
      (
        count(*) FILTER (WHERE pt.status_contrato = 'assinado') > 0
        AND COALESCE(
          bool_and(
            COALESCE(pt.status_processo::text, '') IN ('compensado', 'desistiu')
          ) FILTER (WHERE pt.status_contrato = 'assinado'),
          false
        )
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
    WHEN COALESCE(comp.tem_compensacao_mes_corrente, false)
      OR COALESCE(c.compensando_fintax, false)
      THEN 'compensando'
    WHEN COALESCE(proc.tem_reporto, false) THEN 'reporto'
    WHEN COALESCE(proc.tem_tese_ativa, false)
      OR c.tese_ativa_id IS NOT NULL
      OR c.status_operacional::text IN ('ativo', 'em_analise', 'relatorio_enviado')
      THEN 'prevista'
    WHEN COALESCE(proc.todos_encerrados, false)
      OR c.status_operacional::text = 'fechado'
      THEN 'encerrado'
    ELSE 'sem_operacao'
  END AS status_principal,
  COALESCE(proc.tem_ressarcimento, false) AS tem_ressarcimento
FROM public.clientes c
LEFT JOIN comp ON comp.cliente_id = c.id
LEFT JOIN proc ON proc.cliente_id = c.id;

COMMENT ON VIEW public.v_clientes_status_compensacao IS
  'Status de compensação reconciliado com sinais atuais e legados. Ausência '
  'de status_processo não significa encerrado; REPORTO aceita categoria ou tese.';
