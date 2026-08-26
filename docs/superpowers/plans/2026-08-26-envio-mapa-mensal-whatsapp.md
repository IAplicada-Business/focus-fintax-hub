# Envio automático do Mapa Tributário por WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo dia 5, cada cliente ativo com WhatsApp cadastrado recebe uma mensagem com link público para o seu Mapa Tributário, espaçada 5–10 min entre clientes, com log que serve de estado.

**Architecture:** Toda a elegibilidade e a normalização de telefone moram em funções SQL (testáveis sem n8n). O n8n só orquestra: pede a lista pendente, envia, loga, espera. O link público reusa o padrão `/diagnostico/:token`, e o cálculo das linhas do Mapa é extraído para uma função pura compartilhada entre a página autenticada e a pública — para que os números não possam divergir.

**Tech Stack:** Postgres 17 (Supabase), PostgREST, n8n, Z-API, Vite + React + TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-envio-mapa-mensal-whatsapp-design.md`

## Global Constraints

- Timezone de toda regra de data: `America/Sao_Paulo`.
- Competência = `date_trunc('month', now() at time zone 'America/Sao_Paulo')::date`.
- Telefone é armazenado em `clientes.whatsapp` **sem** código de país (convenção de `src/pages/ClienteDetail.tsx:318`, que monta `wa.me/55${whatsapp}`). A normalização para `55DDNNNNNNNN` acontece só na hora do envio.
- Toda migration nova é aplicada **individualmente** (SQL Editor ou `apply_migration`), nunca `supabase db push` — o ledger deste projeto está incompleto (5 registros para ~40 arquivos).
- Nenhuma chave em node do n8n: credencial Supabase API + variáveis `ZAPI_*`.
- Janela de envio: 08:00–18:00. Fora dela, a execução encerra e o dia seguinte retoma.
- Migrations em `supabase/migrations/`, nomeadas `AAAAMMDDHHMMSS_descricao.sql`.

---

### Task 1: Schema e funções SQL do envio

**Files:**
- Create: `supabase/migrations/20260826140000_envio_mapa_mensal.sql`
- Create: `scripts/test-envio-mapa.sql` (harness de teste, roda em Postgres efêmero)

**Interfaces:**
- Consumes: `public.clientes` (`id, empresa, cnpj, status, whatsapp, nome_contato`), `public.v_mapa_creditos`, `public.compensacoes_mensais`, `public.processos_teses`, `public.creditos_apurados`
- Produces:
  - `public.normalizar_whatsapp(text) → text` (NULL se não normalizável)
  - `public.mapa_envios_pendentes(p_limite int DEFAULT 100) → jsonb`
  - `public.get_mapa_by_token(_token text) → jsonb`
  - Tabelas `public.mapa_links`, `public.mapa_envio_log`
  - Coluna `public.clientes.nao_enviar_mapa boolean`

- [ ] **Step 1: Escrever o harness de teste que falha**

`scripts/test-envio-mapa.sql`:

```sql
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
declare tok text; p jsonb;
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
```

- [ ] **Step 2: Rodar o harness e confirmar que falha**

```bash
SP="$(mktemp -d)"
initdb -D "$SP/pg" -U postgres --no-locale -E UTF8 >/dev/null
pg_ctl -D "$SP/pg" -o "-p 54399 -h 127.0.0.1 -c unix_socket_directories=''" -l "$SP/pg.log" start
psql -h 127.0.0.1 -p 54399 -U postgres -f scripts/stub-schema-mapa.sql   # criado no Step 3
psql -h 127.0.0.1 -p 54399 -U postgres -f scripts/test-envio-mapa.sql
```

Expected: FAIL com `function public.normalizar_whatsapp(text) does not exist`.

- [ ] **Step 3: Criar o stub de schema para o Postgres efêmero**

`scripts/stub-schema-mapa.sql` — só o necessário para a migration rodar isolada:

```sql
create role authenticated;
create role anon;
create role service_role;
create extension if not exists pgcrypto;
create schema if not exists auth;
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
  mes_referencia date, tributo text, tributo_enum text
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
```

- [ ] **Step 4: Escrever a migration**

`supabase/migrations/20260826140000_envio_mapa_mensal.sql`:

```sql
-- Step 15 (parcial: canal WhatsApp) — envio mensal do Mapa Tributário.
-- Spec: docs/superpowers/specs/2026-08-26-envio-mapa-mensal-whatsapp-design.md
--
-- Elegibilidade e normalização de telefone vivem AQUI, não no n8n: são regra de
-- negócio, precisam ser testáveis sem subir workflow, e precisam bater com o
-- `wa.me/55${whatsapp}` que ClienteDetail.tsx já usa.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Opt-out manual. Cliente pede pra parar, o time marca, a automação respeita.
--    Bloqueio evitado é ban evitado — é o sinal que mais derruba número.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nao_enviar_mapa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.nao_enviar_mapa IS
  'true = cliente pediu para não receber o Mapa mensal por WhatsApp. Respeitado por mapa_envios_pendentes().';

