-- mapa_envios_pendentes: adiciona `email` ao payload de cada pendente.
--
-- Motivo: a automação n8n de envio do Mapa Tributário (Step 15) está ganhando
-- um ramo por e-mail (Resend) além do WhatsApp (Z-API) já existente. O n8n
-- monta a mensagem/e-mail a partir do que a RPC devolve, então o e-mail
-- precisa vir junto no mesmo item — sem isso o ramo de e-mail não teria
-- destinatário.
--
-- clientes.email é `text DEFAULT ''`, não NULL — aplica o mesmo padrão de
-- nome_contato (NULLIF + btrim) pra não vazar string vazia pro n8n como se
-- fosse um e-mail válido.

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
  -- Ativos, sem opt-out, mas com cadastro que não dá número válido. Nunca entram
  -- no loop, então é aqui que precisam ser contados — é o número que cobra o
  -- time a preencher o cadastro.
  SELECT count(*) INTO v_inelegiveis
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
    AND public.normalizar_whatsapp(c.whatsapp) IS NULL;

  -- Garante token para todo elegível (idempotente).
  INSERT INTO public.mapa_links (cliente_id, token)
  -- extensions.gen_random_bytes: pgcrypto vive no schema `extensions` no
  -- Supabase, e esta função fixa search_path = public. Qualificar é melhor que
  -- alargar o search_path de uma função que roda com privilégio.
  SELECT c.id, encode(extensions.gen_random_bytes(24), 'hex')
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
    AND public.normalizar_whatsapp(c.whatsapp) IS NOT NULL
  ON CONFLICT (cliente_id) DO NOTHING;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.empresa), '[]'::jsonb) INTO v_pendentes
  FROM (
    SELECT
      c.id AS cliente_id,
      c.empresa,
      -- NULL quando não há contato cadastrado. Não inventar nome aqui: quem
      -- decide como saudar é quem monta a mensagem. Antes isto devolvia
      -- 'tudo bem' e a mensagem saía como "Olá, tudo bem! 👋".
      NULLIF(btrim(c.nome_contato), '') AS nome_contato,
      public.normalizar_whatsapp(c.whatsapp) AS telefone,
      -- Mesmo padrão do nome_contato: NULL em vez de '', pra o ramo de e-mail
      -- do n8n poder checar "tem email?" com um simples truthy check.
      NULLIF(btrim(c.email), '') AS email,
      v_base || '/mapa/' || ml.token AS link
    FROM public.clientes c
    JOIN public.mapa_links ml ON ml.cliente_id = c.id AND ml.revogado_em IS NULL
    WHERE c.status = 'ativo'
      AND c.nao_enviar_mapa = false
      AND public.normalizar_whatsapp(c.whatsapp) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.mapa_envio_log l
        WHERE l.cliente_id = c.id
          AND l.competencia = v_comp
          AND l.status IN ('sucesso', 'inelegivel')
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
  'Fila do envio mensal do Mapa: ativos, sem opt-out, com whatsapp normalizável e sem sucesso/inelegivel na competência. p_limite é o limite diário. Cada pendente traz telefone (normalizado) e email (NULL se cadastro vazio) para os ramos WhatsApp e e-mail do n8n.';

COMMIT;
