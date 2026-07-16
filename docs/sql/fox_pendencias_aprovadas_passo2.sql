-- =============================================================================
-- PASSO 2/2 — views, tese_ativa, promove ICMS, backfill tese_origem_id
-- Rodar SÓ depois do PASSO 1 ter sucesso (enum ICMS já commitado).
--
-- Idempotente. Consolida órfãs e faz MERGE no backfill (evita UNIQUE 23505).
-- Aggregações vão para TEMP TABLE (evita alias "agg" que o Lovable/PG
-- interpretou como tabela "coalesce" → erro 42P01).
-- =============================================================================

BEGIN;

-- 1) Views com security_invoker
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_mapa_creditos') THEN
    EXECUTE 'ALTER VIEW public.v_mapa_creditos SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_cliente_totais_calculo') THEN
    EXECUTE 'ALTER VIEW public.v_cliente_totais_calculo SET (security_invoker = true)';
  END IF;
END $$;

-- 2) Tese ativa por cliente
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tese_ativa_id uuid REFERENCES public.teses_tributarias(id);

COMMENT ON COLUMN public.clientes.tese_ativa_id IS
  'Tese em uso para novas compensações. Troca de tese = atualizar este campo; histórico mensal permanece.';

CREATE INDEX IF NOT EXISTS ix_clientes_tese_ativa ON public.clientes(tese_ativa_id);

UPDATE public.clientes c
SET tese_ativa_id = sub.tese_id
FROM (
  SELECT DISTINCT ON (ca.cliente_id)
    ca.cliente_id,
    ca.tese_id
  FROM public.creditos_apurados ca
  JOIN public.teses_tributarias t ON t.id = ca.tese_id
  WHERE ca.incluir_no_calculo = true
  ORDER BY ca.cliente_id,
    CASE ca.status_utilizacao WHEN 'em_uso' THEN 0 WHEN 'a_utilizar' THEN 1 ELSE 2 END,
    CASE t.codigo WHEN 'INSUMOS' THEN 0 WHEN 'SUBVENCAO' THEN 1 ELSE 2 END
) sub
WHERE c.id = sub.cliente_id
  AND c.tese_ativa_id IS NULL;

-- 3a) Consolida órfãs duplicadas (mesmo cliente+mês+tributo, tese NULL)
CREATE TEMP TABLE tmp_dup_keep ON COMMIT DROP AS
SELECT DISTINCT ON (cliente_id, mes_referencia, tributo_enum)
  id AS keep_id,
  cliente_id,
  mes_referencia,
  tributo_enum
FROM public.compensacoes_mensais
WHERE tese_origem_id IS NULL
ORDER BY cliente_id, mes_referencia, tributo_enum, criado_em NULLS LAST, id;

CREATE TEMP TABLE tmp_dup_drop ON COMMIT DROP AS
SELECT cm.id AS drop_id, k.keep_id
FROM public.compensacoes_mensais cm
JOIN tmp_dup_keep k
  ON k.cliente_id = cm.cliente_id
 AND k.mes_referencia = cm.mes_referencia
 AND k.tributo_enum = cm.tributo_enum
WHERE cm.tese_origem_id IS NULL
  AND cm.id <> k.keep_id;

UPDATE public.dcomps d
SET compensacao_id = t.keep_id
FROM tmp_dup_drop t
WHERE d.compensacao_id = t.drop_id
  AND NOT EXISTS (
    SELECT 1 FROM public.dcomps x
    WHERE x.compensacao_id = t.keep_id
      AND x.numero_declaracao = d.numero_declaracao
  );

DELETE FROM public.dcomps d
USING tmp_dup_drop t
WHERE d.compensacao_id = t.drop_id;

CREATE TEMP TABLE tmp_dup_sums ON COMMIT DROP AS
SELECT
  t.keep_id,
  SUM(COALESCE(cm.valor_compensado, 0)) AS extra_valor,
  SUM(COALESCE(cm.honorario_valor, 0)) AS extra_hon,
  SUM(COALESCE(cm.nfse_valor, 0)) AS extra_nfse,
  BOOL_OR(COALESCE(cm.lancado_mapa, false)) AS extra_mapa
FROM tmp_dup_drop t
JOIN public.compensacoes_mensais cm ON cm.id = t.drop_id
GROUP BY t.keep_id;

