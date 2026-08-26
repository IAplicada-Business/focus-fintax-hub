\set ON_ERROR_STOP on
\timing off

-- Stub do net.http_post: registra a chamada em vez de sair pela rede.
create schema if not exists net;
create table if not exists net._chamadas (
  id bigserial primary key, url text, body jsonb, headers jsonb, em timestamptz default now()
);
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language plpgsql as $$
declare id bigint;
begin
  insert into net._chamadas (url, body, headers) values (url, body, headers) returning net._chamadas.id into id;
  return id;
end $$;

insert into public.clientes (empresa, status) values ('Alfa Ltda','ativo'), ('Beta Ltda','ativo');
insert into public.processos_teses (cliente_id, tese, nome_exibicao)
select id, 'SUBVENCAO', 'Subvenção de ICMS' from public.clientes;

-- 1) Lançamento único dispara 1 webhook e 1 pendência.
do $$
declare c uuid; pt uuid;
begin
  select id into c from public.clientes where empresa='Alfa Ltda';
  select id into pt from public.processos_teses where cliente_id=c;
  insert into public.compensacoes_mensais (cliente_id, processo_tese_id, mes_referencia, valor_compensado, tributo)
  values (c, pt, '2026-08-01', 1000, 'INSS');
  assert (select count(*) from net._chamadas) = 1, 'esperava 1 webhook, veio ' || (select count(*) from net._chamadas);
  assert (select count(*) from public.notificacao_compensacao_log) = 1, 'esperava 1 pendencia';
  raise notice 'OK lancamento unico';
end $$;

-- 2) Segunda linha do MESMO cliente/mes dentro da janela nao duplica.
do $$
declare c uuid; pt uuid;
begin
  select id into c from public.clientes where empresa='Alfa Ltda';
  select id into pt from public.processos_teses where cliente_id=c;
  insert into public.compensacoes_mensais (cliente_id, processo_tese_id, mes_referencia, valor_compensado, tributo)
  values (c, pt, '2026-08-01', 500, 'COFINS');
  assert (select count(*) from net._chamadas) = 1, 'nao deveria disparar de novo, veio ' || (select count(*) from net._chamadas);
  assert (select count(*) from public.notificacao_compensacao_log) = 1, 'nao deveria criar pendencia nova';
  raise notice 'OK dedupe na janela';
end $$;

-- 3) Mes DIFERENTE do mesmo cliente e evento novo.
do $$
declare c uuid; pt uuid;
begin
  select id into c from public.clientes where empresa='Alfa Ltda';
  select id into pt from public.processos_teses where cliente_id=c;
  insert into public.compensacoes_mensais (cliente_id, processo_tese_id, mes_referencia, valor_compensado, tributo)
  values (c, pt, '2026-07-01', 300, 'PIS');
  assert (select count(*) from net._chamadas) = 2, 'mes diferente deveria disparar, veio ' || (select count(*) from net._chamadas);
  raise notice 'OK mes diferente dispara';
end $$;

-- 4) INSERT multi-linha de 2 clientes: 1 webhook por cliente, nao por linha.
do $$
declare ca uuid; cb uuid; pa uuid; pb uuid; antes int;
begin
  select count(*) into antes from net._chamadas;
  select id into ca from public.clientes where empresa='Alfa Ltda';
  select id into cb from public.clientes where empresa='Beta Ltda';
  select id into pa from public.processos_teses where cliente_id=ca;
  select id into pb from public.processos_teses where cliente_id=cb;
  insert into public.compensacoes_mensais (cliente_id, processo_tese_id, mes_referencia, valor_compensado, tributo)
  values (ca, pa, '2026-06-01', 100, 'INSS'),
         (ca, pa, '2026-06-01', 200, 'PIS'),
         (cb, pb, '2026-06-01', 300, 'INSS'),
         (cb, pb, '2026-06-01', 400, 'PIS');
  assert (select count(*) from net._chamadas) - antes = 2,
    'esperava 2 webhooks (1 por cliente), veio ' || ((select count(*) from net._chamadas) - antes);
  raise notice 'OK agrupa dentro do comando';
end $$;

-- 5) CARGA: comando com mais de 10 linhas nao dispara nada.
do $$
declare cb uuid; pb uuid; antes int;
begin
  select count(*) into antes from net._chamadas;
  select id into cb from public.clientes where empresa='Beta Ltda';
  select id into pb from public.processos_teses where cliente_id=cb;
  insert into public.compensacoes_mensais (cliente_id, processo_tese_id, mes_referencia, valor_compensado, tributo)
  select cb, pb, ('2025-01-01'::date + (g || ' months')::interval)::date, 100 * g, 'INSS'
  from generate_series(1, 11) g;
  assert (select count(*) from net._chamadas) = antes,
    'carga de 11 linhas nao deveria disparar, veio ' || ((select count(*) from net._chamadas) - antes);
  raise notice 'OK carga silenciada';
end $$;

-- 6) Falha no webhook NAO pode derrubar o INSERT.
do $$
declare c uuid; pt uuid; total int;
begin
  create or replace function net.http_post(
    url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000
  ) returns bigint language plpgsql as $f$
  begin raise exception 'rede fora'; end $f$;

  select id into c from public.clientes where empresa='Beta Ltda';
  select id into pt from public.processos_teses where cliente_id=c;
  insert into public.compensacoes_mensais (cliente_id, processo_tese_id, mes_referencia, valor_compensado, tributo)
  values (c, pt, '2026-09-01', 999, 'INSS');
  select count(*) into total from public.compensacoes_mensais where mes_referencia = '2026-09-01';
  assert total = 1, 'o INSERT deveria ter sobrevivido a falha do webhook';
  raise notice 'OK falha de rede nao derruba INSERT';
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;

-- 7) Payload agrupa o mes inteiro e lista todos os percentuais distintos.
do $$
declare c uuid; pt uuid; p jsonb;
begin
  select id into c from public.clientes where empresa='Alfa Ltda';
  select id into pt from public.processos_teses where cliente_id=c;
  update public.compensacoes_mensais set honorario_percentual = 0.15, honorario_valor = valor_compensado * 0.15
   where cliente_id=c and mes_referencia='2026-08-01' and tributo='INSS';
  update public.compensacoes_mensais set honorario_percentual = 0.20, honorario_valor = valor_compensado * 0.20
   where cliente_id=c and mes_referencia='2026-08-01' and tributo='COFINS';

  p := public.notificacao_compensacao_payload(c, '2026-08-01');
  assert p->>'empresa' = 'Alfa Ltda', 'empresa errada';
  assert jsonb_array_length(p->'linhas') = 2, 'esperava 2 linhas no grupo, veio ' || jsonb_array_length(p->'linhas');
  assert (p->>'total_compensado')::numeric = 1500, 'total errado: ' || (p->>'total_compensado');
  assert (p->>'total_honorarios')::numeric = 250, 'honorario errado: ' || (p->>'total_honorarios');
  assert p->'percentuais' = '[15.00, 20.00]'::jsonb, 'percentuais errados: ' || (p->>'percentuais');
  raise notice 'OK payload agrupado com percentual misto';
end $$;

select 'PAYLOAD OK' as resultado;
