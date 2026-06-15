# Focus FinTax — Pacote de Integração Meta Ads
Documento interno IAplicada · 15/06/2026

## 0. O que está aqui
Tudo o que o dev (ou você, no Lovable) precisa colar pra ligar o Meta Ads da Focus dentro do sistema dela, no padrão `mads_*` do CRMIAplicada. Cobre:
- **Migrations Supabase** — 9 tabelas `meta_*` + 1 view `v_meta_lead_funnel` que cruza com o CRM existente da Focus (`leads`, `relatorios_leads`, `clientes`).
- **3 Edge Functions** — `meta-webhook` (recebe lead em tempo real), `meta-sync-structure` (campanhas/ad sets/ads/criativos/forms, diário) e `meta-sync-insights` (performance dia a dia, horário).
- **Secrets** que vão no Supabase.
- **Setup do app Meta** (webhook + subscription da página).
- **Cron** pg_cron.

IDs já confirmados pelos testes manuais no Graph API Explorer:

| Item | Valor |
|---|---|
| Ad Account da Focus | `act_1567349847850269` |
| Page ID Focus Fintax | `886052397927220` |
| Form ativo (FM - 02) | `2709775216044382` |
| Campanha ativa (LEADS) | `120241006716670344` |
| Supabase project ref | `klfpgpymgkfurylwpkrc` |

---

## 1. Arquitetura

```
                                     +---------------------+
   Meta Ads (Focus BM)               |  meta_credentials   |
                                     |  (1 linha c/ tokens)|
                                     +---------------------+
                                                |
                                                v
        (cron 1h)   +---------------------+
        meta-sync-insights -> meta_insights_daily
                    +---------------------+
                              |
        (cron diário)         |
        meta-sync-structure  -> meta_campaigns / meta_ad_sets /
                                meta_ads / meta_creatives /
                                meta_leadgen_forms

   Meta envia "leadgen"  ->  meta-webhook
   (webhook na hora)        (verifica assinatura,
                             busca o lead via API,
                             grava em meta_leads,
                             chama submit-lead-public
                             p/ entrar no funil)
                                  v
                            leads -> relatorios_leads
                            (CRM existente da Focus,
                             com calcular_diagnostico
                             já rodando)
                                  v
                            v_meta_lead_funnel
                            (view que cruza tudo p/ painel)
```

Princípio: **reusar `submit-lead-public`** que já existe na Focus. O webhook só normaliza o lead vindo da Meta e delega — quem qualifica, gera relatório e dispara o diagnóstico continua sendo o pipeline atual. Sem duplicação de regras de negócio.

---

## 2. Migration única — tabelas `meta_*`
Arquivo: `supabase/migrations/20260615120000_meta_integration.sql`

