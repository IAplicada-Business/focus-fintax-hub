# Marketing/Meta — Guia de Implantação Focus FinTax

Ordem completa do que rodar para subir do zero o módulo Marketing com integração Meta Ads. Spec arquitetural em `Focus_Meta_Integration_Pack.md`.

---

## Pré-requisitos
- Acesso ao Lovable do projeto Focus FinTax
- Acesso ao SQL Editor do Lovable (já está dentro do projeto)
- App Meta criado no developers.facebook.com (App ID `1024795040390999`)
- Acesso admin ao Business Manager da Focus FinTax
- Page `Focus Fintax` (id `886052397927220`) e Ad Account `act_1567349847850269` administrados pelo mesmo BM

---

## 1) Schema + view
Executa no **SQL Editor** do Lovable:

```sql
-- Conteúdo completo de:
--   supabase/migrations/20260615120000_meta_integration.sql
-- (9 tabelas meta_* + view v_meta_lead_funnel)
```

Validação:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'meta_%'
ORDER BY table_name;
-- Esperado: meta_ad_sets, meta_ads, meta_campaigns, meta_creatives,
--           meta_credentials, meta_execution_log, meta_insights_daily,
--           meta_leadgen_forms, meta_leads
```

---

## 2) System User Token no Meta BM (gera o token de produção)
1. **business.facebook.com** → Configurações da Empresa → **Usuários do sistema** → **Adicionar**
   - Nome: `IAplicada-Focus-Integration`
   - Função: **Admin do sistema**
2. **Adicionar ativos** (3 abas):
   - **Apps**: app da Focus → **Gerenciar app**
   - **Contas de Anúncios**: `act_1567349847850269` → **Gerenciar conta**
   - **Páginas**: Focus Fintax → **Criar conteúdo, mensagens, anúncios e mais**
3. **Gerar novo token**:
   - App: o app da Focus
   - Expiração: **Nunca**
   - Permissões:
     - `ads_read`, `ads_management`, `business_management`
     - `pages_read_engagement`, `pages_show_list`, `pages_manage_ads`, `pages_manage_metadata`
     - **`leads_retrieval`** (crítico — sem isso o webhook não lê o lead)
     - `read_insights`
4. **Copia o token** (gigante, começa com `EAA...`) — vai aparecer só uma vez.

---

## 3) Edge Function Secrets
No Supabase do Lovable → **Edge Functions → Manage secrets** → adiciona:

| Nome | Valor |
|---|---|
| `META_APP_ID` | `1024795040390999` |
| `META_APP_SECRET` | App Meta → Configurações Básicas → App Secret |
| `META_SYSTEM_USER_TOKEN` | Token do passo 2 |
| `META_AD_ACCOUNT_ID` | `act_1567349847850269` |
| `META_PAGE_ID` | `886052397927220` |
| `META_WEBHOOK_VERIFY_TOKEN` | Gera ~32 chars aleatórios (`focus_meta_wh_XXX`) |
| `META_GRAPH_VERSION` | `v25.0` |
| `META_PIXEL_ID` | (opcional, só p/ CAPI futuramente) |

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem por padrão — **não setar manualmente**.

---

## 4) Seed da `meta_credentials`
SQL Editor:

```sql
INSERT INTO public.meta_credentials
  (app_id, ad_account_id, page_id, webhook_verify_token, active)
VALUES
  ('1024795040390999',
   'act_1567349847850269',
   '886052397927220',
   '<MESMO VALOR DE META_WEBHOOK_VERIFY_TOKEN>',
   true)
ON CONFLICT (ad_account_id) DO UPDATE SET
  webhook_verify_token = EXCLUDED.webhook_verify_token,
  active = true,
  updated_at = now();
```

---

## 5) Deploy das edge functions
Mergea o PR em `main`. O Lovable faz o auto-deploy quando detecta:
- `supabase/config.toml` com `[functions.meta-webhook]` etc (todos com `verify_jwt = false`)
- Arquivos em `supabase/functions/meta-webhook/`, `meta-sync-structure/`, `meta-sync-insights/`

Se o auto-deploy não disparar, **pede pro Lovable AI assistant explicitamente**:

> Deploye as edge functions meta-webhook, meta-sync-structure e meta-sync-insights que estão em supabase/functions/. Já estão registradas no config.toml.

Valida:
```sql
-- Dispara meta-sync-structure manualmente
SELECT net.http_post(
  url := 'https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-sync-structure',
  headers := jsonb_build_object('Content-Type', 'application/json')
);

-- Aguarda ~30s e confere
SELECT count(*) FROM public.meta_campaigns;
SELECT count(*) FROM public.meta_ads;
SELECT function_name, ok, rows_affected, error_text
FROM public.meta_execution_log ORDER BY id DESC LIMIT 3;
```

Repete pra `meta-sync-insights`.

---

## 6) Cron com pg_cron
**Habilita extensões** (Dashboard → Database → Extensions): `pg_cron`, `pg_net`.

Executa no SQL Editor:

```sql
SELECT cron.unschedule('meta-sync-structure-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-sync-structure-daily');
SELECT cron.unschedule('meta-sync-insights-hourly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-sync-insights-hourly');

-- Como as 3 functions usam verify_jwt=false, NÃO precisa de Authorization header
SELECT cron.schedule(
  'meta-sync-structure-daily',
  '0 4 * * *',
  $$ SELECT net.http_post(
       url := 'https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-sync-structure',
       headers := jsonb_build_object('Content-Type', 'application/json')
     ); $$
);

SELECT cron.schedule(
  'meta-sync-insights-hourly',
  '5 * * * *',
  $$ SELECT net.http_post(
       url := 'https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-sync-insights',
       headers := jsonb_build_object('Content-Type', 'application/json')
     ); $$
);

