-- Troca o provedor do bot para a Anthropic.
--
-- O default anterior (google/gemini-3-flash-preview) veio de analyze-lead, que
-- usa o gateway da Lovable. O bot passa a chamar a Messages API direto com o
-- SDK oficial, então o identificador de modelo muda de formato.
--
-- Migration separada e não edição da 20260826210000: aquela já foi aplicada, e
-- migration aplicada não se reescreve.

BEGIN;

ALTER TABLE public.bot_config
  ALTER COLUMN modelo SET DEFAULT 'claude-opus-5';

UPDATE public.bot_config
   SET modelo = 'claude-opus-5',
       atualizado_em = now()
 WHERE modelo = 'google/gemini-3-flash-preview';

COMMENT ON COLUMN public.bot_config.modelo IS
  'Identificador do modelo da Anthropic (ex.: claude-opus-5). Consumido por bot-sdr-responder.';

COMMIT;
