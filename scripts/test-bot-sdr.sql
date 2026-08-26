\set ON_ERROR_STOP on
\timing off

create schema if not exists net;
create table if not exists net._chamadas (id bigserial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000) returns bigint
language plpgsql as $$ declare i bigint;
begin insert into net._chamadas (url, body, headers) values (url, body, headers) returning net._chamadas.id into i; return i; end $$;

insert into public.leads (nome, empresa, whatsapp, status_funil) values ('x','Lead Teste','21999990000','novo');

-- 1) Config nasce com bot DESLIGADO globalmente.
do $$
begin
  assert (select ativo_global from public.bot_config) = false, 'ativo_global deveria nascer false';
  assert (select length(prompt) from public.bot_config) > 100, 'prompt padrao deveria estar semeado';
  assert (select max_respostas from public.bot_config) = 6, 'max_respostas default errado';
  raise notice 'OK config nasce desligada com prompt semeado';
end $$;

-- 2) Com global desligado, o bot nao responde nem se a conversa estiver ligada.
do $$
declare c jsonb;
begin
  perform public.atendimento_registrar_entrada('21999990000', 'oi', 'texto', null, 'B1');
  update public.atendimento_conversas set bot_ativo = true where telefone = '5521999990000';
  c := public.bot_contexto('5521999990000');
  assert (c->>'pode_responder')::boolean = false, 'global desligado deveria bloquear';
  assert c->>'motivo' = 'global_desligado', 'motivo: ' || (c->>'motivo');
  raise notice 'OK kill switch global bloqueia';
end $$;

-- 3) Com os dois ligados, pode responder e recebe prompt + historico.
do $$
declare c jsonb;
begin
  update public.bot_config set ativo_global = true;
  c := public.bot_contexto('5521999990000');
  assert (c->>'pode_responder')::boolean, 'deveria poder responder: ' || (c->>'motivo');
  assert length(c->>'prompt') > 100, 'prompt nao veio';
  assert jsonb_array_length(c->'mensagens') >= 1, 'historico nao veio';
  raise notice 'OK contexto completo com os dois ligados';
end $$;

-- 4) Conversa com bot desligado nao responde.
do $$
declare c jsonb;
begin
  update public.atendimento_conversas set bot_ativo = false where telefone='5521999990000';
  c := public.bot_contexto('5521999990000');
  assert (c->>'pode_responder')::boolean = false and c->>'motivo' = 'conversa_desligada',
    'motivo: ' || (c->>'motivo');
  update public.atendimento_conversas set bot_ativo = true where telefone='5521999990000';
  raise notice 'OK switch por conversa bloqueia';
end $$;

-- 5) Resposta do bot entra pelo outbox e e marcada como bot.
do $$
declare r jsonb; m record;
begin
  r := public.bot_registrar_resposta('5521999990000', 'Ola! Aqui e da Focus.');
  select direcao, status, origem into m from public.atendimento_mensagens where id = (r->>'mensagem_id')::uuid;
  assert m.direcao='saida' and m.status='pendente' and m.origem='bot',
    format('esperava saida/pendente/bot, veio %s/%s/%s', m.direcao, m.status, m.origem);
  raise notice 'OK resposta do bot no outbox marcada como bot';
end $$;

-- 6) O bot NAO se desliga com a propria resposta.
do $$
begin
  assert (select bot_ativo from public.atendimento_conversas where telefone='5521999990000') = true,
    'a resposta do proprio bot nao pode desligar o bot';
  raise notice 'OK bot nao se desliga sozinho';
end $$;

-- 7) O bot nao responde duas vezes seguidas (ultima mensagem e saida).
do $$
declare c jsonb;
begin
  c := public.bot_contexto('5521999990000');
  assert (c->>'pode_responder')::boolean = false and c->>'motivo' = 'sem_mensagem_nova',
    'motivo: ' || (c->>'motivo');
  raise notice 'OK nao responde a si mesmo';
end $$;

-- 8) RESPOSTA HUMANA DESLIGA O BOT.
do $$
begin
  perform public.atendimento_registrar_entrada('5521999990000', 'e caro?', 'texto', null, 'B2');
  insert into public.atendimento_mensagens (telefone, direcao, texto, status, origem, autor_id)
  values ('5521999990000', 'saida', 'oi, aqui e o Joao', 'pendente', 'humano', null);
  assert (select bot_ativo from public.atendimento_conversas where telefone='5521999990000') = false,
    'resposta humana deveria desligar o bot';
  raise notice 'OK resposta humana desliga o bot';
end $$;

-- 9) Teto de respostas para o bot, mesmo com tudo ligado.
do $$
declare c jsonb; i int;
begin
  update public.atendimento_conversas set bot_ativo = true where telefone='5521999990000';
  update public.bot_config set max_respostas = 2;
  -- zera e cria 2 respostas do bot
  delete from public.atendimento_mensagens where telefone='5521999990000';
  perform public.atendimento_registrar_entrada('5521999990000', 'oi', 'texto', null, 'B10');
  for i in 1..2 loop
    perform public.bot_registrar_resposta('5521999990000', 'resposta ' || i);
    perform public.atendimento_registrar_entrada('5521999990000', 'pergunta ' || i, 'texto', null, 'B1' || i);
  end loop;
  c := public.bot_contexto('5521999990000');
  assert (c->>'pode_responder')::boolean = false and c->>'motivo' = 'teto_de_respostas',
    'motivo: ' || (c->>'motivo');
  raise notice 'OK teto de respostas para o bot';
end $$;

-- 10) Telefone sem conversa nao quebra.
do $$
declare c jsonb;
begin
  c := public.bot_contexto('5511000000000');
  assert (c->>'pode_responder')::boolean = false, 'telefone desconhecido deveria bloquear';
  raise notice 'OK telefone sem conversa (%)', c->>'motivo';
end $$;

select 'BOT OK' as resultado;

-- 11) A RPC da aba devolve `origem`, senao a tela nao distingue robo de humano.
do $$
declare r jsonb; tem_origem boolean;
begin
  perform public.bot_registrar_resposta('5521999990000', 'resposta do robo');
  r := public.atendimento_conversa('21999990000');
  select bool_or(m->>'origem' = 'bot') into tem_origem
    from jsonb_array_elements(r->'mensagens') m;
  assert tem_origem, 'a RPC deveria marcar a mensagem do bot com origem=bot';
  raise notice 'OK RPC devolve origem';
end $$;

select 'ORIGEM OK' as resultado;