-- ---------------------------------------------------------------------------
-- 2) mapa_links — um token permanente por cliente, revogável.
--
-- Token permanente foi decisão do cliente (26/08): link fixo, cliente pode
-- salvar. O risco aceito é que vazamento dá acesso vitalício. revogado_em é o
-- antídoto; acessos/ultimo_acesso_em tornam acesso anômalo visível — sem eles,
-- token permanente é risco cego.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mapa_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  acessos int NOT NULL DEFAULT 0,
  ultimo_acesso_em timestamptz
);

COMMENT ON TABLE public.mapa_links IS
  'Token público permanente por cliente para /mapa/:token. Revogar = setar revogado_em e deletar a linha para gerar outro.';

ALTER TABLE public.mapa_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mapa_links FROM anon, authenticated;

DROP POLICY IF EXISTS "Admin gestor pmo select mapa_links" ON public.mapa_links;
CREATE POLICY "Admin gestor pmo select mapa_links" ON public.mapa_links
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_tributario'::app_role) OR
    has_role(auth.uid(), 'pmo'::app_role)
  );
GRANT SELECT ON public.mapa_links TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) mapa_envio_log — auditoria E estado de idempotência.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mapa_envio_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  destinatario text NOT NULL,
  link text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL,
  zapi_response jsonb,
  erro text,
  executado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mapa_envio_log_status_chk
    CHECK (status IN ('sucesso', 'falha', 'inelegivel'))
);

-- É o BANCO que garante "ninguém recebe duas vezes no mês", não o n8n.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mapa_envio_sucesso
  ON public.mapa_envio_log (cliente_id, competencia)
  WHERE status = 'sucesso';

-- 'inelegivel' também é único por competência: quem falha no phone-exists volta
-- pra fila no dia seguinte (o time pode corrigir o número no meio do mês), e sem
-- isso o log ganharia uma linha por cliente por dia até virar o mês.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mapa_envio_inelegivel
  ON public.mapa_envio_log (cliente_id, competencia)
  WHERE status = 'inelegivel';

CREATE INDEX IF NOT EXISTS ix_mapa_envio_competencia
  ON public.mapa_envio_log (competencia DESC, executado_em DESC);

ALTER TABLE public.mapa_envio_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mapa_envio_log FROM anon, authenticated;

DROP POLICY IF EXISTS "Admin gestor pmo select mapa_envio_log" ON public.mapa_envio_log;
CREATE POLICY "Admin gestor pmo select mapa_envio_log" ON public.mapa_envio_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gestor_tributario'::app_role) OR
    has_role(auth.uid(), 'pmo'::app_role)
  );
GRANT SELECT ON public.mapa_envio_log TO authenticated;
GRANT SELECT, INSERT ON public.mapa_envio_log TO service_role;

