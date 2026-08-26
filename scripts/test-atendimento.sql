\set ON_ERROR_STOP on
\timing off

create schema if not exists net;
create table if not exists net._chamadas (id bigserial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000) returns bigint
language plpgsql as $$
declare i bigint;
begin insert into net._chamadas (url, body, headers) values (url, body, headers) returning net._chamadas.id into i; return i; end $$;

-- 0) Sem segredo no vault o trigger NAO dispara (e nao e erro).
do $$
declare antes int;
begin
  select count(*) into antes from net._chamadas;
  insert into public.atendimento_mensagens (telefone, direcao, texto, status)
  values ('5511777776666', 'saida', 'antes de configurar', 'pendente');
  assert (select count(*) from net._chamadas) = antes,
    'sem vault configurado nao pode disparar';
  assert (select count(*) from public.atendimento_mensagens where texto='antes de configurar') = 1,
    'a mensagem deveria ter sido gravada mesmo assim';
  raise notice 'OK inerte sem configuracao';
end $$;

-- A partir daqui, com os segredos configurados.
insert into vault.decrypted_secrets values
  ('atendimento_enviar_url','https://n8n.exemplo/webhook/atendimento-enviar'),
  ('atendimento_webhook_token','segredo-atendimento');

insert into public.leads (nome, empresa, whatsapp, status_funil, status_funil_atualizado_em) values
  ('a','Alves e bernaca',     '22981143032', 'novo',             now() - interval '5 days'),
  ('b','Alves e bernaca Ltda','22981143032', 'em_negociacao',    now() - interval '2 days'),
  ('c','Alves e bernaca Ltda','22981143032', 'qualificado',      now() - interval '1 day'),
  ('d','Outra Empresa',       '21999998888', 'novo',             now());

-- 1) Resolucao com telefone duplicado escolhe o lead MAIS AVANCADO no funil.
do $$
declare r jsonb; emp text;
begin
  r := public.atendimento_resolver_contato('5522981143032');
  select empresa into emp from public.leads where id = (r->>'lead_id')::uuid;
  assert (select status_funil from public.leads where id = (r->>'lead_id')::uuid) = 'em_negociacao',
    'deveria escolher o lead em_negociacao, veio ' || (select status_funil from public.leads where id=(r->>'lead_id')::uuid);
  raise notice 'OK resolucao escolhe lead mais avancado (%)', emp;
end $$;

-- 2) Telefone desconhecido resolve sem erro, com vinculos nulos.
do $$
declare r jsonb;
begin
  r := public.atendimento_resolver_contato('5511000000000');
  assert r->>'lead_id' is null, 'telefone desconhecido nao deveria achar lead';
  raise notice 'OK telefone desconhecido';
end $$;

-- 3) Mensagem de ENTRADA nao dispara webhook de envio.
do $$
declare antes int;
begin
  select count(*) into antes from net._chamadas;
  insert into public.atendimento_mensagens (telefone, direcao, texto, status, zapi_message_id)
  values ('5522981143032', 'entrada', 'oi, quero saber sobre creditos', 'recebida', 'ZAPI-1');
  assert (select count(*) from net._chamadas) = antes, 'entrada nao pode disparar envio';
  raise notice 'OK entrada nao dispara envio';
end $$;

-- 4) Conversa criada automaticamente, com bot DESLIGADO.
do $$
begin
  assert exists (select 1 from public.atendimento_conversas where telefone='5522981143032'),
    'conversa deveria ter sido criada na primeira mensagem';
  assert (select bot_ativo from public.atendimento_conversas where telefone='5522981143032') = false,
    'bot deveria nascer desligado';
  raise notice 'OK conversa criada com bot desligado';
end $$;

-- 5) Idempotencia: mesmo zapi_message_id nao duplica.
do $$
declare ok boolean := false;
begin
  begin
    insert into public.atendimento_mensagens (telefone, direcao, texto, status, zapi_message_id)
    values ('5522981143032', 'entrada', 'duplicada', 'recebida', 'ZAPI-1');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'zapi_message_id repetido deveria ser bloqueado';
  raise notice 'OK idempotencia do webhook';
