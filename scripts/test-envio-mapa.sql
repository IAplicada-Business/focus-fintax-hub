-- Harness do envio mensal do Mapa (Task 1 do plano
-- docs/superpowers/plans/2026-08-26-envio-mapa-mensal-whatsapp.md).
-- Roda contra Postgres efêmero + scripts/stub-schema-mapa.sql.
\set ON_ERROR_STOP on
\timing off

-- Cliente elegível, cliente sem whatsapp, cliente opt-out, cliente inativo.
insert into public.clientes (empresa, cnpj, status, whatsapp, nome_contato)
values
  ('Alfa Ltda',  '11111111111111', 'ativo',   '(21) 98765-4321', 'Ana'),
  ('Beta Ltda',  '22222222222222', 'ativo',   '',                 'Bruno'),
  ('Gama Ltda',  '33333333333333', 'ativo',   '21987654322',      'Carla'),
  ('Delta Ltda', '44444444444444', 'inativo', '21987654323',      'Dino');

update public.clientes set nao_enviar_mapa = true where empresa = 'Gama Ltda';

-- normalizar_whatsapp
do $$
begin
  assert public.normalizar_whatsapp('(21) 98765-4321') = '5521987654321', 'mascara 11 digitos';
  assert public.normalizar_whatsapp('2198765432')      = '552198765432',  'fixo 10 digitos';
  assert public.normalizar_whatsapp('5521987654321')   = '5521987654321', 'ja com 55';
  assert public.normalizar_whatsapp('')                is null,           'vazio';
  assert public.normalizar_whatsapp(null)              is null,           'null';
  assert public.normalizar_whatsapp('123')             is null,           'curto demais';
  assert public.normalizar_whatsapp('5501987654321')   is null,           'DDD invalido (01) com 55';
  assert public.normalizar_whatsapp('9921987654321')   is null,           'longo e sem 55';
  assert public.normalizar_whatsapp('219876543210')    is null,           '12 digitos sem 55';
  raise notice 'OK normalizar_whatsapp';
end $$;

-- mapa_envios_pendentes: só Alfa entra. Beta sem whatsapp, Gama opt-out, Delta inativo.
do $$
declare p jsonb;
begin
  p := public.mapa_envios_pendentes(100);
  assert jsonb_array_length(p->'pendentes') = 1,
    'esperava 1 pendente, veio ' || jsonb_array_length(p->'pendentes');
  assert p->'pendentes'->0->>'empresa' = 'Alfa Ltda', 'pendente errado';
  assert (p->>'inelegiveis_cadastro')::int = 1,
    'Beta deveria contar como inelegivel por cadastro';
  assert (p->'pendentes'->0->>'link') like '%/mapa/%', 'link malformado';
  raise notice 'OK mapa_envios_pendentes elegibilidade';
end $$;

-- Idempotência: após sucesso, Alfa sai da fila.
do $$
declare p jsonb;
begin
  p := public.mapa_envios_pendentes(100);
  insert into public.mapa_envio_log
    (cliente_id, competencia, destinatario, link, mensagem, status)
  values (
    (p->'pendentes'->0->>'cliente_id')::uuid,
    date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
    '5521987654321', 'x', 'x', 'sucesso'
  );
  p := public.mapa_envios_pendentes(100);
  assert jsonb_array_length(p->'pendentes') = 0, 'sucesso no mes nao removeu da fila';
  raise notice 'OK idempotencia';
end $$;

-- Índice único impede duplicata de sucesso na mesma competência.
do $$
declare c uuid; ok boolean := false;
begin
  select id into c from public.clientes where empresa = 'Alfa Ltda';
  begin
    insert into public.mapa_envio_log
      (cliente_id, competencia, destinatario, link, mensagem, status)
    values (c, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
            '5521987654321', 'x', 'x', 'sucesso');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'indice unico de sucesso nao bloqueou duplicata';
  raise notice 'OK unique sucesso';
end $$;

-- get_mapa_by_token: token válido devolve dados, incrementa acesso, revogado devolve null.
do $$
declare tok text; r jsonb; a int;
begin
  select token into tok from public.mapa_links ml
    join public.clientes c on c.id = ml.cliente_id where c.empresa = 'Alfa Ltda';
  assert tok is not null, 'token nao foi criado por mapa_envios_pendentes';

  r := public.get_mapa_by_token(tok);
  assert r->'cliente'->>'empresa' = 'Alfa Ltda', 'token valido nao devolveu cliente';

  select acessos into a from public.mapa_links where token = tok;
  assert a = 1, 'acessos nao incrementou, veio ' || a;

  update public.mapa_links set revogado_em = now() where token = tok;
  assert public.get_mapa_by_token(tok) is null, 'token revogado ainda abre';

  assert public.get_mapa_by_token('nao-existe') is null, 'token inexistente nao devolveu null';
  raise notice 'OK get_mapa_by_token';
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;
