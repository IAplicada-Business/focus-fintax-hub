// supabase/functions/meta-sync-structure/index.ts
// Sync diário da estrutura do Meta Ads: campanhas, ad sets, ads, criativos
// e formulários de leadgen → tabelas meta_*.
//
// Hardening (Jul/2026):
//   - Secret renomeado META_SYSTEM_USER_TOKEN → META_ACCESS_TOKEN
//     (aceita ambos durante transição, fallback pro nome antigo)
//   - Erros isolados por conta (try/catch por conta, não throw global)
//   - Retry com backoff em rate limits (via _shared/meta-fetch)
//   - Status HTTP: 200 (tudo OK) / 207 (parcial) / 500 (todas falharam ou
//     erro fora do loop de contas)

import { createClient } from "npm:@supabase/supabase-js@2";
import { pagedFetchWithRetry } from "../_shared/meta-fetch.ts";

// Aceita nome novo ou antigo do secret (transição sem downtime)
const ACCESS_TOKEN =
  Deno.env.get("META_ACCESS_TOKEN") ??
  Deno.env.get("META_SYSTEM_USER_TOKEN") ??
  "";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  const exec = await sb
    .from("meta_execution_log")
    .insert({ function_name: "meta-sync-structure" })
    .select()
    .single();

  try {
    if (!ACCESS_TOKEN) {
      throw new Error("META_ACCESS_TOKEN (or legacy META_SYSTEM_USER_TOKEN) não configurado");
    }

    const { data: creds } = await sb.from("meta_credentials").select("*").eq("active", true);
    if (!creds?.length) throw new Error("no active meta_credentials row");

    const totals = { campaigns: 0, ad_sets: 0, ads: 0, creatives: 0, forms: 0 };
    const failedAccounts: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const c of creds) {
      // Isola cada conta: erro numa conta não interrompe as outras
      try {
        const base = `${GRAPH}/${c.ad_account_id}`;
        const tk = `&access_token=${ACCESS_TOKEN}`;

        // Campanhas
        for (const x of await pagedFetchWithRetry(
          `${base}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time&limit=200${tk}`,
        )) {
          await sb.from("meta_campaigns").upsert({
            id: x.id,
            ad_account_id: c.ad_account_id,
            name: x.name,
            status: x.status,
            objective: x.objective,
            daily_budget:    x.daily_budget    ? Number(x.daily_budget) / 100    : null,
            lifetime_budget: x.lifetime_budget ? Number(x.lifetime_budget) / 100 : null,
            start_time: x.start_time,
            stop_time: x.stop_time,
            created_time: x.created_time,
            raw: x,
            synced_at: new Date().toISOString(),
          });
          totals.campaigns++;
        }

        // Ad sets
        for (const x of await pagedFetchWithRetry(
          `${base}/adsets?fields=name,status,campaign_id,daily_budget,targeting,start_time,end_time&limit=200${tk}`,
        )) {
          await sb.from("meta_ad_sets").upsert({
            id: x.id,
            campaign_id: x.campaign_id,
            name: x.name,
            status: x.status,
            daily_budget: x.daily_budget ? Number(x.daily_budget) / 100 : null,
            targeting: x.targeting,
            start_time: x.start_time,
            end_time: x.end_time,
            raw: x,
            synced_at: new Date().toISOString(),
          });
          totals.ad_sets++;
        }

        // Ads
        for (const x of await pagedFetchWithRetry(
          `${base}/ads?fields=name,status,adset_id,campaign_id,creative&limit=500${tk}`,
        )) {
          await sb.from("meta_ads").upsert({
            id: x.id,
            campaign_id: x.campaign_id,
            ad_set_id: x.adset_id,
            creative_id: x.creative?.id ?? null,
            name: x.name,
            status: x.status,
            raw: x,
            synced_at: new Date().toISOString(),
          });
          totals.ads++;
        }

        // Criativos
        for (const x of await pagedFetchWithRetry(
          `${base}/adcreatives?fields=name,title,body,thumbnail_url,image_url&limit=500${tk}`,
        )) {
          await sb.from("meta_creatives").upsert({
            id: x.id,
            name: x.name,
            title: x.title,
            body: x.body,
            thumbnail_url: x.thumbnail_url,
            image_url: x.image_url,
            raw: x,
            synced_at: new Date().toISOString(),
          });
          totals.creatives++;
        }

        // Lead forms (page-level)
        for (const x of await pagedFetchWithRetry(
          `${GRAPH}/${c.page_id}/leadgen_forms?fields=name,status,leads_count,questions,created_time&limit=200${tk}`,
        )) {
          await sb.from("meta_leadgen_forms").upsert({
            id: x.id,
            page_id: c.page_id,
            name: x.name,
            status: x.status,
            leads_count: x.leads_count,
            questions: x.questions,
            created_time: x.created_time,
            raw: x,
            synced_at: new Date().toISOString(),
          });
          totals.forms++;
        }

        successCount++;
      } catch (accountErr) {
        console.error(`meta-sync-structure conta ${c.ad_account_id} falhou:`, accountErr);
        errorCount++;
        failedAccounts.push(c.ad_account_id);
        // Loga UMA LINHA por conta que falhou pra debug
        await sb.from("meta_execution_log").insert({
          function_name: "meta-sync-structure",
          finished_at: new Date().toISOString(),
          ok: false,
          ad_account_id: c.ad_account_id,
          error_text: `conta ${c.ad_account_id} falhou: ${accountErr instanceof Error ? accountErr.message : String(accountErr)}`,
        });
        // NÃO throw — segue pra próxima conta
      }
    }

    const totalRows = Object.values(totals).reduce((s, n) => s + n, 0);
    const allOk = errorCount === 0;
    await sb
      .from("meta_execution_log")
      .update({
        finished_at: new Date().toISOString(),
        ok: allOk,
        rows_affected: totalRows,
        success_count: successCount,
        error_count: errorCount,
        failed_accounts: failedAccounts,
        context: totals,
      })
      .eq("id", exec.data?.id);

    return new Response(
      JSON.stringify({
        ok: allOk,
        ...totals,
        success_count: successCount,
        error_count: errorCount,
        failed_accounts: failedAccounts,
      }),
      {
        // 200 se tudo OK, 207 se algumas falharam mas outras processaram, 500 se todas
        status: allOk ? 200 : (successCount > 0 ? 207 : 500),
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    await sb
      .from("meta_execution_log")
      .update({
        finished_at: new Date().toISOString(),
        ok: false,
        error_text: String(e),
      })
      .eq("id", exec.data?.id);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
