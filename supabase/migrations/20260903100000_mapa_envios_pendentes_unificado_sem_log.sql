-- mapa_envios_pendentes volta a ser uma fila ÚNICA (WhatsApp + e-mail juntos),
-- sem parâmetro de canal.
--
-- Motivo: o workflow n8n voltou a ser UM combinado (não dois crons por canal),
-- e por decisão explícita (03/09/2026) os inserts em mapa_envio_log saíram do
-- n8n — o próprio histórico de execução do n8n já registra o que foi
-- tentado, e manter os dois era redundante do ponto de vista de auditoria.
--
-- Consequência ACEITA: a checagem "já teve sucesso na competência" fica
-- inerte (mapa_envio_log não recebe INSERT nenhum do n8n hoje), então o mesmo
-- cliente pode voltar na fila em mais de um dos dias 5-10 se o cron rodar mais
-- de uma vez no mês. Sem isso, o comportamento do índice único por canal (da
-- migration anterior) não tem como ser exercitado — a função em si continua
-- pronta pra voltar a filtrar assim que o log voltar a ser escrito (por
-- qualquer canal, sem exigir p_canal).

BEGIN;

CREATE OR REPLACE FUNCTION public.mapa_envios_pendentes(p_limite int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_comp date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_base text := 'https://focusfintax.com';
  v_inelegiveis int;
  v_pendentes jsonb;
BEGIN
  -- Inelegível agora é "nenhum canal alcança": sem telefone válido E sem
  -- e-mail cadastrado.
  SELECT count(*) INTO v_inelegiveis
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
    AND public.normalizar_whatsapp(c.whatsapp) IS NULL
    AND NULLIF(btrim(c.email), '') IS NULL;

  -- Token é do cliente, não do canal (mantém o mesmo desenho da migration
  -- anterior): todo ativo sem opt-out ganha link, independente de ter
  -- telefone, e-mail, ou os dois.
  INSERT INTO public.mapa_links (cliente_id, token)
  SELECT c.id, encode(extensions.gen_random_bytes(24), 'hex')
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
  ON CONFLICT (cliente_id) DO NOTHING;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.empresa), '[]'::jsonb) INTO v_pendentes
  FROM (
    SELECT
      c.id AS cliente_id,
      c.empresa,
      NULLIF(btrim(c.nome_contato), '') AS nome_contato,
      public.normalizar_whatsapp(c.whatsapp) AS telefone,
      NULLIF(btrim(c.email), '') AS email,
      v_base || '/mapa/' || ml.token AS link
    FROM public.clientes c
    JOIN public.mapa_links ml ON ml.cliente_id = c.id AND ml.revogado_em IS NULL
    WHERE c.status = 'ativo'
      AND c.nao_enviar_mapa = false
      AND (
        public.normalizar_whatsapp(c.whatsapp) IS NOT NULL
        OR NULLIF(btrim(c.email), '') IS NOT NULL
      )
      -- Referencia mapa_envio_log SEM exigir canal específico: se o log
      -- voltar a ser escrito (de qualquer canal), volta a filtrar sozinho.
      AND NOT EXISTS (
        SELECT 1 FROM public.mapa_envio_log l
        WHERE l.cliente_id = c.id
          AND l.competencia = v_comp
          AND l.status = 'sucesso'
      )
    ORDER BY c.empresa
    LIMIT GREATEST(p_limite, 0)
  ) t;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'pendentes', v_pendentes,
    'total_pendentes', jsonb_array_length(v_pendentes),
    'inelegiveis_cadastro', v_inelegiveis
  );
END;
$$;

COMMENT ON FUNCTION public.mapa_envios_pendentes(int) IS
  'Fila única (WhatsApp + e-mail) do envio mensal do Mapa: ativos, sem opt-out, com telefone OU email válido, sem sucesso registrado na competência. O n8n não escreve mais em mapa_envio_log (decisão de 03/09/2026) — a checagem de sucesso fica inerte até isso voltar; sem ela, o mesmo cliente pode ser retornado em mais de um dos dias 5-10 do cron.';

-- A assinatura por canal (int, text) não é mais chamada por nenhum workflow —
-- o combinado voltou a usar só p_limite.
DROP FUNCTION IF EXISTS public.mapa_envios_pendentes(int, text);

REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) TO service_role;

COMMIT;
