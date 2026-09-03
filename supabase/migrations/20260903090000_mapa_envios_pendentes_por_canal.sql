-- mapa_envios_pendentes por canal (whatsapp | email).
--
-- Motivo: o envio mensal do Mapa vai virar DOIS crons n8n independentes — um
-- WhatsApp (Z-API), um e-mail (Resend) — em vez de um workflow único que
-- manda os dois pro mesmo cliente na mesma volta. Com dois crons separados, o
-- "já recebeu este mês" precisa ser POR CANAL: sem isso, um sucesso no
-- WhatsApp tiraria o cliente da fila de e-mail (e vice-versa), porque a
-- dedupe olhava só cliente_id+competencia.
--
-- Compat: p_canal tem DEFAULT 'whatsapp', então o workflow único já em
-- produção (automacoes/n8n/envio-mapa-mensal.json, que chama só com
-- p_limite) continua funcionando sem mudança nenhuma.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) canal em mapa_envio_log.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mapa_envio_log
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp';

ALTER TABLE public.mapa_envio_log
  DROP CONSTRAINT IF EXISTS mapa_envio_log_canal_chk;
ALTER TABLE public.mapa_envio_log
  ADD CONSTRAINT mapa_envio_log_canal_chk CHECK (canal IN ('whatsapp', 'email'));

COMMENT ON COLUMN public.mapa_envio_log.canal IS
  'Canal do envio: whatsapp ou email. Cada canal tem sua própria fila/dedupe em mapa_envios_pendentes(p_limite, p_canal).';

-- Os índices únicos antigos eram só (cliente_id, competencia): um sucesso em
-- WhatsApp bloquearia o INSERT do sucesso em e-mail na mesma competência (e
-- vice-versa), por colidir no mesmo índice. Precisam incluir canal.
DROP INDEX IF EXISTS public.ux_mapa_envio_sucesso;
CREATE UNIQUE INDEX ux_mapa_envio_sucesso
  ON public.mapa_envio_log (cliente_id, competencia, canal)
  WHERE status = 'sucesso';

DROP INDEX IF EXISTS public.ux_mapa_envio_inelegivel;
CREATE UNIQUE INDEX ux_mapa_envio_inelegivel
  ON public.mapa_envio_log (cliente_id, competencia, canal)
  WHERE status = 'inelegivel';

-- nao_enviar_mapa deixou de ser "só WhatsApp": agora é opt-out do Mapa mensal
-- nos dois canais (não existe pedido de "só pare o WhatsApp, mantenha o
-- e-mail" no requisito atual — se isso mudar, vira coluna por canal).
COMMENT ON COLUMN public.clientes.nao_enviar_mapa IS
  'true = cliente pediu para não receber o Mapa mensal (WhatsApp e e-mail). Respeitado por mapa_envios_pendentes() nos dois canais.';

-- ---------------------------------------------------------------------------
-- 2) mapa_envios_pendentes(p_limite, p_canal) — fila por canal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mapa_envios_pendentes(p_limite int DEFAULT 100, p_canal text DEFAULT 'whatsapp')
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
  IF p_canal NOT IN ('whatsapp', 'email') THEN
    RAISE EXCEPTION 'p_canal inválido: % (use whatsapp ou email)', p_canal;
  END IF;

  -- Inelegível é definido pelo canal pedido: sem telefone válido pro
  -- WhatsApp, sem e-mail cadastrado pro e-mail.
  IF p_canal = 'whatsapp' THEN
    SELECT count(*) INTO v_inelegiveis
    FROM public.clientes c
    WHERE c.status = 'ativo'
      AND c.nao_enviar_mapa = false
      AND public.normalizar_whatsapp(c.whatsapp) IS NULL;
  ELSE
    SELECT count(*) INTO v_inelegiveis
    FROM public.clientes c
    WHERE c.status = 'ativo'
      AND c.nao_enviar_mapa = false
      AND NULLIF(btrim(c.email), '') IS NULL;
  END IF;

  -- Token é do CLIENTE, não do canal — não filtra mais por telefone válido,
  -- senão um cliente só-e-mail (sem WhatsApp cadastrado) nunca ganharia link
  -- e sumiria do JOIN abaixo pros dois canais.
  INSERT INTO public.mapa_links (cliente_id, token)
  -- extensions.gen_random_bytes: pgcrypto vive no schema `extensions` no
  -- Supabase, e esta função fixa search_path = public.
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
        (p_canal = 'whatsapp' AND public.normalizar_whatsapp(c.whatsapp) IS NOT NULL) OR
        (p_canal = 'email' AND NULLIF(btrim(c.email), '') IS NOT NULL)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.mapa_envio_log l
        WHERE l.cliente_id = c.id
          AND l.competencia = v_comp
          AND l.canal = p_canal
          AND l.status IN ('sucesso', 'inelegivel')
      )
    ORDER BY c.empresa
    LIMIT GREATEST(p_limite, 0)
  ) t;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'canal', p_canal,
    'pendentes', v_pendentes,
    'total_pendentes', jsonb_array_length(v_pendentes),
    'inelegiveis_cadastro', v_inelegiveis
  );
END;
$$;

COMMENT ON FUNCTION public.mapa_envios_pendentes(int, text) IS
  'Fila do envio mensal do Mapa por canal (p_canal: whatsapp ou email, default whatsapp). Ativos, sem opt-out, com contato válido pro canal pedido e sem sucesso/inelegivel NAQUELE canal na competência. p_limite é o limite diário.';

-- A assinatura antiga (int) some: coexistir com (int, text DEFAULT) deixaria
-- toda chamada com 1 argumento ambígua pro PostgREST/Postgres.
DROP FUNCTION IF EXISTS public.mapa_envios_pendentes(int);

REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mapa_envios_pendentes(int, text) TO service_role;

COMMIT;
