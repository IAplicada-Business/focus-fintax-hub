-- Entrada de mensagem, em UMA chamada.
--
-- O n8n poderia normalizar o telefone, chamar o resolver e depois inserir — três
-- viagens e três lugares para divergir. Aqui normaliza, resolve e insere de uma
-- vez, e a idempotência fica no banco (ON CONFLICT no zapi_message_id) em vez de
-- depender do fluxo acertar.

BEGIN;

CREATE OR REPLACE FUNCTION public.atendimento_registrar_entrada(
  p_telefone_raw text,
  p_texto text DEFAULT NULL,
  p_tipo text DEFAULT 'texto',
  p_midia_url text DEFAULT NULL,
  p_zapi_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel text;
  v_contato jsonb;
  v_id uuid;
BEGIN
  v_tel := public.normalizar_whatsapp(p_telefone_raw);

  IF v_tel IS NULL THEN
    -- Número que não normaliza não vira mensagem órfã: devolve o motivo para o
    -- n8n logar, em vez de gravar lixo na conversa de ninguém.
    RETURN jsonb_build_object('ok', false, 'motivo', 'telefone_invalido',
                              'recebido', p_telefone_raw);
  END IF;

  v_contato := public.atendimento_resolver_contato(v_tel);

  INSERT INTO public.atendimento_mensagens
    (telefone, lead_id, cliente_id, direcao, texto, tipo, midia_url,
     zapi_message_id, status)
  VALUES
    (v_tel,
     (v_contato->>'lead_id')::uuid,
     (v_contato->>'cliente_id')::uuid,
     'entrada',
     p_texto,
     COALESCE(NULLIF(p_tipo, ''), 'texto'),
     p_midia_url,
     p_zapi_message_id,
     'recebida')
  ON CONFLICT (zapi_message_id) WHERE zapi_message_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'telefone', v_tel,
    'mensagem_id', v_id,
    -- false quando a Z-API reenviou a mesma mensagem: o fluxo segue sem erro.
    'inserida', v_id IS NOT NULL,
    'lead_id', v_contato->>'lead_id',
    'cliente_id', v_contato->>'cliente_id'
  );
END;
$$;

COMMENT ON FUNCTION public.atendimento_registrar_entrada(text,text,text,text,text) IS
  'Registra mensagem recebida: normaliza o telefone, resolve lead/cliente e insere, idempotente por zapi_message_id. Consumida pelo fluxo n8n atendimento-receber.';

REVOKE EXECUTE ON FUNCTION public.atendimento_registrar_entrada(text,text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atendimento_registrar_entrada(text,text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atendimento_registrar_entrada(text,text,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_registrar_entrada(text,text,text,text,text) TO service_role;

COMMIT;
