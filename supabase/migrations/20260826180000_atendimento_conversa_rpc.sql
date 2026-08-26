-- RPC única que a aba de Atendimento consome.
--
-- Recebe o telefone CRU do lead e normaliza aqui dentro. A UI nunca normaliza:
-- se ela tivesse a própria cópia da regra, ela divergiria da do banco e a
-- conversa apareceria vazia sem ninguém entender por quê. O `telefone` que volta
-- é também o que a UI usa no filtro do realtime.
--
-- Sem SECURITY DEFINER de propósito: roda com o privilégio de quem chamou, então
-- a RLS de atendimento_mensagens continua valendo.

BEGIN;

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
  -- Quantos registros de lead dividem este número. A UI avisa quando > 1, senão
  -- o time acha que está vendo a conversa de outro cliente.
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
      'erro', m.erro,
      'criado_em', m.criado_em
    ) ORDER BY m.criado_em)
    FROM public.atendimento_mensagens m, t
    WHERE t.tel IS NOT NULL AND m.telefone = t.tel
  ), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.atendimento_conversa(text) IS
  'Conversa completa de um telefone cru. Devolve telefone normalizado (usado no filtro do realtime), bot_ativo, quantos leads dividem o número, e as mensagens.';

REVOKE EXECUTE ON FUNCTION public.atendimento_conversa(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atendimento_conversa(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.atendimento_conversa(text) TO authenticated, service_role;

COMMIT;
