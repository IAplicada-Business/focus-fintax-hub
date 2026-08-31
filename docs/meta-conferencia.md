# Conferência Meta · 31/08/2026

Projeto: `qzkqrhamqtchboxtwpnz` (focus-fintax-hub). Conta: `act_1567349847850269`. Page: `886052397927220`. App: `1024795040390999`. Pixel LP: `1689149135696577`.

## Por que o dashboard parou

A UI do overview **não chama a Graph API**. Ela só lê `meta_insights_daily` dos últimos 30 dias. Se a sync para, a tela parece “quebrada” (KPIs zerados / “sem dados”).

Linha do tempo no `meta_execution_log`:

1. **Até 05/07/2026** — insights gravados (10 linhas, 3 campanhas, 8 ads).
2. **06/07/2026** — token de usuário (Mariana) expirou. Logs: `Session has expired on Monday, 06-Jul-26`.
3. **21/07/2026** — sync ainda rodava, mas só falhava por token expirado.
4. **Após migração do projeto** — secret sumiu. Cron no projeto certo (`qzkqrhamqtchboxtwpnz`) chama as functions **de hora em hora** e todas falham com:
   `META_ACCESS_TOKEN (or legacy META_SYSTEM_USER_TOKEN) não configurado`.
5. **31/08/2026** — último insight no banco: **2026-07-05**. Overview 30d = vazio. `pixel_id` em `meta_credentials` = **null**.

O cron local está certo. O que falta é o **secret no Supabase do projeto novo**. Secrets de Edge Function não viajam na migração de banco.

## Secret que precisa voltar

No dashboard Supabase → Edge Functions → Secrets, cadastrar de novo (não dá para recuperar o valor antigo daqui):

| Secret | Função |
|---|---|
| `META_ACCESS_TOKEN` | Sync estrutura + insights + webhook (após o fallback) |
| `META_SYSTEM_USER_TOKEN` | Opcional se o webhook ainda não foi redeployado |
| `META_APP_SECRET` | Assinatura do webhook |
| `META_WEBHOOK_VERIFY_TOKEN` | Handshake GET (tem que ser o mesmo do app Meta) |
| `META_GRAPH_VERSION` | `v25.0` |
| `META_PIXEL_ID` | `1689149135696577` (hoje só na LP; CAPI ainda não existe) |

Token: **System User do BM**, expiração “nunca”, permissões `ads_read`, `read_insights`, `leads_retrieval`. User token de pessoa física volta a quebrar no prazo.

Depois: **Atualizar agora** em Marketing. Conferir `meta_execution_log.ok = true` e `max(date)` em `meta_insights_daily` = hoje.

Reativar a conta: `meta_credentials.active` já está `true`. O gargalo não é a flag.

## Conferência pixel × pipeline (corte 31/08/2026)

| Fonte | O que mede | Valor agora |
|---|---|---|
| Pixel LP (`fbq Lead`) | Submit da landing no browser | Sem tabela no banco. CAPI não implementada. |
| `meta_insights_daily.leads` | Conversão que o Ads Manager atribuiu ao anúncio | **1** no histórico; **0** nos últimos 30d (insights parados em 05/07) |
| `leads` com `origem = meta_ads` | Pipeline CRM | **52** (carga histórica 06/07); **0** nos últimos 30d |
| `meta_leads` (webhook) | Leadgen cru + vínculo `crm_lead_id` | **0 / 0** |

### Divergências de captura

1. **52 CRM vs 0 webhook** — os 52 vieram do backfill `20260706210000_import_meta_ads_leads_backfill.sql`, não do webhook. Por isso não existem em `meta_leads`.
2. **1 lead no insight vs 52 no CRM** — o insight só tem janela curta (12/06–05/07) e sync morta; o CRM tem carga CSV. Não dá para usar esse 1 vs 52 como “o pixel perdeu lead”.
3. **0 nos últimos 30 dias em todas as fontes** — anúncio/conta pode ter voltado, mas o Hub não puxa nada sem token. Pixel da LP continua disparando no browser; isso **não** entra no overview.
4. **iOS / bloqueio de cookie** — mesmo com sync ok, insight Meta pode ser maior que CRM (gente que converteu no pixel e não no form) ou o contrário (form no webhook sem evento pixel). Só mensurável depois da reativação.

## Depois de recolocar o token

1. Rodar sync manual (estrutura + insights).
2. Conferir overview: gasto/leads 30d > 0 se a conta estiver veiculando.
3. Gerar um lead de teste no form da Meta e ver linha nova em `meta_leads` **e** em `leads`.
4. Recarregar Marketing → card **Conferência**: insight 30d vs CRM 30d vs webhook 30d.
5. Preencher `meta_credentials.pixel_id` com `1689149135696577` quando for ligar CAPI.

CAPI (`POST /{PIXEL_ID}/events` no `submit-lead-public`) ainda não existe — é o próximo passo para fechar atribuição iOS.