SELECT jobname, schedule, active FROM cron.job
WHERE jobname IN ('meta-sync-structure-daily', 'meta-sync-insights-hourly');
```

---

## 7) Configurar Webhook no app Meta
1. Meta Developers → seu app → **Produtos → Webhooks**
2. **Objeto: Page**
3. **Callback URL**: `https://klfpgpymgkfurylwpkrc.supabase.co/functions/v1/meta-webhook`
4. **Verify Token**: mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`
5. **Subscribe to fields**: `leadgen`
6. Clica **Verify and Save** → o Meta bate na função com `hub.challenge` e ela responde com o token. Se der ❌, confere se `META_WEBHOOK_VERIFY_TOKEN` no Supabase é exatamente o mesmo (sem espaços extras).
7. **Subscribe a página** ao app — no Graph API Explorer (Page Access Token da Focus):
   ```
   POST /886052397927220/subscribed_apps?subscribed_fields=leadgen
   ```

---

## 8) Teste end-to-end com lead real
1. Vai em **Meta Ads Manager → Lead Center → FM - 02** → botão **Preview** ou usa `https://developers.facebook.com/tools/lead-ads-testing/` pra disparar um lead de teste.
2. No SQL Editor:
   ```sql
   -- Tem que aparecer em segundos
   SELECT id, nome, email, cnpj, segmento, regime_tributacao,
          crm_lead_id, processed_at, error_text
   FROM public.meta_leads
   ORDER BY inserted_at DESC LIMIT 3;
   
   -- Confere se virou lead no CRM
   SELECT id, nome, empresa, origem, status, criado_em
   FROM public.leads
   WHERE origem = 'meta_ads'
   ORDER BY criado_em DESC LIMIT 3;
   
   -- Log de execução do webhook
   SELECT function_name, started_at, ok, rows_affected, error_text
   FROM public.meta_execution_log
   WHERE function_name = 'meta-webhook'
   ORDER BY id DESC LIMIT 3;
   ```
3. Navega no front em `/marketing/leads` — o lead deve aparecer em tempo real (realtime subscription ativa).

---

## 9) Frontend
Já deployado pelo Lovable junto com o merge do PR. Acessa:
- **Sidebar → Marketing** (icon Megaphone)
- 6 abas: Overview · Campanhas · Anúncios · Formulários · Leads (Meta) · Logs
- Visível pra `admin`, `pmo`, `comercial` (Logs só `admin` + `pmo`)
- Lead PII (email/phone) mascarado pra roles fora de admin/pmo/comercial

---

## Troubleshooting

### "Webhook signature inválida" (response 401 do meta-webhook)
- Causa: `META_APP_SECRET` no Supabase secrets ≠ App Secret do app no Meta
- Fix: regera o App Secret no painel do Meta, atualiza o secret no Supabase

### "(#100) Tried accessing nonexisting field 'leads_retrieval'" ou similar
- Causa: o System User Token não tem permissão `leads_retrieval`
- Fix: vai no BM → System User → **Gerar novo token** marcando `leads_retrieval` + atualiza `META_SYSTEM_USER_TOKEN`

### Cron disparou mas `meta_execution_log` vazio
- Verifica `net._http_response.status_code` — se for 404, a função não está deployada (volta ao passo 5)
- Se for 500, abre `error_text` da última linha de `meta_execution_log` (ou logs da edge function no Lovable)

### `pg_net` retorna timeout de 5000ms
- **É esperado**. O `pg_net` tem timeout default curto, mas a função roda até o fim no background. Confirma sucesso via `meta_execution_log.ok = true`.
- Se quiser eliminar o aviso: passar `timeout_milliseconds := 60000` no `net.http_post`.

### Lead chegou em `meta_leads` mas `crm_lead_id` ficou null
- Olha `error_text` da linha em `meta_leads`. Se for `blocked: simples`, é porque o `regime_tributacao` veio como Simples Nacional (bloqueio do `submit-lead-public`, esperado).
- Se for outro erro: chama `submit-lead-public` manualmente com o mesmo payload pra debug.

### Cron não dispara
- Confere `cron.job` (ativo + schedule certa)
- Confere `cron.job_run_details` — se a coluna `status` aparecer com "failed", olha `return_message`
- Verifica se `pg_cron` e `pg_net` estão habilitados (Database → Extensions)

### Tabelas vazias após sync
- Provavelmente o System User Token tem visibilidade limitada no BM
- Vai no BM → System User → **Adicionar ativos** → marca todas as campanhas/ad sets/pages que você quer ver

---

## Checklist consolidado
- [ ] Migration `20260615120000_meta_integration.sql` aplicada (9 tabelas + view)
- [ ] System User Token gerado com `leads_retrieval` + permissões
- [ ] 8 secrets configurados no Supabase
- [ ] `INSERT INTO meta_credentials` rodado
- [ ] PR mergeado → 3 edge functions auto-deployadas
- [ ] `meta-sync-structure` invocada manual, populou as tabelas
- [ ] `meta-sync-insights` invocada manual, populou `meta_insights_daily`
- [ ] `pg_cron` + `pg_net` habilitados; 2 jobs agendados e ativos
- [ ] Webhook no app Meta criado, `Verify and Save` passou
- [ ] `POST /:page_id/subscribed_apps?subscribed_fields=leadgen` retornou `success: true`
- [ ] Lead de teste no FM - 02 → caiu em `meta_leads` → virou `leads` → virou `relatorios_leads`
- [ ] Front `/marketing` acessível para admin/pmo/comercial
