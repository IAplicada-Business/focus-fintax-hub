-- Teses com tratamento "Crédito no cálculo" (categoria=compensacao) passam a
-- entrar no KPI Crédito Apurado. REPORTO / possíveis futuros ficam fora.
-- Espelha processos_teses.categoria → creditos_apurados.incluir_no_calculo.

BEGIN;

WITH ranked AS (
  SELECT
    pt.cliente_id,
    t.id AS tese_id,
    COALESCE(pt.valor_credito, 0)::numeric(14,2) AS valor_credito,
    (COALESCE(pt.categoria, 'compensacao') = 'compensacao' AND t.codigo <> 'REPORTO') AS incluir,
    row_number() OVER (
      PARTITION BY pt.cliente_id, t.id
      ORDER BY pt.atualizado_em DESC NULLS LAST, pt.criado_em DESC NULLS LAST
    ) AS rn
  FROM public.processos_teses pt
  JOIN public.teses_tributarias t
    ON t.codigo::text = COALESCE(
         public.tese_codigo_oficial(
           CASE WHEN pt.categoria = 'reporto' THEN 'reporto' ELSE pt.tese END,
           pt.nome_exibicao
         ),
         pt.tese
       )
),
src AS (
  SELECT cliente_id, tese_id, valor_credito, incluir
  FROM ranked
  WHERE rn = 1
)
UPDATE public.creditos_apurados ca
   SET incluir_no_calculo = src.incluir,
       atualizado_em = now()
  FROM src
 WHERE ca.cliente_id = src.cliente_id
   AND ca.tese_id = src.tese_id
   AND ca.incluir_no_calculo IS DISTINCT FROM src.incluir;

WITH ranked AS (
  SELECT
    pt.cliente_id,
    t.id AS tese_id,
    COALESCE(pt.valor_credito, 0)::numeric(14,2) AS valor_credito,
    (COALESCE(pt.categoria, 'compensacao') = 'compensacao' AND t.codigo <> 'REPORTO') AS incluir,
    row_number() OVER (
      PARTITION BY pt.cliente_id, t.id
      ORDER BY pt.atualizado_em DESC NULLS LAST, pt.criado_em DESC NULLS LAST
    ) AS rn
  FROM public.processos_teses pt
  JOIN public.teses_tributarias t
    ON t.codigo::text = COALESCE(
         public.tese_codigo_oficial(
           CASE WHEN pt.categoria = 'reporto' THEN 'reporto' ELSE pt.tese END,
           pt.nome_exibicao
         ),
         pt.tese
       )
),
src AS (
  SELECT cliente_id, tese_id, valor_credito, incluir
  FROM ranked
  WHERE rn = 1
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, incluir_no_calculo)
SELECT src.cliente_id, src.tese_id, src.valor_credito, src.incluir
  FROM src
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.creditos_apurados ca
    WHERE ca.cliente_id = src.cliente_id
      AND ca.tese_id = src.tese_id
 );

COMMIT;
