-- Repassa tipo/midia_url para o transporte de envio.
--
-- O outbox (atendimento_disparar_envio, da migration 20261007180000) já lia
-- a linha pendente e mandava pro transporte, mas só repassava telefone/texto.
-- Uma mensagem de anexo (tipo='imagem', midia_url preenchido) gravava certo
-- na tabela mas saía como mensagem vazia na Z-API, porque o payload nunca
-- carregava tipo/midia_url. O transporte (supabase/functions/atendimento-zapi)
-- já sabe tratar os dois campos quando chegam — só faltava o trigger mandar.
--
-- Mantém exatamente a mesma lógica de espaçamento de lote da 20261007180000;
-- só o corpo do net.http_post ganha dois campos novos.

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