-- ---------------------------------------------------------------------------
-- 4) normalizar_whatsapp — o cadastro é preenchido à mão, então erro de
--    digitação é esperado. Número inválido enviado é vetor forte de ban, então
--    é melhor rejeitar aqui do que descobrir na Z-API.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_whatsapp(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
  ddd int;
BEGIN
  d := regexp_replace(COALESCE(p_raw, ''), '\D', '', 'g');

  -- 10 (fixo com DDD) ou 11 (celular com DDD): falta o país.
  IF length(d) IN (10, 11) THEN
    d := '55' || d;
  -- 12 ou 13 já com país: só aceita se o país for 55.
  ELSIF length(d) IN (12, 13) THEN
    IF left(d, 2) <> '55' THEN
      RETURN NULL;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  -- DDD brasileiro válido fica entre 11 e 99.
  ddd := substring(d from 3 for 2)::int;
  IF ddd < 11 THEN
    RETURN NULL;
  END IF;

  RETURN d;
END;
$$;

COMMENT ON FUNCTION public.normalizar_whatsapp(text) IS
  'clientes.whatsapp é guardado sem código de país (convenção de ClienteDetail.tsx). Devolve 55+DDD+numero, ou NULL se não for normalizável.';

-- ---------------------------------------------------------------------------
-- 5) mapa_envios_pendentes — quem falta na competência, com link pronto.
--    Cria o token na primeira vez que o cliente aparece.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mapa_envios_pendentes(p_limite int DEFAULT 100)
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
  -- Ativos, sem opt-out, mas com cadastro que não dá número válido. Nunca entram
  -- no loop, então é aqui que precisam ser contados — é o número que cobra o
  -- time a preencher o cadastro.
  SELECT count(*) INTO v_inelegiveis
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
    AND public.normalizar_whatsapp(c.whatsapp) IS NULL;

  -- Garante token para todo elegível (idempotente).
  INSERT INTO public.mapa_links (cliente_id, token)
  SELECT c.id, encode(gen_random_bytes(24), 'hex')
  FROM public.clientes c
  WHERE c.status = 'ativo'
    AND c.nao_enviar_mapa = false
    AND public.normalizar_whatsapp(c.whatsapp) IS NOT NULL
  ON CONFLICT (cliente_id) DO NOTHING;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.empresa), '[]'::jsonb) INTO v_pendentes
  FROM (
    SELECT
      c.id AS cliente_id,
      c.empresa,
      COALESCE(NULLIF(btrim(c.nome_contato), ''), 'tudo bem') AS nome_contato,
      public.normalizar_whatsapp(c.whatsapp) AS telefone,
      v_base || '/mapa/' || ml.token AS link
    FROM public.clientes c
    JOIN public.mapa_links ml ON ml.cliente_id = c.id AND ml.revogado_em IS NULL
    WHERE c.status = 'ativo'
      AND c.nao_enviar_mapa = false
      AND public.normalizar_whatsapp(c.whatsapp) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.mapa_envio_log l
        WHERE l.cliente_id = c.id
          AND l.competencia = v_comp
          AND l.status IN ('sucesso', 'inelegivel')
      )
    ORDER BY c.empresa
    LIMIT GREATEST(p_limite, 0)
  ) t;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'pendentes', v_pendentes,
    'total_pendentes', jsonb_array_length(v_pendentes),
    'inelegiveis_cadastro', v_inelegiveis
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mapa_envios_pendentes(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) get_mapa_by_token — RPC PÚBLICA. Espelha get_diagnostico_by_token.
--
-- Devolve os dados CRUS das mesmas 5 fontes que MapaCreditos.tsx lê. O cálculo
-- das linhas fica no client, na função compartilhada — se fosse recalculado aqui
-- em SQL, existiriam duas implementações do mesmo número e elas divergiriam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mapa_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_result jsonb;
BEGIN
  SELECT cliente_id INTO v_cliente_id
  FROM public.mapa_links
  WHERE token = _token AND revogado_em IS NULL;

  IF v_cliente_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.mapa_links
  SET acessos = acessos + 1, ultimo_acesso_em = now()
  WHERE token = _token;

  SELECT jsonb_build_object(
    'cliente', (
      SELECT to_jsonb(x) FROM (
        SELECT id, empresa, cnpj, data_apuracao
        FROM public.clientes WHERE id = v_cliente_id
      ) x
    ),
    'mapa', COALESCE((
      SELECT jsonb_agg(to_jsonb(v))
      FROM public.v_mapa_creditos v WHERE v.cliente_id = v_cliente_id
    ), '[]'::jsonb),
    'compensacoes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'valor_compensado', cm.valor_compensado,
        'tese_origem_id', cm.tese_origem_id,
        'processo_tese_id', cm.processo_tese_id,
        'mes_referencia', cm.mes_referencia,
        'tributo', cm.tributo,
        'tributo_enum', cm.tributo_enum,
        'processos_teses', (
          SELECT jsonb_build_object('tese', pt.tese, 'nome_exibicao', pt.nome_exibicao)
          FROM public.processos_teses pt WHERE pt.id = cm.processo_tese_id
        )
      ))
      FROM public.compensacoes_mensais cm WHERE cm.cliente_id = v_cliente_id
    ), '[]'::jsonb),
    'processos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pt.id, 'tese', pt.tese))
      FROM public.processos_teses pt WHERE pt.cliente_id = v_cliente_id
    ), '[]'::jsonb),
    'creditos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tese_id', ca.tese_id,
        'valor_compensado_manual', ca.valor_compensado_manual
      ))
      FROM public.creditos_apurados ca WHERE ca.cliente_id = v_cliente_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_mapa_by_token(text) IS
  'RPC pública de /mapa/:token. Devolve dados crus do Mapa; o cálculo das linhas é feito no client pela função compartilhada buildLinhasMapa.';