end $$;

-- 6) SAIDA pendente dispara webhook de envio.
do $$
declare antes int;
begin
  select count(*) into antes from net._chamadas;
  insert into public.atendimento_mensagens (telefone, direcao, texto, status)
  values ('5522981143032', 'saida', 'ola! posso ajudar?', 'pendente');
  assert (select count(*) from net._chamadas) - antes = 1,
    'saida pendente deveria disparar 1 webhook, veio ' || ((select count(*) from net._chamadas) - antes);
  raise notice 'OK saida dispara envio';
end $$;

-- 7) Saida JA enviada (vinda do n8n) nao redispara.
do $$
declare antes int;
begin
  select count(*) into antes from net._chamadas;
  insert into public.atendimento_mensagens (telefone, direcao, texto, status, zapi_message_id)
  values ('5522981143032', 'saida', 'resposta do bot', 'enviada', 'ZAPI-2');
  assert (select count(*) from net._chamadas) = antes, 'saida ja enviada nao pode redisparar';
  raise notice 'OK saida enviada nao redispara';
end $$;

-- 8) Falha de rede NAO derruba o INSERT.
do $$
declare total int;
begin
  create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000) returns bigint
  language plpgsql as $f$ begin raise exception 'rede fora'; end $f$;

  insert into public.atendimento_mensagens (telefone, direcao, texto, status)
  values ('5522981143032', 'saida', 'mensagem com rede fora', 'pendente');
  select count(*) into total from public.atendimento_mensagens where texto = 'mensagem com rede fora';
  assert total = 1, 'o INSERT deveria sobreviver a falha do webhook';
  raise notice 'OK falha de rede nao derruba INSERT';
end $$;

-- 9) A conversa e UMA so para os 3 leads que dividem o telefone.
do $$
declare n int;
begin
  select count(*) into n from public.atendimento_mensagens where telefone = '5522981143032';
  assert n >= 4, 'esperava as mensagens agrupadas no mesmo telefone, veio ' || n;
  -- Uma conversa POR TELEFONE: os 3 leads que dividem 5522981143032 veem a mesma.
  assert (select count(*) from public.atendimento_conversas where telefone='5522981143032') = 1,
    'deveria haver exatamente 1 conversa para o telefone compartilhado';
  assert (select count(*) from public.leads
           where public.normalizar_whatsapp(whatsapp) = '5522981143032') = 3,
    'o cenario deveria ter 3 leads dividindo o telefone';
  raise notice 'OK uma conversa por telefone (% mensagens)', n;
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;

-- 10) RPC da aba: recebe telefone CRU, normaliza dentro, agrupa a conversa.
do $$
declare r jsonb;
begin
  r := public.atendimento_conversa('(22) 98114-3032');   -- cru, com mascara
  assert r->>'telefone' = '5522981143032', 'nao normalizou: ' || coalesce(r->>'telefone','null');
  assert (r->>'leads_compartilhando')::int = 3, 'esperava 3 leads dividindo, veio ' || (r->>'leads_compartilhando');
  assert jsonb_array_length(r->'mensagens') >= 4, 'esperava as mensagens da conversa';
  assert (r->>'bot_ativo')::boolean = false, 'bot deveria estar desligado';
  raise notice 'OK RPC da aba (% mensagens, % leads)', jsonb_array_length(r->'mensagens'), r->>'leads_compartilhando';
end $$;

-- 11) Telefone invalido nao quebra a tela: volta vazio, nao erro.
do $$
declare r jsonb;
begin
  r := public.atendimento_conversa('123');
  assert r->>'telefone' is null, 'telefone invalido deveria voltar null';
  assert jsonb_array_length(r->'mensagens') = 0, 'deveria voltar sem mensagens';
  assert (r->>'leads_compartilhando')::int = 0, 'nao deveria contar leads';
  raise notice 'OK telefone invalido volta vazio';
end $$;

select 'RPC OK' as resultado;