UPDATE public.compensacoes_mensais AS k
SET
  valor_compensado = COALESCE(k.valor_compensado, 0) + s.extra_valor,
  honorario_valor = COALESCE(k.honorario_valor, 0) + s.extra_hon,
  nfse_valor = COALESCE(k.nfse_valor, 0) + s.extra_nfse,
  lancado_mapa = k.lancado_mapa OR COALESCE(s.extra_mapa, false)
FROM tmp_dup_sums AS s
WHERE k.id = s.keep_id;

DELETE FROM public.compensacoes_mensais cm
USING tmp_dup_drop t
WHERE cm.id = t.drop_id;

-- 3b) Promove ICMS (outros → ICMS)
CREATE TEMP TABLE tmp_icms_promo ON COMMIT DROP AS
SELECT id
FROM public.compensacoes_mensais
WHERE tributo_enum = 'outros'
  AND (
    observacao ILIKE '%ICMS%importado do formato novo_icms%'
    OR observacao ILIKE '%ICMS — importado%'
    OR observacao ILIKE '%ICMS — importado do formato%'
  );

UPDATE public.compensacoes_mensais AS cm
SET tributo_enum = 'ICMS'::public.tributo,
    tributo = 'ICMS'
WHERE cm.id IN (SELECT id FROM tmp_icms_promo)
  AND NOT EXISTS (
    SELECT 1 FROM public.compensacoes_mensais AS x
    WHERE x.cliente_id = cm.cliente_id
      AND x.mes_referencia = cm.mes_referencia
      AND x.tributo_enum = 'ICMS'::public.tributo
      AND x.tese_origem_id IS NOT DISTINCT FROM cm.tese_origem_id
      AND x.id <> cm.id
  );

CREATE TEMP TABLE tmp_icms_merge ON COMMIT DROP AS
SELECT cm.id AS from_id, x.id AS to_id
FROM public.compensacoes_mensais AS cm
JOIN public.compensacoes_mensais AS x
  ON x.cliente_id = cm.cliente_id
 AND x.mes_referencia = cm.mes_referencia
 AND x.tributo_enum = 'ICMS'::public.tributo
 AND x.tese_origem_id IS NOT DISTINCT FROM cm.tese_origem_id
 AND x.id <> cm.id
WHERE cm.id IN (SELECT id FROM tmp_icms_promo)
  AND cm.tributo_enum = 'outros';

UPDATE public.dcomps AS d
SET compensacao_id = t.to_id
FROM tmp_icms_merge AS t
WHERE d.compensacao_id = t.from_id
  AND NOT EXISTS (
    SELECT 1 FROM public.dcomps AS x
    WHERE x.compensacao_id = t.to_id AND x.numero_declaracao = d.numero_declaracao
  );

DELETE FROM public.dcomps AS d
USING tmp_icms_merge AS t
WHERE d.compensacao_id = t.from_id;

CREATE TEMP TABLE tmp_icms_sums ON COMMIT DROP AS
SELECT
  t.to_id,
  SUM(COALESCE(cm.valor_compensado, 0)) AS extra_valor,
  SUM(COALESCE(cm.honorario_valor, 0)) AS extra_hon,
  BOOL_OR(COALESCE(cm.lancado_mapa, false)) AS extra_mapa
FROM tmp_icms_merge AS t
JOIN public.compensacoes_mensais AS cm ON cm.id = t.from_id
GROUP BY t.to_id;

UPDATE public.compensacoes_mensais AS dest
SET
  valor_compensado = COALESCE(dest.valor_compensado, 0) + s.extra_valor,
  honorario_valor = COALESCE(dest.honorario_valor, 0) + s.extra_hon,
  lancado_mapa = dest.lancado_mapa OR COALESCE(s.extra_mapa, false)
FROM tmp_icms_sums AS s
WHERE dest.id = s.to_id;

DELETE FROM public.compensacoes_mensais AS cm
USING tmp_icms_merge AS t
WHERE cm.id = t.from_id;

