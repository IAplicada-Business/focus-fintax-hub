-- Fix soma de valor compensado / saldo (Maravista, Pérola, mapas)
-- Idempotente. Pode rerodar após o erro 23505 (unique compensacoes_mensais).
--
-- Problemas:
-- 1) Órfãs / IRPJ mal atribuído → reatribui por tributo
-- 2) UPDATE direto em tese_origem_id estoura UNIQUE (cliente, mês, tributo, tese)
--    → faz MERGE (soma + apaga origem) antes do UPDATE seguro
-- 3) processo_tese_id nulo nas cargas
-- 4) v_mapa_creditos: GREATEST(manual, soma_linkada) + status pelo saldo

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Plano de alocação: compensacao_id → tese alvo
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_tese_alloc (
  compensacao_id uuid PRIMARY KEY,
  tese_id uuid NOT NULL
) ON COMMIT DROP;

-- IRPJ/CSLL → Subvenção (órfã ou ainda em Insumos)
INSERT INTO tmp_tese_alloc (compensacao_id, tese_id)
SELECT cm.id, ca_sub.tese_id
FROM public.compensacoes_mensais cm
JOIN public.creditos_apurados ca_sub
  ON ca_sub.cliente_id = cm.cliente_id
JOIN public.teses_tributarias t_sub
  ON t_sub.id = ca_sub.tese_id AND t_sub.codigo = 'SUBVENCAO'
WHERE cm.tributo_enum::text = 'IRPJ_CSLL_agregado'
  AND (
    cm.tese_origem_id IS NULL
    OR cm.tese_origem_id IN (
      SELECT ca_ins.tese_id
      FROM public.creditos_apurados ca_ins
      JOIN public.teses_tributarias t_ins ON t_ins.id = ca_ins.tese_id AND t_ins.codigo = 'INSUMOS'
      WHERE ca_ins.cliente_id = cm.cliente_id
    )
  )
  AND (cm.tese_origem_id IS DISTINCT FROM ca_sub.tese_id)
ON CONFLICT DO NOTHING;

-- Órfãs restantes: PIS/COFINS/INSS → Insumos; ICMS → ICMS_ST
INSERT INTO tmp_tese_alloc (compensacao_id, tese_id)
SELECT cm.id, ca.tese_id
FROM public.compensacoes_mensais cm
JOIN public.creditos_apurados ca ON ca.cliente_id = cm.cliente_id
JOIN public.teses_tributarias t ON t.id = ca.tese_id
WHERE cm.tese_origem_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM tmp_tese_alloc a WHERE a.compensacao_id = cm.id)
  AND (
    (t.codigo = 'INSUMOS' AND cm.tributo_enum::text IN ('PIS', 'COFINS', 'INSS_52', 'INSS_retidos', 'outros'))
    OR (t.codigo = 'ICMS_ST' AND cm.tributo_enum::text = 'ICMS')
  )
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1) MERGE quando a chave (cliente, mês, tributo, tese) já existe
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_merge_target ON COMMIT DROP AS
SELECT
  a.compensacao_id AS from_id,
  exist.id AS to_id
FROM tmp_tese_alloc a
JOIN public.compensacoes_mensais AS orphan ON orphan.id = a.compensacao_id
JOIN public.compensacoes_mensais AS exist
  ON exist.cliente_id = orphan.cliente_id
 AND exist.mes_referencia = orphan.mes_referencia
 AND exist.tributo_enum = orphan.tributo_enum
 AND exist.tese_origem_id = a.tese_id
 AND exist.id <> orphan.id;

-- Move DCOMPs da origem para o destino (sem duplicar número)
UPDATE public.dcomps AS d
SET compensacao_id = t.to_id
FROM tmp_merge_target AS t
WHERE d.compensacao_id = t.from_id
  AND NOT EXISTS (
    SELECT 1 FROM public.dcomps AS x
    WHERE x.compensacao_id = t.to_id AND x.numero_declaracao = d.numero_declaracao
  );

DELETE FROM public.dcomps AS d
USING tmp_merge_target AS t
WHERE d.compensacao_id = t.from_id;

CREATE TEMP TABLE tmp_merge_sums ON COMMIT DROP AS
SELECT
  t.to_id,
  SUM(COALESCE(cm.valor_compensado, 0)) AS extra_valor,
  SUM(COALESCE(cm.honorario_valor, 0)) AS extra_hon,
  SUM(COALESCE(cm.valor_nf_servico, 0)) AS extra_nf,
  BOOL_OR(COALESCE(cm.lancado_mapa, false)) AS extra_mapa
FROM tmp_merge_target AS t
JOIN public.compensacoes_mensais AS cm ON cm.id = t.from_id
GROUP BY t.to_id;

UPDATE public.compensacoes_mensais AS dest
SET
  valor_compensado = COALESCE(dest.valor_compensado, 0) + s.extra_valor,
  honorario_valor = COALESCE(dest.honorario_valor, 0) + s.extra_hon,
  valor_nf_servico = COALESCE(dest.valor_nf_servico, 0) + s.extra_nf,
  lancado_mapa = dest.lancado_mapa OR COALESCE(s.extra_mapa, false)
FROM tmp_merge_sums AS s
WHERE dest.id = s.to_id;

DELETE FROM public.compensacoes_mensais AS cm
USING tmp_merge_target AS t
WHERE cm.id = t.from_id;

DELETE FROM tmp_tese_alloc AS a
USING tmp_merge_target AS t
WHERE a.compensacao_id = t.from_id;

-- ---------------------------------------------------------------------------
-- 2) UPDATE seguro nas linhas restantes (sem colisão de UNIQUE)
-- ---------------------------------------------------------------------------
UPDATE public.compensacoes_mensais AS cm
SET tese_origem_id = a.tese_id
FROM tmp_tese_alloc AS a
WHERE cm.id = a.compensacao_id
  AND cm.tese_origem_id IS DISTINCT FROM a.tese_id
  AND NOT EXISTS (
    SELECT 1 FROM public.compensacoes_mensais AS x
    WHERE x.cliente_id = cm.cliente_id
      AND x.mes_referencia = cm.mes_referencia
      AND x.tributo_enum = cm.tributo_enum
      AND x.tese_origem_id = a.tese_id
      AND x.id <> cm.id
  );

-- ---------------------------------------------------------------------------
-- 3) Backfill processo_tese_id a partir da tese_origem
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4) Views
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5) Sincroniza status_utilizacao com o saldo recalculado
-- ---------------------------------------------------------------------------
UPDATE public.creditos_apurados ca
SET
  status_utilizacao = v.status_utilizacao,
  atualizado_em = now()
FROM public.v_mapa_creditos v
WHERE ca.cliente_id = v.cliente_id
  AND ca.tese_id = v.tese_id
  AND COALESCE(ca.status_utilizacao, '') IS DISTINCT FROM COALESCE(v.status_utilizacao, '');

COMMIT;
