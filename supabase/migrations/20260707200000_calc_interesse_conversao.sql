-- ================================================================
-- calculadora_leads: coluna interesse_conversao
-- ================================================================
-- Usada pela edge function `calc-lead-interested` que é chamada
-- quando o usuário clica em "Quer saber mais? Fale com um especialista"
-- na tela de resultado da /calculadora. Junto com a tag
-- "[TAG: quer_saber_mais]" em leads.observacoes, permite que o
-- comercial filtre no Pipeline por "leads da calculadora que já
-- pediram atendimento".
-- ================================================================

ALTER TABLE public.calculadora_leads
  ADD COLUMN IF NOT EXISTS interesse_conversao boolean NOT NULL DEFAULT false;

ALTER TABLE public.calculadora_leads
  ADD COLUMN IF NOT EXISTS interesse_conversao_em timestamptz;

COMMENT ON COLUMN public.calculadora_leads.interesse_conversao IS
  'true quando o lead clicou em "Quer saber mais" no resultado. Pipeline lê como sinal de intenção forte.';

COMMENT ON COLUMN public.calculadora_leads.interesse_conversao_em IS
  'Timestamp do clique em "Quer saber mais" (útil pra medir tempo entre cálculo e conversão).';
