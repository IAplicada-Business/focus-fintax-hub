-- Resumo semanal por WhatsApp — destinatários passam a ser USUÁRIOS do sistema
-- e a configuração vira tela de admin (Configurações → Resumo semanal).
--
-- Por quê:
--   • A Mariana pediu que quem recebe o resumo seja escolhido entre as pessoas
--     que já têm acesso ao sistema, não digitado à mão. O número vem de
--     profiles.whatsapp (cadastrado em Usuários), então trocar o WhatsApp de
--     alguém em Usuários já vale para o próximo resumo — sem cadastro duplicado.
--   • A tela saiu do Dashboard (Pulso semanal) e foi para Configurações, só
--     para admin. As policies abaixo acompanham: pmo deixa de ler/gravar
--     destinatários e envios.
--
-- O que muda:
--   1) resumo_semanal_destinatarios.user_id (FK auth.users, ON DELETE CASCADE:
--      usuário excluído some da lista sozinho). Único por usuário — a UI faz
--      upsert por user_id ao ligar/desligar o switch "Recebe".
--   2) whatsapp vira opcional: linha de usuário NÃO guarda número (a Edge
--      Function lê do profile na hora do envio). Linhas antigas (só whatsapp,
--      cadastradas pela tela do Pulso) continuam funcionando. CHECK garante
--      que toda linha tem pelo menos um dos dois.
--   3) RLS das duas tabelas: só admin.
--
-- Listar usuários com WhatsApp NÃO precisa de RPC: admin já lê todos os
-- profiles ("Admins can view all profiles", 20260806221000 — admin/pmo/
-- gestor_tributario) e todos os papéis ("Admins can view all roles",
-- 20260311164617). A tela é só de admin, então o select direto basta.
--
-- resumo_semanal_dados() e resumo_semanal_disparar() ficam como estão: a RPC
-- ainda aceita pmo, o que é inofensivo (só devolve números agregados que o
-- pmo já vê no Dashboard), e o disparo só roda via cron.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Vínculo com o usuário
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumo_semanal_destinatarios
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Índice único SEM predicado de propósito: NULL não colide com NULL no
-- Postgres, então as linhas antigas (user_id nulo) convivem à vontade — e um
-- índice parcial (WHERE user_id IS NOT NULL) não serve de alvo pro
-- `upsert(..., { onConflict: "user_id" })` do PostgREST, que manda
-- ON CONFLICT (user_id) sem o predicado.
CREATE UNIQUE INDEX IF NOT EXISTS ux_resumo_semanal_destinatarios_user
  ON public.resumo_semanal_destinatarios (user_id);

-- ---------------------------------------------------------------------------
-- 2) whatsapp opcional + pelo menos um dos dois
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumo_semanal_destinatarios
  ALTER COLUMN whatsapp DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'resumo_semanal_destinatarios_alvo_chk'
       AND conrelid = 'public.resumo_semanal_destinatarios'::regclass
  ) THEN
    ALTER TABLE public.resumo_semanal_destinatarios
      ADD CONSTRAINT resumo_semanal_destinatarios_alvo_chk
      CHECK (user_id IS NOT NULL OR whatsapp IS NOT NULL);
  END IF;
END;
$$;

COMMENT ON COLUMN public.resumo_semanal_destinatarios.user_id IS
  'Usuário do sistema que recebe o resumo. Nome e WhatsApp vêm de profiles na hora do envio.';
COMMENT ON COLUMN public.resumo_semanal_destinatarios.whatsapp IS
  'Legado (cadastro manual antigo). Linhas com user_id deixam nulo e usam profiles.whatsapp.';

-- ---------------------------------------------------------------------------
-- 3) RLS: só admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin pmo gerencia destinatarios resumo" ON public.resumo_semanal_destinatarios;
DROP POLICY IF EXISTS "Admin gerencia destinatarios resumo" ON public.resumo_semanal_destinatarios;
CREATE POLICY "Admin gerencia destinatarios resumo" ON public.resumo_semanal_destinatarios
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Envios: só a Edge Function (service_role) grava; admin lê o histórico.
DROP POLICY IF EXISTS "Admin pmo select envios resumo" ON public.resumo_semanal_envios;
DROP POLICY IF EXISTS "Admin select envios resumo" ON public.resumo_semanal_envios;
CREATE POLICY "Admin select envios resumo" ON public.resumo_semanal_envios
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

COMMIT;