```sql
-- 1) Credenciais (1 linha; tudo o que liga a Focus à conta Meta)
CREATE TABLE public.meta_credentials (
  id              bigserial PRIMARY KEY,
  app_id          text NOT NULL,
  business_id     text,
  ad_account_id   text NOT NULL UNIQUE,                -- 'act_1567349847850269'
  page_id         text NOT NULL,                        -- '886052397927220'
  pixel_id        text,
  ig_business_account_id text,
  waba_id         text,
  webhook_verify_token text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_read ON public.meta_credentials FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pmo'));
CREATE POLICY mc_write ON public.meta_credentials FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) Campanhas
CREATE TABLE public.meta_campaigns (
  id              text PRIMARY KEY,
  ad_account_id   text NOT NULL,
  name            text,
  status          text,
  objective       text,
  daily_budget    numeric,
  lifetime_budget numeric,
  start_time      timestamptz,
  stop_time       timestamptz,
  created_time    timestamptz,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_meta_campaigns_acc ON public.meta_campaigns(ad_account_id);
ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc2_read ON public.meta_campaigns FOR SELECT USING (auth.uid() IS NOT NULL);

-- 3) Ad sets
CREATE TABLE public.meta_ad_sets (
  id              text PRIMARY KEY,
  campaign_id     text REFERENCES public.meta_campaigns(id),
  name            text,
  status          text,
  daily_budget    numeric,
  targeting       jsonb,
  start_time      timestamptz,
  end_time        timestamptz,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_ad_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY mas_read ON public.meta_ad_sets FOR SELECT USING (auth.uid() IS NOT NULL);

-- 4) Criativos
CREATE TABLE public.meta_creatives (
  id              text PRIMARY KEY,
  name            text,
  title           text,
  body            text,
  thumbnail_url   text,
  image_url       text,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcr_read ON public.meta_creatives FOR SELECT USING (auth.uid() IS NOT NULL);

-- 5) Ads
CREATE TABLE public.meta_ads (
  id              text PRIMARY KEY,
  campaign_id     text REFERENCES public.meta_campaigns(id),
  ad_set_id       text REFERENCES public.meta_ad_sets(id),
  creative_id     text REFERENCES public.meta_creatives(id),
  name            text,
  status          text,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ma_read ON public.meta_ads FOR SELECT USING (auth.uid() IS NOT NULL);

-- 6) Formulários de leadgen
CREATE TABLE public.meta_leadgen_forms (
  id              text PRIMARY KEY,
  page_id         text NOT NULL,
  name            text,
  status          text,
  leads_count     int,
  questions       jsonb,
  created_time    timestamptz,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_leadgen_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY mlf_read ON public.meta_leadgen_forms FOR SELECT USING (auth.uid() IS NOT NULL);

-- 7) Insights diários
CREATE TABLE public.meta_insights_daily (
  id              bigserial PRIMARY KEY,
  level           text NOT NULL CHECK (level IN ('account','campaign','adset','ad')),
  object_id       text NOT NULL,
  date            date NOT NULL,
  spend           numeric,
  impressions     bigint,
  reach           bigint,
  frequency       numeric,
  clicks          bigint,
  link_clicks     bigint,
  ctr             numeric,
  cpc             numeric,
  cpm             numeric,
  leads           bigint,
  cost_per_lead   numeric,
  actions         jsonb,
  cost_per_action_type jsonb,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, object_id, date)
);
CREATE INDEX ix_mid_date ON public.meta_insights_daily(date DESC);
ALTER TABLE public.meta_insights_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY mid_read ON public.meta_insights_daily FOR SELECT USING (auth.uid() IS NOT NULL);

-- 8) Leads do Meta (PII!) — RLS estrita
CREATE TABLE public.meta_leads (
  id              text PRIMARY KEY,                      -- leadgen_id do Meta
  form_id         text REFERENCES public.meta_leadgen_forms(id),
  ad_id           text,
  campaign_id     text,
  page_id         text NOT NULL,
  created_time    timestamptz,
  field_data      jsonb NOT NULL,                        -- payload bruto, mantido p/ auditoria
  -- desnormalizado p/ busca rápida
  email           text,
  phone           text,
  cnpj            text,
  razao_social    text,
  nome            text,
  segmento        text,
  regime_tributacao text,
  faturamento_faixa text,
  faturamento_estimado numeric,
  ja_fez_compensacao boolean,
  -- ligação com o CRM da Focus
  crm_lead_id     uuid,                                  -- FK -> leads(id) da Focus
  processed_at    timestamptz,
  error_text      text,
  raw             jsonb,
  inserted_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ml_email ON public.meta_leads(email);
CREATE INDEX ix_ml_cnpj  ON public.meta_leads(cnpj);
ALTER TABLE public.meta_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ml_read ON public.meta_leads FOR SELECT
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'pmo')
      OR public.has_role(auth.uid(),'comercial'));
-- escrita só via service role (edge function); nenhuma policy de INSERT/UPDATE p/ usuário comum

-- 9) Log de execução das edge functions
CREATE TABLE public.meta_execution_log (
  id              bigserial PRIMARY KEY,
  function_name   text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  ok              boolean,
  rows_affected   int,
  error_text      text,
  context         jsonb
);
ALTER TABLE public.meta_execution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY mel_read ON public.meta_execution_log FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pmo'));
```

> Se o enum `app_role` da Focus ainda tem o drift entre as duas migrations (visto na auditoria), confirma antes de aplicar — as policies acima dependem dos valores `admin`, `pmo`, `comercial`.

