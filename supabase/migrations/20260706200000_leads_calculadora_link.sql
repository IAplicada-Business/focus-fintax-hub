-- ============================================================================
-- Calculadora Bloco 5 — link leads ↔ calculadora_leads
--
-- Quando um lead vem via /calculadora, o submit-calculadora-lead grava em:
--   1) calculadora_leads (rico, com DRE, snapshot, etc)
--   2) leads (com origem='calculadora' + calculadora_lead_id FK)
--
-- Assim o Pipeline existente vê e trata o lead como qualquer outro; o
-- comercial pode expandir e ir pro detalhamento da calculadora quando
-- precisar da DRE + saldo IBS/CBS.
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS calculadora_lead_id uuid REFERENCES public.calculadora_leads(id);

CREATE INDEX IF NOT EXISTS ix_leads_calculadora
  ON public.leads (calculadora_lead_id)
  WHERE calculadora_lead_id IS NOT NULL;

COMMENT ON COLUMN public.leads.calculadora_lead_id IS
  'FK pra calculadora_leads quando o lead veio via /calculadora. NULL pros outros origens (LP, Meta Ads, manual).';
