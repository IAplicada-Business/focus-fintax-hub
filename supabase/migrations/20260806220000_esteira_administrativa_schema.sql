-- Épica 7 — Esteira administrativa (BPMN oficial), escopo v1 = só ramo
-- Compensação (Ressarcimento/Judicial ficam pra Épica 14, quando a Focus
-- confirmar que já são operados — decisão registrada em 06/08/2026).
--
-- estagio_esteira vive em public.clientes (mesmo padrão de status_operacional,
-- que já existe na tabela): cada cliente ativo tem UM estágio operacional
-- corrente. data_entrada_estagio é mantido por trigger, não pela aplicação
-- (evita o mesmo tipo de inconsistência que status_funil_atualizado_em tem
-- hoje em leads, que é setado manualmente no client-side).

CREATE TYPE public.estagio_esteira AS ENUM (
  'triagem',
  'levantamento',
  'emitir_contrato',
  'receber_assinado',
  'em_compensacao',
  'concluido'
);

ALTER TABLE public.clientes
  ADD COLUMN estagio_esteira public.estagio_esteira NOT NULL DEFAULT 'triagem',
  ADD COLUMN data_entrada_estagio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: clientes que já existiam antes desta migration não entraram
-- "agora" na Triagem — usa a data de criação do cadastro como aproximação
-- razoável (melhor que today() pra todo mundo, que zeraria "dias na etapa").
UPDATE public.clientes SET data_entrada_estagio = criado_em;

CREATE OR REPLACE FUNCTION public.set_data_entrada_estagio()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estagio_esteira IS DISTINCT FROM OLD.estagio_esteira THEN
    NEW.data_entrada_estagio := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clientes_estagio_esteira
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_data_entrada_estagio();

-- Handoff automático (subtask 6): não precisa de trigger próprio — o
-- DEFAULT 'triagem' acima já cobre isso. Todo INSERT novo em clientes
-- (via ConvertClientModal, fluxo "Sim, converter") nasce na Triagem.
-- Nota: o fluxo "Apenas mover" no Pipeline marca o lead como cliente_ativo
-- SEM criar linha em clientes — esse lead não aparece na Esteira porque não
-- existe cliente pra rastrear. Comportamento esperado, não é bug.