### View que cruza com o CRM da Focus

```sql
CREATE OR REPLACE VIEW public.v_meta_lead_funnel AS
SELECT
  ml.id                   AS meta_lead_id,
  ml.created_time         AS lead_at,
  ml.email,
  ml.phone,
  ml.nome,
  ml.cnpj,
  ml.razao_social,
  ml.segmento,
  ml.regime_tributacao,
  ml.faturamento_faixa,
  ml.faturamento_estimado,
  ml.ja_fez_compensacao,
  mc.id                   AS campaign_id,
  mc.name                 AS campaign_name,
  mc.objective,
  ma.id                   AS ad_id,
  ma.name                 AS ad_name,
  mf.name                 AS form_name,
  l.id                    AS crm_lead_id,
  l.status                AS crm_status,
  l.created_at            AS crm_lead_at,
  rl.id                   AS relatorio_id,
  rl.recuperacao_estimada AS valor_estimado,
  cli.id                  AS cliente_id
FROM public.meta_leads ml
LEFT JOIN public.meta_campaigns      mc  ON mc.id  = ml.campaign_id
LEFT JOIN public.meta_ads            ma  ON ma.id  = ml.ad_id
LEFT JOIN public.meta_leadgen_forms  mf  ON mf.id  = ml.form_id
LEFT JOIN public.leads               l   ON l.id   = ml.crm_lead_id
LEFT JOIN public.relatorios_leads    rl  ON rl.lead_id = l.id
LEFT JOIN public.clientes            cli ON cli.lead_id = l.id;
```

> Ajusta os nomes de coluna conforme o schema real da Focus (`leads.status` vs `leads.stage`, `relatorios_leads.recuperacao_estimada` vs nome correto). O esqueleto está aí.

---

## 3. Secrets no Supabase (Edge Function secrets)

Em `Supabase Dashboard → Edge Functions → Manage secrets`:

```
META_APP_ID                = 1024795040390999
META_APP_SECRET            = <do app, em Configurações Básicas>
META_SYSTEM_USER_TOKEN     = <gerado no BM da Focus — Seção 9 abaixo>
META_AD_ACCOUNT_ID         = act_1567349847850269
META_PAGE_ID               = 886052397927220
META_WEBHOOK_VERIFY_TOKEN  = focus_meta_wh_<string aleatória>
META_PIXEL_ID              = <se houver>
META_GRAPH_VERSION         = v25.0
```

E semeia a `meta_credentials`:

```sql
INSERT INTO public.meta_credentials
  (app_id, ad_account_id, page_id, webhook_verify_token, active)
VALUES
  ('1024795040390999', 'act_1567349847850269', '886052397927220',
   '<mesmo valor de META_WEBHOOK_VERIFY_TOKEN>', true);
```

---

## 4. Edge Function — `meta-webhook`

Config: `supabase/functions/meta-webhook/config.toml`

```toml
verify_jwt = false   # Meta chama o webhook sem JWT
```