GRANT EXECUTE ON FUNCTION public.get_mapa_by_token(text) TO anon, authenticated, service_role;

COMMIT;
```

- [ ] **Step 5: Rodar o harness e confirmar que passa**

```bash
psql -h 127.0.0.1 -p 54399 -U postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20260826140000_envio_mapa_mensal.sql
psql -h 127.0.0.1 -p 54399 -U postgres -f scripts/test-envio-mapa.sql
```

Expected: `TODOS OS TESTES PASSARAM`.

Depois: `pg_ctl -D "$SP/pg" stop -m immediate && rm -rf "$SP"`.

- [ ] **Step 6: Aplicar no Supabase e conferir**

Aplicar via `apply_migration` (nome `envio_mapa_mensal`) ou SQL Editor. **Não** usar `supabase db push`.

```sql
select jsonb_pretty(public.mapa_envios_pendentes(5));
```

Expected: `total_pendentes: 0` e `inelegiveis_cadastro: 94` — ninguém tem WhatsApp ainda. Esse é o número que cobra o cadastro.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260826140000_envio_mapa_mensal.sql scripts/test-envio-mapa.sql scripts/stub-schema-mapa.sql
git commit -m "feat(mapa): schema e funcoes SQL do envio mensal por WhatsApp"
```

---

### Task 2: Extrair o cálculo das linhas do Mapa para função pura

**Files:**
- Create: `src/lib/mapa-creditos.ts`
- Create: `src/test/mapa-creditos.test.ts`
- Modify: `src/pages/MapaCreditos.tsx` (remove a derivação inline, passa a importar)

**Interfaces:**
- Consumes: nada de tasks anteriores
- Produces:
  - `export interface LinhaMapa` — move de `MapaCreditos.tsx:19-31`, inalterada
  - `export interface ClienteMapa { id: string; empresa: string | null; cnpj: string | null; data_apuracao: string | null }`
  - `export interface MapaRawInput { mapa: unknown[]; compensacoes: unknown[]; processos: unknown[]; creditos: unknown[] }`
  - `export function buildLinhasMapa(input: MapaRawInput): LinhaMapa[]`
  - `export const ORDEM_TESES`, `STATUS_LABEL`, `STATUS_STYLE` — movem de `MapaCreditos.tsx:33-62`

Por que esta task existe: é o cálculo que produz os números do Mapa. A página pública precisa dele, e duplicá-lo faria o cliente ver número diferente do time. Extrair primeiro, com teste, torna a Task 4 segura.

- [ ] **Step 1: Escrever o teste que falha**

`src/test/mapa-creditos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLinhasMapa, ORDEM_TESES } from "@/lib/mapa-creditos";

const clienteId = "11111111-1111-1111-1111-111111111111";

describe("buildLinhasMapa", () => {
  it("retorna vazio quando não há linhas na view", () => {
    expect(
      buildLinhasMapa({ mapa: [], compensacoes: [], processos: [], creditos: [] }),
    ).toEqual([]);
  });

  it("ordena as teses pela ordem canônica da planilha SISTEMA", () => {
    const linhas = buildLinhasMapa({
      mapa: [
        { cliente_id: clienteId, tese_codigo: "PREVIDENCIARIO", tese_label: "Previdenciário",
          visivel_cliente: true, valor_apurado_inicial: 100, total_compensado: 0, saldo_final: 100 },
        { cliente_id: clienteId, tese_codigo: "INSUMOS", tese_label: "Insumos",
          visivel_cliente: true, valor_apurado_inicial: 200, total_compensado: 0, saldo_final: 200 },
      ],
      compensacoes: [], processos: [], creditos: [],
    });
    expect(linhas.map((l) => l.tese_codigo)).toEqual(["INSUMOS", "PREVIDENCIARIO"]);
    expect(ORDEM_TESES.INSUMOS).toBeLessThan(ORDEM_TESES.PREVIDENCIARIO);
  });

});
```

Só estes dois testes vêm prontos, e de propósito: são os únicos cujo resultado é
dedutível sem ler a derivação atual. Os demais são escritos no Step 3.5, contra o
código real.
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/test/mapa-creditos.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/mapa-creditos"`.

- [ ] **Step 3: Criar `src/lib/mapa-creditos.ts`**

