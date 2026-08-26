-- Modelo padrão do bot passa para Haiku 4.5.
--
-- Decisão de custo: qualificação de lead é texto curto para texto curto, sem
-- raciocínio pesado. Haiku custa ~1/5 do Opus 5 por token de entrada.
--
-- Consequência que o código precisa respeitar: Haiku 4.5 NÃO aceita
-- output_config.effort nem o fallback server-side — esses parâmetros existem só
-- na geração atual (Opus 5/4.x, Sonnet 5/4.6, Fable 5). A edge function detecta
-- o modelo e monta o request de acordo, então trocar aqui não quebra nada.

BEGIN;

ALTER TABLE public.bot_config
  ALTER COLUMN modelo SET DEFAULT 'claude-haiku-4-5';

UPDATE public.bot_config
   SET modelo = 'claude-haiku-4-5',
       atualizado_em = now()
 WHERE modelo = 'claude-opus-5';

COMMENT ON COLUMN public.bot_config.modelo IS
  'Modelo da Anthropic. Padrão claude-haiku-4-5 por custo. Modelos da geração atual (claude-opus-5, claude-sonnet-5, ...) habilitam effort e fallback automaticamente na edge function.';

COMMIT;
