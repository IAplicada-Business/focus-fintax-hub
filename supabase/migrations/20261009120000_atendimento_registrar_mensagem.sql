-- Duas lacunas que atendimento_registrar_entrada (20260826200000) não cobre
-- — e que a função NÃO foi alterada para cobrir: ela continua exatamente
-- como está, para quem já a chama.
--
-- 1) Eco fromMe: mensagem mandada direto do celular pareado (fora do painel).
--    A Z-API manda um ReceivedCallback com `fromMe: true` pra isso. Até esta
--    mudança o webhook descartava ("motivo: from_me") — bug real de perda de
--    mensagem, não só um detalhe de UX. É 'saida'/'humano', mas já chega
--    'enviada' (o WhatsApp confirma a entrega; não é pendente de outbox).
--
-- 2) Conversa provisória de @lid não resolvido: o telefone sintético
--    (`lid:<dígitos>`, ver migration do lid map) não é um WhatsApp de
--    verdade, então não pode passar por normalizar_whatsapp — ele rejeitaria
--    (não bate nenhum padrão de 10-13 dígitos). Por isso o parâmetro
--    p_pular_normalizacao.

BEGIN;

CREATE OR REPLACE FUNCTION public.atendimento_registrar_mensagem(
  p_telefone_raw text,
  p_direcao text,
  p_origem text DEFAULT 'humano',
  p_status text DEFAULT 'recebida',
  p_texto text DEFAULT NULL,
  p_tipo text DEFAULT 'texto',
  p_midia_url text DEFAULT NULL,
  p_zapi_message_id text DEFAULT NULL,
  p_pular_normalizacao boolean DEFAULT false
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
  IF p_direcao NOT IN ('entrada', 'saida') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'direcao_invalida');
  END IF;
  IF p_origem NOT IN ('humano', 'bot') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_invalida');
  END IF;
  IF p_status NOT IN ('recebida', 'pendente', 'enviada', 'falha') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'status_invalido');
  END IF;

  IF p_pular_normalizacao THEN
    -- Telefone sintético (`lid:<dígitos>`) montado pelo próprio transporte,
    -- não texto digitado por humano: já está no formato final.
    v_tel := NULLIF(btrim(p_telefone_raw), '');
  ELSE
    v_tel := public.normalizar_whatsapp(p_telefone_raw);
  END IF;

  IF v_tel IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'telefone_invalido', 'recebido', p_telefone_raw);
  END IF;

  v_contato := public.atendimento_resolver_contato(v_tel);

  INSERT INTO public.atendimento_mensagens
    (telefone, lead_id, cliente_id, direcao, texto, tipo, midia_url,
     zapi_message_id, status, origem, autor_id)
  VALUES
    (v_tel,
     (v_contato->>'lead_id')::uuid,
     (v_contato->>'cliente_id')::uuid,
     p_direcao,
     p_texto,
     COALESCE(NULLIF(p_tipo, ''), 'texto'),
     p_midia_url,
     p_zapi_message_id,
     p_status,
     p_origem,
     NULL)
  ON CONFLICT (zapi_message_id) WHERE zapi_message_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'telefone', v_tel,
    'mensagem_id', v_id,
    'inserida', v_id IS NOT NULL,
    'lead_id', v_contato->>'lead_id',
    'cliente_id', v_contato->>'cliente_id'
  );
END;
$$;

COMMENT ON FUNCTION public.atendimento_registrar_mensagem(text,text,text,text,text,text,text,text,boolean) IS
  'Registra mensagem com direção/origem/status explícitos: eco fromMe (saída direto do celular) e conversa provisória de @lid não resolvido. Não substitui atendimento_registrar_entrada, que continua o caminho normal de entrada do cliente.';

REVOKE EXECUTE ON FUNCTION public.atendimento_registrar_mensagem(text,text,text,text,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_registrar_mensagem(text,text,text,text,text,text,text,text,boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Reconcilia conversa provisória de @lid quando o telefone real é descoberto
-- depois (cache aprendido ou lookup Z-API bem-sucedido numa mensagem
-- seguinte do mesmo lid). Move as mensagens, não duplica.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atendimento_reconciliar_lid(
  p_telefone_provisorio text,
  p_telefone_real text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real text;
BEGIN
  IF p_telefone_provisorio IS NULL OR p_telefone_provisorio !~ '^lid:' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_e_provisorio');
  END IF;

  v_real := public.normalizar_whatsapp(p_telefone_real);
  IF v_real IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'telefone_real_invalido');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.atendimento_conversas WHERE telefone = p_telefone_provisorio) THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'sem_conversa_provisoria');
  END IF;

  -- Garante a conversa real ANTES de mover: trg_atendimento_conversa só roda
  -- em INSERT de mensagem (migration 20260826170000), não em UPDATE.
  INSERT INTO public.atendimento_conversas (telefone)
  VALUES (v_real)
  ON CONFLICT (telefone) DO NOTHING;

  UPDATE public.atendimento_mensagens m
     SET telefone = v_real,
         lead_id = COALESCE(m.lead_id, (public.atendimento_resolver_contato(v_real)->>'lead_id')::uuid),
         cliente_id = COALESCE(m.cliente_id, (public.atendimento_resolver_contato(v_real)->>'cliente_id')::uuid)
   WHERE m.telefone = p_telefone_provisorio;

  DELETE FROM public.atendimento_conversas WHERE telefone = p_telefone_provisorio;

  RETURN jsonb_build_object('ok', true, 'telefone_real', v_real, 'telefone_provisorio', p_telefone_provisorio);
END;
$$;

COMMENT ON FUNCTION public.atendimento_reconciliar_lid(text,text) IS
  'Move mensagens de uma conversa provisória (telefone sintético lid:<dígitos>) para o telefone real, quando descoberto depois do primeiro contato. Idempotente.';

REVOKE EXECUTE ON FUNCTION public.atendimento_reconciliar_lid(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_reconciliar_lid(text,text) TO service_role;

COMMIT;