Mover **verbatim** de `src/pages/MapaCreditos.tsx`:
- `interface LinhaMapa` (linhas 19-31) → `export interface LinhaMapa`
- `STATUS_LABEL` (33-37), `STATUS_STYLE` (39-43), `ORDEM_TESES` (53-62) → `export const`
- `interface Cliente` (45-51) → `export interface ClienteMapa`
- Toda a lógica de derivação que hoje vive dentro do `useEffect` (a partir de `const processoIdsByTese = new Map...`, ~linha 126, até o `setLinhas(...)`) → corpo de `buildLinhasMapa`, trocando `setLinhas(x)` por `return x`.

A assinatura:

```ts
export interface MapaRawInput {
  mapa: unknown[];
  compensacoes: unknown[];
  processos: unknown[];
  creditos: unknown[];
}

export function buildLinhasMapa(input: MapaRawInput): LinhaMapa[] {
  // corpo movido de MapaCreditos.tsx, sem alteração de regra
}
```

Regra desta task: **nenhuma mudança de comportamento**. Se um número mudar, é bug de extração.

- [ ] **Step 3.5: Escrever testes de caracterização contra o código real**

Este é refactor, então o teste tem que travar o comportamento **atual** — não o
que a gente acha que ele deveria ser. Ler o corpo movido (`MapaCreditos.tsx`
linhas ~126-235 antes da extração) e, para cada ramo encontrado, escrever um teste
que assevera o que o código faz hoje. Os ramos que existem lá:

- `valor_compensado_manual` de `creditos_apurados` presente vs ausente
- tese em `v_mapa_creditos` sem processo correspondente em `processos_teses`
- `status_utilizacao` nulo
- compensação com `tese_origem_id` nulo mas `processo_tese_id` preenchido
- tese fora de `ORDEM_TESES` (deve cair no fim, ordem 99 — ver `MapaCreditos.tsx:53-62`)

Regra: se um número no teste discordar do que a página autenticada mostra hoje
para um cliente real, o bug é da extração, não do teste. Conferir contra
`/clientes/<id>/mapa-creditos` antes de aceitar o valor.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/test/mapa-creditos.test.ts`
Expected: PASS — os 2 testes base + os de caracterização do Step 3.5.

- [ ] **Step 5: Refatorar MapaCreditos.tsx para usar a função**

No `useEffect`, substituir a derivação inline por:

```ts
setLinhas(buildLinhasMapa({
  mapa: (v as unknown[]) || [],
  compensacoes: (comps as unknown[]) || [],
  processos: (procs as unknown[]) || [],
  creditos: (creditos as unknown[]) || [],
}));
```

Importar `LinhaMapa`, `ClienteMapa`, `STATUS_LABEL`, `STATUS_STYLE`, `ORDEM_TESES`, `buildLinhasMapa` de `@/lib/mapa-creditos` e remover as definições locais.

- [ ] **Step 6: Rodar suíte inteira e typecheck**

```bash
npx vitest run
npx tsc -p tsconfig.app.json --noEmit
```

Expected: os 188 testes que já passavam continuam passando, mais os novos de `mapa-creditos.test.ts`. O `tsc` continua com os **mesmos 3 erros pré-existentes** em `CompensacoesTab.tsx` — nenhum novo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mapa-creditos.ts src/test/mapa-creditos.test.ts src/pages/MapaCreditos.tsx
git commit -m "refactor(mapa): extrai calculo das linhas para lib compartilhada e testada"
```

---

### Task 3: Extrair o componente visual read-only do Mapa

**Files:**
- Create: `src/components/mapa/MapaCreditosView.tsx`
- Modify: `src/pages/MapaCreditos.tsx`

**Interfaces:**
- Consumes: `LinhaMapa`, `ClienteMapa`, `STATUS_LABEL`, `STATUS_STYLE` de `@/lib/mapa-creditos` (Task 2)
- Produces:

```ts
export interface MapaCreditosViewProps {
  cliente: ClienteMapa;
  linhas: LinhaMapa[];          // já filtradas pelo chamador
  /** ref do nó capturado pelo exportElementToPdf; a pública não passa */
  printRef?: React.Ref<HTMLDivElement>;
}
export default function MapaCreditosView(props: MapaCreditosViewProps): JSX.Element
```

- [ ] **Step 1: Criar o componente movendo o JSX do bloco do `pdfRef`**

Mover para `MapaCreditosView.tsx` **exatamente** o `<div ref={pdfRef}>` de `MapaCreditos.tsx` e todo o seu conteúdo (o Mapa imprimível: cabeçalho com empresa/CNPJ/data de apuração, tabela de teses, totais). Trocar `ref={pdfRef}` por `ref={printRef}`.

