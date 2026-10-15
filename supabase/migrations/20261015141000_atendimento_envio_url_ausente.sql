-- Instância conectada no painel da Z-API não envia sozinha.
--
-- O trigger só dispara se o vault tiver atendimento_enviar_url. Sem essa URL
-- a função devolvia NULL e a mensagem ficava "pendente" para sempre — na tela,
-- "enviando", sem motivo. Agora ela marca falha com um erro que a bolha mostra.

BEGIN;

CREATE OR REPLACE FUNCTION public.atendimento_disparar_envio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_token text;
  v_total int;
  v_i int := 0;
  r record;
BEGIN
  SELECT count(*) INTO v_total FROM novas WHERE direcao = 'saida' AND status = 'pendente';
  IF v_total = 0 THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'atendimento_enviar_url';
  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets WHERE name = 'atendimento_webhook_token';

  IF v_url IS NULL THEN
    UPDATE public.atendimento_mensagens m
       SET status = 'falha', erro = 'envio_nao_configurado'
     WHERE m.id IN (
       SELECT id FROM novas WHERE direcao = 'saida' AND status = 'pendente'
     );
    RETURN NULL;
  END IF;

  FOR r IN SELECT id, telefone, texto, tipo, midia_url FROM novas
           WHERE direcao = 'saida' AND status = 'pendente'
  LOOP
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'mensagem_id', r.id,
        'telefone', r.telefone,
        'texto', r.texto,
        'tipo', r.tipo,
        'midia_url', r.midia_url
      ),
      headers := jsonb_build_object('Content-Type','application/json',
                                    'x-webhook-token', COALESCE(v_token,'')),
      timeout_milliseconds := 5000
    );
    v_i := v_i + 1;
    IF v_i < v_total THEN
      PERFORM pg_sleep(1.5);
    END IF;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'atendimento_disparar_envio falhou: %', SQLERRM;
  RETURN NULL;
END;
$$;

COMMIT;