Arquivo: `supabase/functions/meta-webhook/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN  = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;
const APP_SECRET    = Deno.env.get("META_APP_SECRET")!;
const SYS_TOKEN     = Deno.env.get("META_SYSTEM_USER_TOKEN")!;
const GRAPH         = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Mediana das faixas do form FM - 02 (ajuste se o form mudar)
const FATURAMENTO_MAP: Record<string, number> = {
  "r$_700_mil_–_r$_1_milhão":    850_000,
  "r$_1_milhão_–_r$_3_milhões": 2_000_000,
  "r$_3_milhões_–_r$_5_milhões": 4_000_000,
  "acima_de_r$_5_milhões":       7_500_000,
};

function pick(field_data: any[], name: string): string | undefined {
  return field_data?.find((f) => f.name === name)?.values?.[0];
}

async function verifySignature(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("x-hub-signature-256");
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sig === `sha256=${hex}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1) Verificação inicial do webhook (GET)
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  // 2) Recebimento de eventos (POST)
  const body = await req.text();
  if (!(await verifySignature(req, body))) {
    return new Response("bad signature", { status: 401 });
  }

  const payload = JSON.parse(body);
  const exec = await supabase.from("meta_execution_log")
    .insert({ function_name: "meta-webhook", context: payload }).select().single();

  let processed = 0;
  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const v = change.value;

        // 2.1) Busca o lead completo via Graph API
        const r = await fetch(
          `${GRAPH}/${v.leadgen_id}?fields=created_time,field_data,ad_id,form_id,campaign_id` +
          `&access_token=${SYS_TOKEN}`,
        );
        const lead = await r.json();
        if (lead.error) throw new Error(JSON.stringify(lead.error));

        const fd = lead.field_data ?? [];
        const email   = pick(fd, "email");
        const phone   = pick(fd, "phone_number");
        const cnpj    = (pick(fd, "cnpj") ?? "").replace(/\D/g, "");
        const razao   = pick(fd, "razão_social_da_empresa");
        const nome    = pick(fd, "nome_do_dono/seu_nome");
        const seg     = pick(fd, "segmento_da_empresa");
        const reg     = pick(fd, "regime_de_tributação");
        const faixa   = pick(fd, "faturamento_mensal_da_empresa");
        const fatNum  = FATURAMENTO_MAP[faixa ?? ""] ?? null;
        const jaFez   = ["sim", "yes", "true"].includes(
          (pick(fd, "você_faz_ou_já_fez_compensação_tributária?_") ?? "").toLowerCase()
        );

        // 2.2) Grava em meta_leads (raw + desnormalizado)
        await supabase.from("meta_leads").upsert({
          id: lead.id,
          form_id: lead.form_id ?? v.form_id,
          ad_id: lead.ad_id ?? v.ad_id ?? null,
          campaign_id: v.campaign_id ?? null,
          page_id: v.page_id ?? entry.id,
          created_time: lead.created_time,
          field_data: fd,
          email, phone, cnpj, razao_social: razao, nome,
          segmento: seg, regime_tributacao: reg,
          faturamento_faixa: faixa, faturamento_estimado: fatNum,
          ja_fez_compensacao: jaFez,
          raw: lead,
        }, { onConflict: "id" });

        // 2.3) Delega ao submit-lead-public (mesmo pipeline da LP)
        const { data: submitResp, error: submitErr } = await supabase.functions.invoke(
          "submit-lead-public",
          { body: {
            origem: "meta_ads",
            nome, email, telefone: phone, cnpj,
            razao_social: razao,
            segmento: seg, regime: reg,
            faturamento_mensal_estimado: fatNum ?? 1_000_000,
            ja_fez_compensacao: jaFez,
            meta_lead_id: lead.id,
            meta_form_id: lead.form_id ?? v.form_id,
            meta_campaign_id: v.campaign_id,
            meta_ad_id: v.ad_id,
          }},
        );

        // 2.4) Vincula o crm_lead_id criado
        const crmLeadId = (submitResp as any)?.lead_id ?? null;
        await supabase.from("meta_leads").update({
          crm_lead_id: crmLeadId,
          processed_at: new Date().toISOString(),
          error_text: submitErr ? String(submitErr) : null,
        }).eq("id", lead.id);

        processed++;
      }
    }

    await supabase.from("meta_execution_log").update({
      finished_at: new Date().toISOString(), ok: true, rows_affected: processed,
    }).eq("id", exec.data?.id);

    return new Response("ok", { status: 200 });
  } catch (e) {
    await supabase.from("meta_execution_log").update({
      finished_at: new Date().toISOString(), ok: false, error_text: String(e),
    }).eq("id", exec.data?.id);
    // Responder 200 mesmo em erro evita Meta repetir indefinidamente
    return new Response("ok-with-error", { status: 200 });
  }
});
```

> A `submit-lead-public` precisa aceitar os novos campos `origem`, `meta_lead_id`, `meta_form_id`, `meta_campaign_id`, `meta_ad_id` (não rejeitar) e devolver `lead_id` na resposta. Pequeno ajuste na edge function existente.

---

## 5. Edge Function — `meta-sync-structure` (diária)

Arquivo: `supabase/functions/meta-sync-structure/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const SYS_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN")!;
const GRAPH     = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function pagedFetch(url: string): Promise<any[]> {
  const all: any[] = [];
  let next: string | null = url;
  while (next) {
    const r = await fetch(next);
    const j = await r.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    all.push(...(j.data ?? []));
    next = j.paging?.next ?? null;
  }
  return all;
}

