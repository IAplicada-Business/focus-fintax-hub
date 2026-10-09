-- "Apagar para todos" no WhatsApp, pelo painel.
--
-- Guarda quando uma mensagem foi apagada e uma cópia do texto (auditoria —
-- não é usada pra "desfazer" na UI). A tela decide o que mostrar com base em
-- `apagada_em`; o texto original continua em `texto` por enquanto, só a flag
-- muda. `zapi_message_id` já existia desde o Step 11 (migration
-- 20260826170000) — é o identificador que a Z-API exige pra apagar.

BEGIN;

ALTER TABLE public.atendimento_mensagens
  ADD COLUMN IF NOT EXISTS apagada_em timestamptz,
  ADD COLUMN IF NOT EXISTS texto_anterior text;

COMMENT ON COLUMN public.atendimento_mensagens.apagada_em IS
  'Preenchido quando o time apaga a mensagem no WhatsApp ("apagar para todos") pela tela. NULL = nunca apagada.';
COMMENT ON COLUMN public.atendimento_mensagens.texto_anterior IS
  'Cópia do texto no momento da exclusão, para auditoria. A UI não restaura a partir daqui.';

-- A tela (AtendimentoTab.tsx) decide se mostra o botão "Apagar" a partir de
-- zapi_message_id/apagada_em, que vêm pela RPC atendimento_conversa — sem
-- isso no retorno, a UI nunca saberia quais mensagens são elegíveis.
CREATE OR REPLACE FUNCTION public.atendimento_conversa(p_whatsapp text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH t AS (SELECT public.normalizar_whatsapp(p_whatsapp) AS tel)
SELECT jsonb_build_object(
  'telefone', (SELECT tel FROM t),
  'bot_ativo', COALESCE(
    (SELECT c.bot_ativo FROM public.atendimento_conversas c, t WHERE c.telefone = t.tel),
    false
  ),
  'leads_compartilhando', (
    SELECT count(*) FROM public.leads l, t
    WHERE t.tel IS NOT NULL AND public.normalizar_whatsapp(l.whatsapp) = t.tel
  ),
  'mensagens', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', m.id,
      'direcao', m.direcao,
      'texto', m.texto,
      'tipo', m.tipo,
      'midia_url', m.midia_url,
      'status', m.status,
      'origem', m.origem,
      'erro', m.erro,
      'zapi_message_id', m.zapi_message_id,
      'apagada_em', m.apagada_em,
      'criado_em', m.criado_em
    ) ORDER BY m.criado_em)
    FROM public.atendimento_mensagens m, t
    WHERE t.tel IS NOT NULL AND m.telefone = t.tel
  ), '[]'::jsonb)
);
$$;

COMMIT;