Fica **fora** do componente (continua na página autenticada): botão Voltar, Popover de filtro de teses, botão de download de PDF. São controles de operação, e a página pública não os tem.

- [ ] **Step 2: Usar o componente na página autenticada**

Em `MapaCreditos.tsx`, no lugar do JSX movido:

```tsx
<MapaCreditosView cliente={cliente} linhas={linhasVisiveis} printRef={pdfRef} />
```

- [ ] **Step 3: Verificar que nada mudou visualmente**

```bash
npm run dev
```

Abrir `/clientes/<id>/mapa-creditos` de um cliente com linhas, conferir que a tabela renderiza igual, e que o botão de PDF ainda gera o arquivo (o `printRef` precisa estar chegando no nó certo — se o PDF sair em branco, o ref não foi ligado).

- [ ] **Step 4: Rodar suíte e typecheck**

```bash
npx vitest run && npx tsc -p tsconfig.app.json --noEmit
```

Expected: todos passam; os mesmos 3 erros pré-existentes, nenhum novo.

- [ ] **Step 5: Commit**

```bash
git add src/components/mapa/MapaCreditosView.tsx src/pages/MapaCreditos.tsx
git commit -m "refactor(mapa): extrai componente read-only reusavel do Mapa"
```

---

### Task 4: Rota pública `/mapa/:token` e opt-out no cadastro

**Files:**
- Create: `src/pages/MapaPublico.tsx`
- Modify: `src/App.tsx` (registrar rota ao lado de `/diagnostico/:token`, linha 76)
- Modify: `src/components/clientes/ClienteFormModal.tsx` (switch de opt-out)

**Interfaces:**
- Consumes: `buildLinhasMapa`, `ClienteMapa`, `LinhaMapa` (Task 2); `MapaCreditosView` (Task 3); RPC `get_mapa_by_token` (Task 1)
- Produces: rota `/mapa/:token`

- [ ] **Step 1: Criar a página**

`src/pages/MapaPublico.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import MapaCreditosView from "@/components/mapa/MapaCreditosView";
import { buildLinhasMapa, type ClienteMapa, type LinhaMapa } from "@/lib/mapa-creditos";

export default function MapaPublico() {
  const { token } = useParams<{ token: string }>();
  const [cliente, setCliente] = useState<ClienteMapa | null>(null);
  const [linhas, setLinhas] = useState<LinhaMapa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (supabase as any)
      .rpc("get_mapa_by_token", { _token: token })
      .then(({ data }: { data: any }) => {
        if (data?.cliente) {
          setCliente(data.cliente);
          setLinhas(
            buildLinhasMapa({
              mapa: data.mapa ?? [],
              compensacoes: data.compensacoes ?? [],
              processos: data.processos ?? [],
              creditos: data.creditos ?? [],
            }).filter((l) => l.visivel_cliente),
          );
        }
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Token inválido e token revogado dão a MESMA resposta de propósito: não
  // confirmar para quem tentou adivinhar que o token existiu algum dia.
  if (!cliente) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-2">
        <h1 className="font-display text-lg font-bold text-navy">Link indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Este link não está mais válido. Fale com a equipe Focus FinTax para receber um novo.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <MapaCreditosView cliente={cliente} linhas={linhas} />
    </div>
  );
}
```

Nota: filtra `visivel_cliente` — a página autenticada mostra tudo ao time; a pública mostra só o que é do cliente.

- [ ] **Step 2: Registrar a rota**

Em `src/App.tsx`, logo após a linha 76 (`/diagnostico/:token`), **fora** do `ProtectedRoute`:

```tsx
<Route path="/mapa/:token" element={<Suspense fallback={<PageSpinner />}><MapaPublico /></Suspense>} />
```

Adicionar o import lazy no mesmo padrão dos vizinhos do arquivo.

- [ ] **Step 3: Testar manualmente com token real**

```sql
-- criar whatsapp de teste num cliente e gerar o token
update public.clientes set whatsapp = '21999999999'
where id = '<id-de-um-cliente-ativo-com-linhas-no-mapa>';
select jsonb_pretty(public.mapa_envios_pendentes(1));
```

Abrir `http://localhost:5173/mapa/<token>` **em janela anônima** (prova que não depende de sessão). Depois:

```sql
select acessos, ultimo_acesso_em from public.mapa_links where token = '<token>';
update public.mapa_links set revogado_em = now() where token = '<token>';
```

Recarregar: deve mostrar "Link indisponível".

- [ ] **Step 4: Adicionar o switch de opt-out no cadastro do cliente**

