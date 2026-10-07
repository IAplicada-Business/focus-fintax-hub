-- Espaça o disparo quando várias mensagens 'saida' ficam pendentes juntas (ex:
-- lote represado por falta de configuração do transporte). Sem isto, um INSERT
-- com N linhas dispararia N chamadas à Z-API quase simultâneas — risco de
-- flood no WhatsApp do destinatário e de rate-limit/ban da instância. O envio
-- de UMA mensagem (o caso comum: humano ou bot respondendo) continua instantâneo.

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
    RETURN NULL;  -- não configurado; não é erro
  END IF;

  FOR r IN SELECT id, telefone, texto FROM novas
           WHERE direcao = 'saida' AND status = 'pendente'
  LOOP
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('mensagem_id', r.id, 'telefone', r.telefone, 'texto', r.texto),
      headers := jsonb_build_object('Content-Type','application/json',
                                    'x-webhook-token', COALESCE(v_token,'')),
      timeout_milliseconds := 5000
    );
    v_i := v_i + 1;
    -- Só espaça a partir da segunda mensagem do mesmo lote. Mensagem única
    -- (o caso normal) não ganha atraso nenhum.
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
