-- Fix soma de valor compensado / saldo (Maravista, Pérola, mapas)
--
-- Problemas:
-- 1) sumCompensadoCanonical no front descartava TODAS as órfãs de um mês com
--    qualquer linha linkada (corrigido no TS). Aqui alinamos dados + view.
-- 2) IRPJ/CSLL às vezes ficou em INSUMOS (FIFO / tese_ativa) — vai para SUBVENCAO.
-- 3) processo_tese_id nulo nas cargas → Mapa Tributário não acumulava histórico.
-- 4) v_mapa_creditos: GREATEST(manual, soma_linkada) + status derivado do saldo.

BEGIN;

-- 1) Reatribui IRPJ/CSLL → Subvenção (quando a tese Subvenção existe no cliente)
UPDATE public.compensacoes_mensais cm
SET tese_origem_id = ca_sub.tese_id
FROM public.creditos_apurados ca_sub
JOIN public.teses_tributarias t_sub ON t_sub.id = ca_sub.tese_id AND t_sub.codigo = 'SUBVENCAO'
WHERE cm.cliente_id = ca_sub.cliente_id
  AND cm.tributo_enum::text IN ('IRPJ_CSLL_agregado')
  AND (
    cm.tese_origem_id IS NULL
    OR cm.tese_origem_id IN (
      SELECT ca_ins.tese_id
      FROM public.creditos_apurados ca_ins
      JOIN public.teses_tributarias t_ins ON t_ins.id = ca_ins.tese_id AND t_ins.codigo = 'INSUMOS'
      WHERE ca_ins.cliente_id = cm.cliente_id
    )
  );

-- 2) Órfãs restantes: PIS/COFINS/INSS → Insumos; ICMS → ICMS_ST
UPDATE public.compensacoes_mensais cm
SET tese_origem_id = ca.tese_id
FROM public.creditos_apurados ca
JOIN public.teses_tributarias t ON t.id = ca.tese_id
WHERE cm.cliente_id = ca.cliente_id
  AND cm.tese_origem_id IS NULL
  AND (
    (t.codigo = 'INSUMOS' AND cm.tributo_enum::text IN ('PIS', 'COFINS', 'INSS_52', 'INSS_retidos', 'outros'))
    OR (t.codigo = 'ICMS_ST' AND cm.tributo_enum::text = 'ICMS')
  );

-- 3) Backfill processo_tese_id a partir da tese_origem (1º processo da tese no cliente)
UPDATE public.compensacoes_mensais cm
SET processo_tese_id = p.id
FROM public.processos_teses p
JOIN public.teses_tributarias t ON t.codigo = p.tese
WHERE cm.cliente_id = p.cliente_id
  AND cm.tese_origem_id = t.id
  AND cm.processo_tese_id IS NULL
  AND p.id = (
    SELECT p2.id
    FROM public.processos_teses p2
    WHERE p2.cliente_id = cm.cliente_id
      AND p2.tese = t.codigo
    ORDER BY p2.criado_em NULLS LAST, p2.id
    LIMIT 1
  );

-- 4) View: piso Detalhamento + soma linkada; status pelo saldo
CREATE OR REPLACE VIEW public.v_mapa_creditos AS
SELECT
  ca.cliente_id,
  ca.tese_id,
  t.codigo AS tese_codigo,
  t.label AS tese_label,
  t.visivel_cliente,
  ca.valor_apurado_inicial,
  CASE
    WHEN t.codigo = 'REPORTO' THEN 0::numeric(14,2)
    ELSE GREATEST(
      COALESCE(ca.valor_compensado_manual, 0),
      COALESCE(comp.total_compensado, 0)
    )::numeric(14,2)
  END AS total_compensado,
  CASE
    WHEN t.codigo = 'REPORTO' THEN ca.valor_apurado_inicial::numeric(14,2)
    ELSE (
      ca.valor_apurado_inicial - GREATEST(
        COALESCE(ca.valor_compensado_manual, 0),
        COALESCE(comp.total_compensado, 0)
      )
    )::numeric(14,2)
  END AS saldo_final,
  ca.incluir_no_calculo,
  CASE
    WHEN t.codigo = 'REPORTO' THEN 'a_utilizar'::text
    WHEN GREATEST(COALESCE(ca.valor_compensado_manual, 0), COALESCE(comp.total_compensado, 0)) <= 0 THEN 'a_utilizar'::text
    WHEN (
      ca.valor_apurado_inicial - GREATEST(
        COALESCE(ca.valor_compensado_manual, 0),
        COALESCE(comp.total_compensado, 0)
      )
    ) <= 0 THEN 'utilizado'::text
    ELSE 'em_uso'::text
  END AS status_utilizacao
