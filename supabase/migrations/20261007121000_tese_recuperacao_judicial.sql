-- Tratamento financeiro "Recuperação judicial" (review AGF 02/10/2026).
--
-- A tese judicial (PIS/COFINS da própria base) ainda vai ser julgada: não
-- pode somar no crédito apurado nem no compensado. Até aqui a operação
-- contornava marcando-a como Reporto; agora ela tem categoria própria,
-- fora do cálculo como o Reporto mas rotulada como recuperação judicial.

BEGIN;

ALTER TABLE public.processos_teses
  DROP CONSTRAINT IF EXISTS processos_teses_categoria_check;

ALTER TABLE public.processos_teses
  ADD CONSTRAINT processos_teses_categoria_check
  CHECK (categoria = ANY (ARRAY['compensacao'::text, 'reporto'::text, 'recuperacao_judicial'::text]));

COMMENT ON COLUMN public.processos_teses.categoria IS
  'Tratamento financeiro: compensacao (no cálculo), reporto (possível futuro) ou recuperacao_judicial (fora do cálculo, tese em julgamento).';

-- Base existente: toda tese PIS_COFINS_JUD (via judicial) passa a recuperação
-- judicial, inclusive as marcadas como Reporto por falta de opção. Linhas em
-- "pedido_feito_receita" (status exclusivo de Reporto) ficam como estão.
UPDATE public.processos_teses pt
   SET categoria = 'recuperacao_judicial',
       tipo_recuperacao = 'recuperacao_judicial',
       atualizado_em = now()
 WHERE public.tese_codigo_oficial(pt.tese, pt.nome_exibicao) = 'PIS_COFINS_JUD'
   AND pt.categoria IS DISTINCT FROM 'recuperacao_judicial'
   AND COALESCE(pt.status_processo, '') <> 'pedido_feito_receita';

-- Crédito apurado da tese judicial sai do cálculo (espelho de categoria).
UPDATE public.creditos_apurados ca
   SET incluir_no_calculo = false,
       atualizado_em = now()
  FROM public.teses_tributarias t
 WHERE t.id = ca.tese_id
   AND t.codigo::text = 'PIS_COFINS_JUD'
   AND ca.incluir_no_calculo IS DISTINCT FROM false;

COMMIT;
