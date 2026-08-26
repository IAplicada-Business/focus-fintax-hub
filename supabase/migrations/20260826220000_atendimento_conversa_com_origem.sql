-- Acrescenta `origem` ao payload de atendimento_conversa.
--
-- Vai numa migration NOVA e não na 20260826180000 porque a coluna `origem` só
-- passa a existir na 20260826210000 (bot_sdr). Editar a migration antiga faria
-- um replay do zero quebrar em "column m.origem does not exist" — foi
-- exatamente o que aconteceu ao tentar.
--
-- Sem este campo a aba não distingue mensagem do robô da mensagem do time.

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
      'criado_em', m.criado_em
    ) ORDER BY m.criado_em)
    FROM public.atendimento_mensagens m, t
    WHERE t.tel IS NOT NULL AND m.telefone = t.tel
  ), '[]'::jsonb)
);
$$;

COMMIT;
