-- Conversa nova nasce com o robô ligado.
--
-- O default antigo era false de propósito, quando o bot ainda estava inerte.
-- Agora o atendimento espera o robô em toda conversa que começa. Conversa que
-- já existe não muda: resposta humana continua desligando o robô naquela
-- conversa (trg_bot_desliga_humano), e o kill switch global continua valendo.

ALTER TABLE public.atendimento_conversas
  ALTER COLUMN bot_ativo SET DEFAULT true;

COMMENT ON COLUMN public.atendimento_conversas.bot_ativo IS
  'Default TRUE: conversa nova começa com o robô. Resposta humana desliga. O kill switch global (bot_config.ativo_global) ainda precisa estar ligado.';

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
    true
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
