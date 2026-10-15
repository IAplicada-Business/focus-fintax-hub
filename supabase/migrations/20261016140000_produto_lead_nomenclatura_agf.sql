-- Correção de nomenclatura das empresas do grupo (Mariana, 15/10/2026):
-- é AGF Contábil, AGF Fintax e AGF Tax. O Lote 2 gravou os códigos com a
-- grafia errada (agf_fintex, agf_atax). Renomeia os valores em leads e
-- leads_importacoes, o default e o CHECK. Idempotente.

BEGIN;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_produto_check;

UPDATE public.leads SET produto = 'agf_fintax' WHERE produto = 'agf_fintex';
UPDATE public.leads SET produto = 'agf_tax'    WHERE produto = 'agf_atax';
UPDATE public.leads_importacoes SET produto = 'agf_fintax' WHERE produto = 'agf_fintex';
UPDATE public.leads_importacoes SET produto = 'agf_tax'    WHERE produto = 'agf_atax';

ALTER TABLE public.leads ALTER COLUMN produto SET DEFAULT 'agf_fintax';

ALTER TABLE public.leads
  ADD CONSTRAINT leads_produto_check
  CHECK (produto IN ('agf_contabil', 'agf_fintax', 'agf_tax'));

COMMENT ON COLUMN public.leads.produto IS
  'Empresa do grupo para a qual o lead é prospectado: agf_contabil (AGF Contábil) | agf_fintax (AGF Fintax) | agf_tax (AGF Tax).';

COMMIT;