FROM public.creditos_apurados ca
JOIN public.teses_tributarias t ON t.id = ca.tese_id
LEFT JOIN (
  SELECT tese_origem_id, cliente_id, sum(valor_compensado) AS total_compensado
  FROM public.compensacoes_mensais
  WHERE tese_origem_id IS NOT NULL
  GROUP BY tese_origem_id, cliente_id
) comp ON comp.tese_origem_id = ca.tese_id AND comp.cliente_id = ca.cliente_id;

GRANT SELECT ON public.v_mapa_creditos TO authenticated;

COMMENT ON VIEW public.v_mapa_creditos IS
  'Mapa de créditos. total_compensado = GREATEST(Detalhamento, soma linkada). Status derivado do saldo. REPORTO = 0.';

CREATE OR REPLACE VIEW public.v_cliente_totais_calculo AS
SELECT
  ca.cliente_id,
  COALESCE(SUM(ca.valor_apurado_inicial) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS credito_apurado,
  COALESCE(SUM(
    CASE
      WHEN t.codigo = 'REPORTO' THEN 0
      ELSE GREATEST(COALESCE(ca.valor_compensado_manual, 0), COALESCE(comp.total_compensado, 0))
    END
  ) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS total_compensado,
  COALESCE(SUM(
    CASE
      WHEN t.codigo = 'REPORTO' THEN 0
      ELSE ca.valor_apurado_inicial - GREATEST(COALESCE(ca.valor_compensado_manual, 0), COALESCE(comp.total_compensado, 0))
    END
  ) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO'), 0)::numeric(14,2) AS saldo_restante,
  COALESCE(SUM(ca.valor_apurado_inicial) FILTER (WHERE NOT ca.incluir_no_calculo OR t.codigo = 'REPORTO'), 0)::numeric(14,2) AS possiveis_creditos_futuros,
  COUNT(*) FILTER (WHERE ca.incluir_no_calculo AND t.codigo <> 'REPORTO') AS teses_no_calculo,
  COUNT(*) FILTER (WHERE NOT ca.incluir_no_calculo OR t.codigo = 'REPORTO') AS teses_fora_calculo
FROM public.creditos_apurados ca
JOIN public.teses_tributarias t ON t.id = ca.tese_id
LEFT JOIN (
  SELECT tese_origem_id, cliente_id, sum(valor_compensado) AS total_compensado
  FROM public.compensacoes_mensais
  WHERE tese_origem_id IS NOT NULL
  GROUP BY tese_origem_id, cliente_id
) comp ON comp.tese_origem_id = ca.tese_id AND comp.cliente_id = ca.cliente_id
GROUP BY ca.cliente_id;

GRANT SELECT ON public.v_cliente_totais_calculo TO authenticated;

COMMENT ON VIEW public.v_cliente_totais_calculo IS
  'KPIs com teses no cálculo. Compensado = GREATEST(Detalhamento, soma linkada). REPORTO em possíveis futuros.';

-- 5) Sincroniza status_utilizacao persistido com o saldo recalculado
UPDATE public.creditos_apurados ca
SET
  status_utilizacao = v.status_utilizacao,
  atualizado_em = now()
FROM public.v_mapa_creditos v
WHERE ca.cliente_id = v.cliente_id
  AND ca.tese_id = v.tese_id
  AND COALESCE(ca.status_utilizacao, '') IS DISTINCT FROM COALESCE(v.status_utilizacao, '');

COMMIT;