-- 4) Backfill tese_origem_id — FIFO
CREATE TEMP TABLE tmp_alloc (
  compensacao_id uuid PRIMARY KEY,
  tese_id uuid NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  r_cli RECORD;
  r_comp RECORD;
  v_tese uuid;
BEGIN
  FOR r_cli IN
    SELECT DISTINCT cliente_id FROM public.compensacoes_mensais WHERE tese_origem_id IS NULL
  LOOP
    CREATE TEMP TABLE tmp_saldo (
      tese_id uuid PRIMARY KEY,
      restante numeric NOT NULL,
      ord int NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_saldo (tese_id, restante, ord)
    SELECT
      ca.tese_id,
      GREATEST(
        ca.valor_apurado_inicial - COALESCE((
          SELECT SUM(cm.valor_compensado)
          FROM public.compensacoes_mensais cm
          WHERE cm.cliente_id = ca.cliente_id AND cm.tese_origem_id = ca.tese_id
        ), 0),
        0
      ),
      CASE t.codigo
        WHEN 'INSUMOS' THEN 1
        WHEN 'SUBVENCAO' THEN 2
        WHEN 'ICMS_ST' THEN 3
        WHEN 'PREVIDENCIARIO' THEN 4
        ELSE 9
      END
    FROM public.creditos_apurados ca
    JOIN public.teses_tributarias t ON t.id = ca.tese_id
    WHERE ca.cliente_id = r_cli.cliente_id
      AND ca.incluir_no_calculo = true;

    FOR r_comp IN
      SELECT id, COALESCE(valor_compensado, 0) AS valor
      FROM public.compensacoes_mensais
      WHERE cliente_id = r_cli.cliente_id
        AND tese_origem_id IS NULL
      ORDER BY mes_referencia NULLS LAST, criado_em NULLS LAST, id
    LOOP
      SELECT s.tese_id INTO v_tese
      FROM tmp_saldo s
      WHERE s.restante > 0.009
      ORDER BY s.ord
      LIMIT 1;

      IF v_tese IS NULL THEN
        SELECT COALESCE(
          (SELECT tese_ativa_id FROM public.clientes WHERE id = r_cli.cliente_id),
          (SELECT tese_id FROM tmp_saldo ORDER BY ord LIMIT 1)
        ) INTO v_tese;
      END IF;

      IF v_tese IS NOT NULL THEN
        INSERT INTO tmp_alloc (compensacao_id, tese_id)
        VALUES (r_comp.id, v_tese)
        ON CONFLICT DO NOTHING;

        UPDATE tmp_saldo
        SET restante = restante - r_comp.valor
        WHERE tese_id = v_tese;
      END IF;
    END LOOP;

    DROP TABLE tmp_saldo;
  END LOOP;
END $$;

-- 4a) MERGE se a chave (cliente,mês,tributo,tese) já existir
CREATE TEMP TABLE tmp_merge_target ON COMMIT DROP AS
SELECT
  a.compensacao_id AS from_id,
  exist.id AS to_id
FROM tmp_alloc a
JOIN public.compensacoes_mensais AS orphan ON orphan.id = a.compensacao_id
JOIN public.compensacoes_mensais AS exist
  ON exist.cliente_id = orphan.cliente_id
 AND exist.mes_referencia = orphan.mes_referencia
 AND exist.tributo_enum = orphan.tributo_enum
 AND exist.tese_origem_id = a.tese_id
 AND exist.id <> orphan.id;

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
  BOOL_OR(COALESCE(cm.lancado_mapa, false)) AS extra_mapa
FROM tmp_merge_target AS t
JOIN public.compensacoes_mensais AS cm ON cm.id = t.from_id
GROUP BY t.to_id;

UPDATE public.compensacoes_mensais AS dest
SET
  valor_compensado = COALESCE(dest.valor_compensado, 0) + s.extra_valor,
  honorario_valor = COALESCE(dest.honorario_valor, 0) + s.extra_hon,
  lancado_mapa = dest.lancado_mapa OR COALESCE(s.extra_mapa, false)
FROM tmp_merge_sums AS s
WHERE dest.id = s.to_id;

DELETE FROM public.compensacoes_mensais AS cm
USING tmp_merge_target AS t
WHERE cm.id = t.from_id;

DELETE FROM tmp_alloc AS a
USING tmp_merge_target AS t
WHERE a.compensacao_id = t.from_id;

-- 4b) UPDATE seguro nas órfãs restantes
UPDATE public.compensacoes_mensais AS cm
SET tese_origem_id = a.tese_id
FROM tmp_alloc AS a
WHERE cm.id = a.compensacao_id
  AND cm.tese_origem_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.compensacoes_mensais AS x
    WHERE x.cliente_id = cm.cliente_id
      AND x.mes_referencia = cm.mes_referencia
      AND x.tributo_enum = cm.tributo_enum
      AND x.tese_origem_id = a.tese_id
      AND x.id <> cm.id
  );

COMMIT;