Deno.serve(async () => {
  const exec = await sb.from("meta_execution_log")
    .insert({ function_name: "meta-sync-structure" }).select().single();

  try {
    const { data: creds } = await sb.from("meta_credentials").select("*").eq("active", true);
    if (!creds?.length) throw new Error("no credentials");

    const totals = { campaigns: 0, ad_sets: 0, ads: 0, creatives: 0, forms: 0 };

    for (const c of creds) {
      const base = `${GRAPH}/${c.ad_account_id}`;
      const tk   = `&access_token=${SYS_TOKEN}`;

      // Campanhas
      for (const x of await pagedFetch(
        `${base}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time&limit=200${tk}`,
      )) {
        await sb.from("meta_campaigns").upsert({
          id: x.id, ad_account_id: c.ad_account_id, name: x.name, status: x.status,
          objective: x.objective,
          daily_budget:    x.daily_budget    ? Number(x.daily_budget)/100    : null,
          lifetime_budget: x.lifetime_budget ? Number(x.lifetime_budget)/100 : null,
          start_time: x.start_time, stop_time: x.stop_time, created_time: x.created_time,
          raw: x, synced_at: new Date().toISOString(),
        });
        totals.campaigns++;
      }

      // Ad sets
      for (const x of await pagedFetch(
        `${base}/adsets?fields=name,status,campaign_id,daily_budget,targeting,start_time,end_time&limit=200${tk}`,
      )) {
        await sb.from("meta_ad_sets").upsert({
          id: x.id, campaign_id: x.campaign_id, name: x.name, status: x.status,
          daily_budget: x.daily_budget ? Number(x.daily_budget)/100 : null,
          targeting: x.targeting, start_time: x.start_time, end_time: x.end_time,
          raw: x, synced_at: new Date().toISOString(),
        });
        totals.ad_sets++;
      }

      // Ads
      for (const x of await pagedFetch(
        `${base}/ads?fields=name,status,adset_id,campaign_id,creative&limit=500${tk}`,
      )) {
        await sb.from("meta_ads").upsert({
          id: x.id, campaign_id: x.campaign_id, ad_set_id: x.adset_id,
          creative_id: x.creative?.id ?? null, name: x.name, status: x.status,
          raw: x, synced_at: new Date().toISOString(),
        });
        totals.ads++;
      }

      // Criativos
      for (const x of await pagedFetch(
        `${base}/adcreatives?fields=name,title,body,thumbnail_url,image_url&limit=500${tk}`,
      )) {
        await sb.from("meta_creatives").upsert({
          id: x.id, name: x.name, title: x.title, body: x.body,
          thumbnail_url: x.thumbnail_url, image_url: x.image_url,
          raw: x, synced_at: new Date().toISOString(),
        });
        totals.creatives++;
      }

      // Lead forms (page-level)
      for (const x of await pagedFetch(
        `${GRAPH}/${c.page_id}/leadgen_forms?fields=name,status,leads_count,questions,created_time&limit=200${tk}`,
      )) {
        await sb.from("meta_leadgen_forms").upsert({
          id: x.id, page_id: c.page_id, name: x.name, status: x.status,
          leads_count: x.leads_count, questions: x.questions,
          created_time: x.created_time, raw: x, synced_at: new Date().toISOString(),
        });
        totals.forms++;
      }
    }

    const totalRows = Object.values(totals).reduce((s, n) => s + n, 0);
    await sb.from("meta_execution_log").update({
      finished_at: new Date().toISOString(), ok: true, rows_affected: totalRows, context: totals,
    }).eq("id", exec.data?.id);

    return new Response(JSON.stringify({ ok: true, ...totals }), { status: 200 });
  } catch (e) {
    await sb.from("meta_execution_log").update({
      finished_at: new Date().toISOString(), ok: false, error_text: String(e),
    }).eq("id", exec.data?.id);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
```

---

## 6. Edge Function — `meta-sync-insights` (horária)

Arquivo: `supabase/functions/meta-sync-insights/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const SYS_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN")!;
const GRAPH     = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const FIELDS = [
  "campaign_id","campaign_name","adset_id","adset_name","ad_id","ad_name",
  "spend","impressions","reach","frequency","clicks","inline_link_clicks",
  "ctr","cpc","cpm","actions","cost_per_action_type",
].join(",");

const LEAD_TYPES = new Set(["lead", "onsite_conversion.lead_grouped"]);
const num = (v: any) => (v == null ? null : Number(v));

function pickLeadAction(arr: any[]): number | null {
  const f = arr?.find((a) => LEAD_TYPES.has(a.action_type));
  return f ? Number(f.value) : null;
}

Deno.serve(async () => {
  const exec = await sb.from("meta_execution_log")
    .insert({ function_name: "meta-sync-insights" }).select().single();

  try {
    const { data: creds } = await sb.from("meta_credentials").select("*").eq("active", true);
    if (!creds?.length) throw new Error("no credentials");

    let inserted = 0;
    for (const c of creds) {
      // janela rolante de 3 dias (cobre delays de atribuição da Meta)
      const url = `${GRAPH}/${c.ad_account_id}/insights?level=ad&time_increment=1` +
                  `&date_preset=last_3d&fields=${FIELDS}&limit=500&access_token=${SYS_TOKEN}`;
      let next: string | null = url;
      while (next) {
        const r = await fetch(next);
        const j = await r.json();
        if (j.error) throw new Error(JSON.stringify(j.error));
        for (const row of j.data ?? []) {
          await sb.from("meta_insights_daily").upsert({
            level: "ad", object_id: row.ad_id, date: row.date_start,
            spend: num(row.spend), impressions: num(row.impressions),
            reach: num(row.reach), frequency: num(row.frequency),
            clicks: num(row.clicks), link_clicks: num(row.inline_link_clicks),
            ctr: num(row.ctr), cpc: num(row.cpc), cpm: num(row.cpm),
            leads: pickLeadAction(row.actions ?? []),
            cost_per_lead: pickLeadAction(row.cost_per_action_type ?? []),
            actions: row.actions, cost_per_action_type: row.cost_per_action_type,
            raw: row,
          }, { onConflict: "level,object_id,date" });
          inserted++;
        }
        next = j.paging?.next ?? null;
      }
    }

    await sb.from("meta_execution_log").update({
      finished_at: new Date().toISOString(), ok: true, rows_affected: inserted,
    }).eq("id", exec.data?.id);

    return new Response(JSON.stringify({ ok: true, inserted }), { status: 200 });
  } catch (e) {
    await sb.from("meta_execution_log").update({
      finished_at: new Date().toISOString(), ok: false, error_text: String(e),
    }).eq("id", exec.data?.id);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
```

---

## 7. Cron (pg_cron)

Roda no SQL Editor do Supabase da Focus depois que `pg_cron` e `pg_net` estiverem habilitados (Database → Extensions). Substitui `<SERVICE_ROLE_KEY>` pela service role key:

```sql
SELECT cron.schedule(
  'meta-sync-structure-daily',
  '0 4 * * *',
  $$ SELECT net.http_post(
       url := 'https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-sync-structure',
       headers := jsonb_build_object(
         'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
         'Content-Type', 'application/json'
       )
     ); $$
);

SELECT cron.schedule(
  'meta-sync-insights-hourly',
  '5 * * * *',
  $$ SELECT net.http_post(
       url := 'https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-sync-insights',
       headers := jsonb_build_object(
         'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
         'Content-Type', 'application/json'
       )
     ); $$
);
```

---

## 8. Configurar webhook no app Meta da Focus

1. **App Meta da Focus → Produtos → Adicionar produto → Webhooks**.
2. **Objeto: Page**.
3. **Callback URL:**
   ```
   https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-webhook
   ```
4. **Verify Token:** o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`.
5. **Subscribe to fields:** `leadgen` (mínimo). Adicione `messages` se for usar Page DMs futuramente.
6. Clica **Verify and Save** — o Meta vai bater no endpoint com `hub.mode=subscribe`; a edge function responde o `challenge`.
7. **Assinar a página da Focus ao app** — no Graph API Explorer (mesmo padrão de antes, Page Token):
   ```
   POST /886052397927220/subscribed_apps?subscribed_fields=leadgen
   ```

A partir daí, todo lead novo no `FM - 02` cai em `meta_leads` em segundos, é desnormalizado, passa pelo `submit-lead-public`, vira `leads` no CRM, gera `relatorios_leads` e dispara o diagnóstico — sem ninguém clicar em nada.

---

## 9. System User Token (produção)

Pra deixar definitivo (não depender do seu token pessoal de 60 dias):

1. **business.facebook.com → Configurações da Empresa → Usuários → Usuários do sistema → Adicionar.**
2. Nome: `IAplicada-Focus-Integration` · Função: **Admin do sistema**.
3. Adicionar ativos:
   - **Apps:** o app da Focus → permissão **"Gerenciar app"**.
   - **Contas de Anúncios:** `act_1567349847850269` → **"Gerenciar conta"**.
   - **Páginas:** Focus Fintax → **"Criar conteúdo, mensagens, anúncios e mais"**.
4. **Gerar novo token** → marca:
   `ads_read`, `ads_management`, `business_management`, `pages_read_engagement`, `pages_show_list`, `pages_manage_ads`, `pages_manage_metadata`, `leads_retrieval`, `read_insights`.
5. Expiração: **"Nunca"**.
6. Cola no secret `META_SYSTEM_USER_TOKEN`.

---

## 10. Ordem de implantação (checklist)

1. Rodar a **migration** da Seção 2.
2. Subir **secrets** da Seção 3.
3. Seed da `meta_credentials`.
4. Deploy das 3 **edge functions** (Seções 4, 5, 6).
5. Configurar **cron** (Seção 7).
6. Rodar **`meta-sync-structure`** manualmente uma vez (botão "Invoke" no Supabase) — confere as 13 campanhas / 20 ad sets / 170 ads aparecendo em `meta_campaigns` etc.
7. Rodar **`meta-sync-insights`** manualmente — confere `meta_insights_daily` populando.
8. Configurar **webhook** no Meta app (Seção 8).
9. POST de **`subscribed_apps`** na página da Focus.
10. Disparar **lead de teste** no `FM - 02` e conferir o caminho completo:
    `meta_leads` → `submit-lead-public` → `leads` → `relatorios_leads`.
11. Trocar o token de teste pelo **System User token** definitivo (Seção 9).
12. Construir o **painel** consumindo `v_meta_lead_funnel` e `meta_insights_daily`.

---

## 11. Próximos incrementos (não-bloqueantes)

- **Conversions API server-side**: enviar evento `Lead` do `submit-lead-public` direto para `/v25.0/{PIXEL_ID}/events` — recupera atribuição quando iOS bloqueia o pixel.
- **Audiências customizadas**: criar via API a partir do `clientes` (lookalike de quem fechou contrato).
- **`meta-budget-guardrail`**: edge function que alerta quando CPL > limite (hoje R$ 124, pode parametrizar).
- **Conexão de criativos da IAplicada** (5/semana, padrão `mads_creatives` do CRMIAplicada): upload via `/{ad-account}/adimages` + `/adcreatives`.
- **Painel multitenant**: se outros clientes IAplicada quiserem o mesmo módulo, `meta_credentials` já é plural (`active=true` por cliente).

---

Pacote preparado a partir dos 3 testes manuais que rodamos no Graph API Explorer (campanhas, performance e leadgen), do padrão `mads_*` do CRMIAplicada e do schema atual da Focus (`leads`, `relatorios_leads`, `clientes`, `calcular_diagnostico`, `submit-lead-public`). Tudo é colável direto no Lovable/Supabase da Focus.
