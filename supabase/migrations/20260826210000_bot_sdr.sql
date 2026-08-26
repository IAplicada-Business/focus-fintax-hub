-- Bot SDR: configuração editável + travas em CÓDIGO.
--
-- O prompt é editável de propósito — o time ajusta conforme vê as respostas
-- reais. Justamente por isso, o que segura o bot NÃO pode estar no prompt:
-- editar para melhorar a conversa acabaria removendo, sem querer, a linha que
-- o impedia de falar número. As quatro travas abaixo vivem aqui e nenhuma
-- edição de prompt as remove.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Config: uma linha só.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_config (
  id boolean PRIMARY KEY DEFAULT true,
  prompt text NOT NULL,
  modelo text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  ativo_global boolean NOT NULL DEFAULT false,
  max_respostas int NOT NULL DEFAULT 6,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT bot_config_uma_linha CHECK (id),
  CONSTRAINT bot_config_max_chk CHECK (max_respostas BETWEEN 1 AND 50)
);

COMMENT ON COLUMN public.bot_config.ativo_global IS
  'Botão de pânico: desliga o robô em TODAS as conversas de uma vez. Default false.';
COMMENT ON COLUMN public.bot_config.max_respostas IS
  'Teto de respostas do bot por conversa. Passou disso, para e fica para humano. Impede loop e conversa longa demais para um robô.';

INSERT INTO public.bot_config (id, prompt) VALUES (true,
$prompt$Você é um SDR da Focus FinTax, consultoria de recuperação de créditos tributários.

Seu papel é APENAS qualificar o lead e passar para o time comercial. Você não é consultor tributário.

COMO CONDUZIR
- Seja breve. Mensagem de WhatsApp, não e-mail: no máximo 3 linhas por resposta.
- Cumprimente, diga que é da Focus FinTax e por que está entrando em contato.
- Faça UMA pergunta por vez, nesta ordem: ramo de atuação, faturamento aproximado, regime tributário.
- Escreva em português do Brasil, tom cordial e direto, sem jargão.

O QUE VOCÊ NUNCA FAZ
- Nunca cite valores, percentuais, prazos ou estimativas de economia.
- Nunca afirme que uma tese se aplica ao caso do lead.
- Nunca prometa resultado, aprovação ou restituição.
- Nunca invente informação sobre a empresa do lead.

QUANDO PASSAR PARA HUMANO
Se o lead perguntar sobre valor, prazo, se tem direito, como funciona na prática,
ou qualquer coisa específica do caso dele, responda algo como:
"Ótima pergunta — vou pedir para um especialista do time te responder ainda hoje."
E pare de fazer perguntas.

Se você não souber, diga que vai verificar com o time. Nunca improvise.$prompt$
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bot_config FROM anon;

DROP POLICY IF EXISTS "Time le bot_config" ON public.bot_config;
CREATE POLICY "Time le bot_config" ON public.bot_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin edita bot_config" ON public.bot_config;
CREATE POLICY "Admin edita bot_config" ON public.bot_config
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

GRANT SELECT, UPDATE ON public.bot_config TO authenticated;
GRANT SELECT ON public.bot_config TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Quem falou: humano ou bot. O time precisa sempre saber.
-- ---------------------------------------------------------------------------
ALTER TABLE public.atendimento_mensagens
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'humano';

DO $$ BEGIN
  ALTER TABLE public.atendimento_mensagens
    ADD CONSTRAINT atendimento_origem_chk CHECK (origem IN ('humano', 'bot'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3) TRAVA: resposta humana desliga o bot.
--
-- Comercial entrou na conversa, robô cala. Não depende de ninguém lembrar de
-- clicar no switch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_desligar_ao_responder_humano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.atendimento_conversas c
  SET bot_ativo = false, atualizado_em = now()
  WHERE c.telefone IN (
    SELECT DISTINCT n.telefone FROM novas n
    WHERE n.direcao = 'saida' AND n.origem = 'humano'
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bot_desliga_humano ON public.atendimento_mensagens;
CREATE TRIGGER trg_bot_desliga_humano
  AFTER INSERT ON public.atendimento_mensagens
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.bot_desligar_ao_responder_humano();

-- ---------------------------------------------------------------------------
-- 4) bot_contexto — TODAS as travas avaliadas aqui.
--
-- A edge function não reimplementa nenhuma regra: ela pergunta "posso?" e, se
-- puder, recebe prompt e histórico prontos. Regra duplicada é regra que diverge.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_contexto(p_telefone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.bot_config%ROWTYPE;
  v_conv public.atendimento_conversas%ROWTYPE;
  v_respostas int;
  v_ultima text;
  v_motivo text := NULL;
BEGIN
  SELECT * INTO v_cfg FROM public.bot_config WHERE id;
  SELECT * INTO v_conv FROM public.atendimento_conversas WHERE telefone = p_telefone;

  SELECT count(*) INTO v_respostas
    FROM public.atendimento_mensagens
   WHERE telefone = p_telefone AND direcao = 'saida' AND origem = 'bot';

  SELECT direcao INTO v_ultima
    FROM public.atendimento_mensagens
   WHERE telefone = p_telefone
   ORDER BY criado_em DESC LIMIT 1;

  -- Ordem importa: o motivo devolvido é o primeiro que bloqueia, e é o que
  -- aparece no log para quem for entender por que o bot ficou quieto.
  IF v_cfg.id IS NULL THEN                      v_motivo := 'sem_config';
  ELSIF NOT v_cfg.ativo_global THEN             v_motivo := 'global_desligado';
  ELSIF v_conv.telefone IS NULL THEN            v_motivo := 'sem_conversa';
  ELSIF NOT v_conv.bot_ativo THEN               v_motivo := 'conversa_desligada';
  ELSIF v_respostas >= v_cfg.max_respostas THEN v_motivo := 'teto_de_respostas';
  ELSIF v_ultima IS DISTINCT FROM 'entrada' THEN v_motivo := 'sem_mensagem_nova';
  END IF;

  RETURN jsonb_build_object(
    'pode_responder', v_motivo IS NULL,
    'motivo', v_motivo,
    'telefone', p_telefone,
    'prompt', v_cfg.prompt,
    'modelo', v_cfg.modelo,
    'respostas_dadas', v_respostas,
    'max_respostas', v_cfg.max_respostas,
    'mensagens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('direcao', m.direcao, 'texto', m.texto,
                                          'tipo', m.tipo, 'origem', m.origem)
                       ORDER BY m.criado_em)
      FROM (SELECT * FROM public.atendimento_mensagens
             WHERE telefone = p_telefone ORDER BY criado_em DESC LIMIT 20) m
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Resposta do bot entra pelo MESMO outbox das humanas.
--    Nenhum caminho de envio novo, nenhum token de Z-API na edge function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_registrar_resposta(
  p_telefone text,
  p_texto text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contato jsonb;
  v_id uuid;
BEGIN
  IF COALESCE(btrim(p_texto), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'texto_vazio');
  END IF;

  v_contato := public.atendimento_resolver_contato(p_telefone);

  INSERT INTO public.atendimento_mensagens
    (telefone, lead_id, cliente_id, direcao, texto, tipo, status, origem)
  VALUES
    (p_telefone, (v_contato->>'lead_id')::uuid, (v_contato->>'cliente_id')::uuid,
     'saida', p_texto, 'texto', 'pendente', 'bot')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'mensagem_id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bot_contexto(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bot_registrar_resposta(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_contexto(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_registrar_resposta(text,text) TO service_role;

COMMIT;