Sem isto, `nao_enviar_mapa` só é marcável via SQL Editor — e o opt-out deixa de
existir na prática, que é justamente o mitigante de bloqueio/denúncia.

`src/components/clientes/ClienteFormModal.tsx`, seguindo o `Switch` de
`compensando_fintax` que já existe no arquivo:

1. No objeto de estado inicial (perto da linha 27), somar `nao_enviar_mapa: false`.
2. No `useEffect` que popula a partir de `cliente` (perto da linha 48), somar
   `nao_enviar_mapa: cliente.nao_enviar_mapa ?? false`.
3. No payload de save (perto da linha 74), somar `nao_enviar_mapa: form.nao_enviar_mapa`.
4. No JSX, logo após o bloco do `Switch` de "Compensando pela Fintax":

```tsx
<div className="flex items-center gap-3">
  <Switch
    checked={form.nao_enviar_mapa}
    onCheckedChange={(v) => update("nao_enviar_mapa", v)}
  />
  <Label>Não enviar Mapa mensal por WhatsApp</Label>
</div>
```

- [ ] **Step 5: Verificar o opt-out ponta a ponta**

Abrir o cadastro de um cliente, marcar o switch, salvar, e confirmar:

```sql
select empresa, nao_enviar_mapa from public.clientes where id = '<id>';
select jsonb_pretty(public.mapa_envios_pendentes(20));
```

Expected: coluna `true`, e o cliente **não** aparece em `pendentes`.

- [ ] **Step 6: Rodar suíte e typecheck**

```bash
npx vitest run && npx tsc -p tsconfig.app.json --noEmit
```

Expected: todos passam; os mesmos 3 erros pré-existentes, nenhum novo.

- [ ] **Step 7: Commit**

```bash
git add src/pages/MapaPublico.tsx src/App.tsx src/components/clientes/ClienteFormModal.tsx
git commit -m "feat(mapa): rota publica /mapa/:token com link revogavel e opt-out no cadastro"
```

---

### Task 5: Workflow n8n

**Files:**
- Create: `automacoes/n8n/envio-mapa-mensal.json`
- Modify: `automacoes/n8n/README.md` (seção nova para este workflow)

**Interfaces:**
- Consumes: RPC `mapa_envios_pendentes` e tabela `mapa_envio_log` (Task 1); rota `/mapa/:token` (Task 4); credencial `Supabase API` e vars `ZAPI_*` (já configuradas no Step 10)
- Produces: workflow importável `Focus FinTax — Envio Mapa Mensal`

Estrutura:

| Node | Tipo | Papel |
|---|---|---|
| `Dia 5-10 08:00 BRT` | scheduleTrigger | cron `0 8 5-10 * *` |
| `Busca Pendentes` | httpRequest (supabaseApi) | `POST /rest/v1/rpc/mapa_envios_pendentes` body `{"p_limite": 20}` |
| `Separa Clientes` | code | `return payload.pendentes.map(p => ({json: p}))`; se vazio, retorna `[]` e o loop não roda |
| `Loop Clientes` | splitInBatches (batchSize 1) | fila |
| `Dentro da janela?` | if | `{{ new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}) < '18' }}` |
| `Tem WhatsApp?` | httpRequest | Z-API `phone-exists`, `onError: continueErrorOutput` |
| `Monta Mensagem` | code | texto da spec |
| `Z-API Enviar` | httpRequest | `send-text`, `onError: continueErrorOutput` |
| `Log Envio` | httpRequest (supabaseApi) | `POST /rest/v1/mapa_envio_log` |
| `Espera 5-10 min` | wait | `={{ Math.floor(Math.random()*301)+300 }}` segundos → volta ao `Loop Clientes` |
| `Resumo Diário` | code + 2× httpRequest | conta e manda para `ZAPI_DESTINO_OPS` e `ZAPI_DESTINO` |

- [ ] **Step 1: Gerar o JSON do workflow**

Escrever um gerador Python em `scratchpad` (como no Step 10) que monte o JSON e valide, ao invés de digitar JSON à mão. Corpo de `Monta Mensagem`:

```js
const p = $input.first().json;
const comp = new Date($('Busca Pendentes').first().json.competencia + 'T12:00:00');
const mesAno = comp.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const mensagem = [
  `Olá, ${p.nome_contato}! 👋`,
  '',
  `O Mapa Tributário da ${p.empresa} referente a ${mesAno} está disponível:`,
  p.link,
  '',
  'Qualquer dúvida, é só responder por aqui.',
  '— Equipe Focus FinTax',
].join('\n');
return [{ json: { ...p, mensagem, competencia: $('Busca Pendentes').first().json.competencia } }];
```

