-- Step 11 — atendimento WhatsApp (tela) + ramificação do bot SDR, desligada.
-- Spec: docs/superpowers/specs/2026-08-26-atendimento-whatsapp-design.md

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Conversa: uma linha por TELEFONE, não por lead.
--
-- Decisão confirmada pelos dados: 3 telefones são compartilhados por 27 leads, e
-- "Alves e bernaca" tem 4 registros da mesma empresa. Não são empresas distintas
-- dividindo número — são leads duplicados. Chavear por lead_id fragmentaria em
-- quatro a conversa de uma única pessoa. E na conversão o número não muda, então
-- a conversa sobrevive ao lead virar cliente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atendimento_conversas (
  telefone text PRIMARY KEY,
  bot_ativo boolean NOT NULL DEFAULT false,
  assumido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assumido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.atendimento_conversas.bot_ativo IS
  'Default FALSE de propósito: o robô não fala com ninguém até alguém ligar explicitamente. Resposta humana desliga.';

-- ---------------------------------------------------------------------------
-- 2) Mensagens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atendimento_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  direcao text NOT NULL,
  texto text,
  tipo text NOT NULL DEFAULT 'texto',
  midia_url text,
  zapi_message_id text,
  status text NOT NULL DEFAULT 'recebida',
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atendimento_direcao_chk CHECK (direcao IN ('entrada', 'saida')),
  CONSTRAINT atendimento_tipo_chk
    CHECK (tipo IN ('texto', 'imagem', 'audio', 'documento', 'outro')),
  CONSTRAINT atendimento_status_chk
    CHECK (status IN ('recebida', 'pendente', 'enviada', 'falha'))
);

-- O webhook da Z-API repete. Sem isto a conversa duplica na tela.
CREATE UNIQUE INDEX IF NOT EXISTS ux_atendimento_zapi_msg
  ON public.atendimento_mensagens (zapi_message_id)
  WHERE zapi_message_id IS NOT NULL;

-- É como a UI lê a conversa.
CREATE INDEX IF NOT EXISTS ix_atendimento_conversa
  ON public.atendimento_mensagens (telefone, criado_em);

-- ---------------------------------------------------------------------------
-- 3) Garante a conversa na primeira mensagem do telefone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atendimento_garantir_conversa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.atendimento_conversas (telefone)
  SELECT DISTINCT n.telefone FROM novas n
  ON CONFLICT (telefone) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_atendimento_conversa ON public.atendimento_mensagens;
CREATE TRIGGER trg_atendimento_conversa
  AFTER INSERT ON public.atendimento_mensagens
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.atendimento_garantir_conversa();

-- ---------------------------------------------------------------------------
-- 4) Outbox de envio.
--
-- O token da Z-API não pode ir ao browser, então a UI insere 'pendente' e o n8n
-- envia. Mesmo mecanismo do Step 12a. Ganha outbox de graça: mensagem que falha
-- fica visível como 'falha' em vez de sumir.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atendimento_disparar_envio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_token text;
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM novas WHERE direcao = 'saida' AND status = 'pendente') THEN
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
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Como no Step 12a: o envio é acessório e NÃO pode derrubar o INSERT. Se a
  -- rede cair, a mensagem fica 'pendente' e aparece assim na tela.
  RAISE WARNING 'atendimento_disparar_envio falhou: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_atendimento_envio ON public.atendimento_mensagens;
CREATE TRIGGER trg_atendimento_envio
  AFTER INSERT ON public.atendimento_mensagens
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.atendimento_disparar_envio();

-- ---------------------------------------------------------------------------
-- 5) Resolve telefone -> lead/cliente.
--
-- Com telefone duplicado escolhe o lead MAIS AVANÇADO no funil (empate: o mais
-- recente) — é o registro que o time está de fato trabalhando.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atendimento_resolver_contato(p_telefone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT jsonb_build_object(
  'telefone', p_telefone,
  'lead_id', (
    SELECT l.id FROM public.leads l
    WHERE public.normalizar_whatsapp(l.whatsapp) = p_telefone
    ORDER BY CASE COALESCE(l.status_funil,'novo')
               WHEN 'cliente_ativo'    THEN 6
               WHEN 'contrato_emitido' THEN 5
               WHEN 'em_apresentacao'  THEN 4
               WHEN 'em_negociacao'    THEN 3
               WHEN 'levantamento_teses' THEN 3
               WHEN 'qualificado'      THEN 2
               WHEN 'novo'             THEN 1
               ELSE 0
             END DESC,
             l.status_funil_atualizado_em DESC NULLS LAST
    LIMIT 1
  ),
  'cliente_id', (
    SELECT c.id FROM public.clientes c
    WHERE public.normalizar_whatsapp(c.whatsapp) = p_telefone
    ORDER BY c.criado_em DESC
    LIMIT 1
  )
);
$$;

-- ---------------------------------------------------------------------------
-- 6) RLS — é o time comercial que atende.
-- ---------------------------------------------------------------------------
ALTER TABLE public.atendimento_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_conversas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atendimento_mensagens FROM anon;
REVOKE ALL ON public.atendimento_conversas FROM anon;

DROP POLICY IF EXISTS "Time select atendimento msg" ON public.atendimento_mensagens;
CREATE POLICY "Time select atendimento msg" ON public.atendimento_mensagens
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_tributario'::app_role) OR
    has_role(auth.uid(), 'pmo'::app_role) OR
    has_role(auth.uid(), 'comercial'::app_role) OR
    has_role(auth.uid(), 'gestor_comercial'::app_role) OR
    has_role(auth.uid(), 'sdr'::app_role)
  );

DROP POLICY IF EXISTS "Time insert atendimento msg" ON public.atendimento_mensagens;
CREATE POLICY "Time insert atendimento msg" ON public.atendimento_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (
    direcao = 'saida' AND autor_id = auth.uid() AND (
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'gestor_tributario'::app_role) OR
      has_role(auth.uid(), 'pmo'::app_role) OR
      has_role(auth.uid(), 'comercial'::app_role) OR
      has_role(auth.uid(), 'gestor_comercial'::app_role) OR
      has_role(auth.uid(), 'sdr'::app_role)
    )
  );

DROP POLICY IF EXISTS "Time select atendimento conv" ON public.atendimento_conversas;
CREATE POLICY "Time select atendimento conv" ON public.atendimento_conversas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Time update atendimento conv" ON public.atendimento_conversas;
CREATE POLICY "Time update atendimento conv" ON public.atendimento_conversas
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_comercial'::app_role) OR
    has_role(auth.uid(), 'comercial'::app_role) OR
    has_role(auth.uid(), 'sdr'::app_role)
  );

GRANT SELECT, INSERT ON public.atendimento_mensagens TO authenticated;
GRANT SELECT, UPDATE ON public.atendimento_conversas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.atendimento_mensagens TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.atendimento_conversas TO service_role;

REVOKE EXECUTE ON FUNCTION public.atendimento_resolver_contato(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atendimento_resolver_contato(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.atendimento_resolver_contato(text) TO authenticated, service_role;

COMMIT;
