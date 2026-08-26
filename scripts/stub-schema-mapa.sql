-- Stub mínimo para rodar 20260826140000_envio_mapa_mensal.sql isolada num
-- Postgres efêmero. NÃO é o schema real — só o suficiente para a migration
-- e o harness de teste rodarem sem o resto do projeto.
create role authenticated;
create role anon;
create role service_role;
-- pgcrypto vive em `extensions` no Supabase, NÃO em public. Instalar aqui em
-- public faria o harness passar e a produção quebrar — foi exatamente o que
-- aconteceu em 26/08 com gen_random_bytes.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create type public.app_role as enum ('admin','pmo','gestor_tributario','comercial','cliente','sdr','gestor_comercial','marketing');
create function public.has_role(_u uuid, _r public.app_role) returns boolean
  language sql stable as $$ select false $$;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa text, cnpj text, status text not null default 'ativo',
  whatsapp text, nome_contato text, email text,
  data_apuracao date, criado_em timestamptz not null default now()
);
create table public.processos_teses (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  tese text, nome_exibicao text
);
create table public.compensacoes_mensais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  valor_compensado numeric, tese_origem_id uuid, processo_tese_id uuid,
  mes_referencia date, tributo text, tributo_enum text,
  -- Colunas de honorário: existem em producao e o stub precisa espelhar, senao
  -- o harness passa e a migration quebra no Supabase.
  honorario_valor numeric, honorario_percentual numeric,
  valor_nf_servico numeric, nfse_valor numeric,
  lancado_mapa boolean not null default false,
  criado_em timestamptz not null default now()
);
create table public.creditos_apurados (
  cliente_id uuid references public.clientes(id) on delete cascade,
  tese_id text, valor_compensado_manual numeric
);
create view public.v_mapa_creditos as
  select c.id as cliente_id, 'INSUMOS'::text as tese_codigo, 'Insumos'::text as tese_label,
         null::uuid as tese_id, true as visivel_cliente,
         0::numeric as valor_apurado_inicial, 0::numeric as total_compensado,
         0::numeric as saldo_final
  from public.clientes c where false;