Body do `Log Envio`:

```
={{ JSON.stringify({ cliente_id: $('Monta Mensagem').first().json.cliente_id, competencia: $('Monta Mensagem').first().json.competencia, destinatario: $('Monta Mensagem').first().json.telefone, link: $('Monta Mensagem').first().json.link, mensagem: $('Monta Mensagem').first().json.mensagem, status: ($json.zaapId ? 'sucesso' : 'falha'), zapi_response: $json, erro: ($json.zaapId ? null : ($json.error?.message || $json.message || 'sem zaapId')) }) }}
```

- [ ] **Step 2: Validar todas as expressões em Node antes de importar**

Extrair cada `jsonBody`/`leftValue` do JSON e avaliar com mocks de `$json`, `$env` e `$()`, exatamente como foi feito no Step 10. Expected: todas OK, e todo `jsonBody` produz `JSON.parse`-able.

- [ ] **Step 3: Importar no n8n e configurar**

Selecionar a credencial `Supabase API` nos dois nodes do Supabase. Confirmar Settings → Timezone `America/Sao_Paulo`. Apontar Error Workflow para o handler do Step 10. **Deixar desativado.**

- [ ] **Step 4: Commit**

```bash
git add automacoes/n8n/envio-mapa-mensal.json automacoes/n8n/README.md
git commit -m "feat(mapa): workflow n8n de envio mensal com janela e espacamento"
```

---

### Task 6: Teste ponta a ponta com um número

**Files:** nenhum (validação operacional)

- [ ] **Step 1: Preparar um único cliente elegível**

```sql
update public.clientes set nao_enviar_mapa = true where status = 'ativo';
update public.clientes
   set whatsapp = '<seu numero com DDD>', nome_contato = 'Matheus', nao_enviar_mapa = false
 where id = '<id-de-um-cliente-ativo-com-linhas-no-mapa>';

select jsonb_pretty(public.mapa_envios_pendentes(20));
```

Expected: `total_pendentes: 1`. O opt-out em massa é o que garante que o teste não dispara para ninguém além de você — fazer isso **antes** de rodar o workflow, não depois.

- [ ] **Step 2: Executar o workflow manualmente**

"Execute workflow" no n8n. Expected: mensagem chega no seu WhatsApp, com link que abre o Mapa em janela anônima.

- [ ] **Step 3: Conferir o log e a idempotência**

```sql
select competencia, destinatario, status, erro from public.mapa_envio_log order by executado_em desc;
select jsonb_pretty(public.mapa_envios_pendentes(20));
```

Expected: uma linha `sucesso`; e `total_pendentes: 0` — você não recebe de novo no mesmo mês.

- [ ] **Step 4: Testar o caminho de falha**

Estragar `ZAPI_TOKEN`, reverter o opt-out do seu cliente de teste (`delete from mapa_envio_log where ...`), rodar de novo. Expected: linha `falha` com `erro` preenchido, e alerta chegando em `ZAPI_DESTINO_OPS`.

- [ ] **Step 5: Reverter o estado de teste**

```sql
update public.clientes set nao_enviar_mapa = false where status = 'ativo';
delete from public.mapa_envio_log where destinatario = '<seu numero normalizado>';
```

Deixar `whatsapp` preenchido só nos clientes que o time realmente cadastrou.

- [ ] **Step 6: Ativar com limite baixo**

Primeiro mês real: `p_limite: 20` no node `Busca Pendentes`. Subir depois de um mês sem incidente — número novo em volume alto cai mais rápido que número aquecido.

---

## Notas de execução

- **Ordem importa.** Tasks 2 e 3 são refactor sem mudança de comportamento e precisam vir antes da 4; a página pública depende delas para não duplicar o cálculo.
- **`tsc` já vem com 3 erros pré-existentes** em `src/components/clientes/CompensacoesTab.tsx` (tipo `CompensacaoSumRow` sem `honorario_valor`, `valor_nf_servico`, `honorario_percentual`). Não são desta feature. O critério em cada task é "nenhum erro **novo**".
- **O primeiro envio real está bloqueado** pelo time preencher `clientes.whatsapp`. Tasks 1-6 podem ser concluídas com um único número de teste.
- **Isto não fecha o Step 15.** Falta o canal e-mail (task 3 do blueprint), sem o qual "100% dos clientes ativos recebem" é inatingível.
