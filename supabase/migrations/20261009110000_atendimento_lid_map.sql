-- Cache lid -> telefone.
--
-- A Z-API às vezes entrega o telefone de uma conversa como um identificador
-- interno (`<dígitos>@lid`) em vez do número de verdade — normalmente na
-- primeira mensagem de um contato novo, antes do "match" ficar pronto do lado
-- deles. Resolver isso exige perguntar pra própria Z-API (endpoint de
-- metadados de chat/contato); esta tabela guarda a resposta pra não bater lá
-- de novo a cada mensagem do mesmo contato. Mesmo padrão em produção no
-- projeto bz-advocacia (`whatsapp_lid_map`).
--
-- Só o transporte (Edge Function atendimento-zapi, via service_role) lê e
-- escreve aqui — não é dado que a tela do painel precisa olhar diretamente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.atendimento_lid_map (
  lid text PRIMARY KEY,
  telefone text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.atendimento_lid_map IS
  'Cache lid (@lid) -> telefone real, aprendido via lookup na Z-API (zapiTelefoneDoLid). Evita repetir a chamada a cada mensagem do mesmo contato.';

ALTER TABLE public.atendimento_lid_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atendimento_lid_map FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.atendimento_lid_map TO service_role;

COMMIT;
