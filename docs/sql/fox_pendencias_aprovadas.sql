-- =============================================================================
-- Fox — pendências aprovadas (16/jul/2026)
--  1) security_invoker nas views (Reporto não vaza pra comercial/cliente)
--  2) enum tributo += ICMS
--  3) clientes.tese_ativa_id (troca de tese em uso)
--  4) backfill tese_origem_id nas compensações do fluxo (FIFO Insumos→Subvenção)
--  5) promove linhas ICMS gravadas como 'outros' → 'ICMS'
-- =============================================================================

BEGIN;

-- 1) Views com security_invoker (respeitam RLS do caller)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_mapa_creditos') THEN
    EXECUTE 'ALTER VIEW public.v_mapa_creditos SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_cliente_totais_calculo') THEN
    EXECUTE 'ALTER VIEW public.v_cliente_totais_calculo SET (security_invoker = true)';
  END IF;
END $$;

-- 2) ICMS como tributo próprio
DO $$ BEGIN
  ALTER TYPE public.tributo ADD VALUE IF NOT EXISTS 'ICMS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 3) Tese ativa por cliente (próximas compensações consomem deste saldo)
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tese_ativa_id uuid REFERENCES public.teses_tributarias(id);

COMMENT ON COLUMN public.clientes.tese_ativa_id IS
  'Tese em uso para novas compensações. Troca de tese = atualizar este campo; histórico mensal permanece.';

CREATE INDEX IF NOT EXISTS ix_clientes_tese_ativa ON public.clientes(tese_ativa_id);

-- Seed inicial: tese em_uso com incluir_no_calculo, senão INSUMOS, senão SUBVENCAO
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

-- 4) Promove ICMS que entrou como 'outros' (observação do parser novo_icms)
UPDATE public.compensacoes_mensais
SET tributo_enum = 'ICMS'::public.tributo,
    tributo = 'ICMS'
WHERE tributo_enum = 'outros'
  AND observacao ILIKE '%ICMS%importado do formato novo_icms%';

-- 5) Backfill tese_origem_id — FIFO por cliente (INSUMOS → SUBVENCAO → demais do cálculo)
--    Capacidade = valor_apurado_inicial − já alocado. Só linhas com tese_origem_id NULL.
CREATE TEMP TABLE tmp_alloc (
  compensacao_id uuid PRIMARY KEY,
  tese_id uuid NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  r_cli RECORD;
  r_comp RECORD;
  v_tese uuid;
  v_rest numeric;
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
      SELECT s.tese_id, s.restante INTO v_tese, v_rest
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

UPDATE public.compensacoes_mensais cm
SET tese_origem_id = a.tese_id
FROM tmp_alloc a
WHERE cm.id = a.compensacao_id
  AND cm.tese_origem_id IS NULL;

COMMIT;
