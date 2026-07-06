// supabase/functions/meta-sync-insights/index.ts
// Sync horário de performance (insights) por ad, com janela rolante de 3 dias
// para cobrir delays de atribuição da Meta → meta_insights_daily.
//
// Hardening (Jul/2026):
//   - Secret renomeado META_SYSTEM_USER_TOKEN → META_ACCESS_TOKEN (fallback)
//   - Erros isolados por conta
//   - Retry com backoff em rate limits (_shared/meta-fetch)
//   - HTTP: 200 / 207 / 500

import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/meta-fetch.ts";

const ACCESS_TOKEN =
  Deno.env.get("META_ACCESS_TOKEN") ??
  Deno.env.get("META_SYSTEM_USER_TOKEN") ??
  "";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FIELDS = [
  "campaign_id", "campaign_name",
  "adset_id", "adset_name",
  "ad_id", "ad_name",
  "spend", "impressions", "reach", "frequency",
  "clicks", "inline_link_clicks",
  "ctr", "cpc", "cpm",
  "actions", "cost_per_action_type",
].join(",");

const LEAD_TYPES = new Set(["lead", "onsite_conversion.lead_grouped"]);

const num = (v: any): number | null => (v == null ? null : Number(v));

function pickLeadAction(arr: any[]): number | null {
  const f = arr?.find((a) => LEAD_TYPES.has(a.action_type));
  return f ? Number(f.value) : null;
}

Deno.serve(async () => {
  const exec = await sb
    .from("meta_execution_log")
    .insert({ function_name: "meta-sync-insights" })
    .select()
    .single();

  try {
    if (!ACCESS_TOKEN) {
      throw new Error("META_ACCESS_TOKEN (or legacy META_SYSTEM_USER_TOKEN) não configurado");
    }

    const { data: creds } = await sb.from("meta_credentials").select("*").eq("active", true);
    if (!creds?.length) throw new Error("no active meta_credentials row");

    let inserted = 0;
    let successCount = 0;
    let errorCount = 0;
    const failedAccounts: string[] = [];

    for (const c of creds) {
      // Isola cada conta: erro numa conta não interrompe as outras
      try {
        const baseUrl =
          `${GRAPH}/${c.ad_account_id}/insights?level=ad&time_increment=1` +
          `&date_preset=last_3d&fields=${FIELDS}&limit=500&access_token=${ACCESS_TOKEN}`;

        let next: string | null = baseUrl;
        while (next) {
          const j = await fetchWithRetry(next);

          for (const row of j.data ?? []) {
            await sb.from("meta_insights_daily").upsert(
              {
                level: "ad",
                object_id: row.ad_id,
                date: row.date_start,
                spend: num(row.spend),
                impressions: num(row.impressions),
                reach: num(row.reach),
                frequency: num(row.frequency),
                clicks: num(row.clicks),
                link_clicks: num(row.inline_link_clicks),
                ctr: num(row.ctr),
                cpc: num(row.cpc),
                cpm: num(row.cpm),
                leads: pickLeadAction(row.actions ?? []),
                cost_per_lead: pickLeadAction(row.cost_per_action_type ?? []),
                actions: row.actions,
                cost_per_action_type: row.cost_per_action_type,
                raw: row,
              },
              { onConflict: "level,object_id,date" },
            );
            inserted++;
          }

          next = j.paging?.next ?? null;
        }

        successCount++;
      } catch (accountErr) {
        console.error(`meta-sync-insights conta ${c.ad_account_id} falhou:`, accountErr);
        errorCount++;
        failedAccounts.push(c.ad_account_id);
        await sb.from("meta_execution_log").insert({
          function_name: "meta-sync-insights",
          finished_at: new Date().toISOString(),
          ok: false,
          ad_account_id: c.ad_account_id,
          error_text: `conta ${c.ad_account_id} falhou: ${accountErr instanceof Error ? accountErr.message : String(accountErr)}`,
        });
      }
    }

    const allOk = errorCount === 0;
    await sb
      .from("meta_execution_log")
      .update({
        finished_at: new Date().toISOString(),
        ok: allOk,
        rows_affected: inserted,
        success_count: successCount,
        error_count: errorCount,
        failed_accounts: failedAccounts,
      })
      .eq("id", exec.data?.id);

    return new Response(
      JSON.stringify({
        ok: allOk,
        inserted,
        success_count: successCount,
        error_count: errorCount,
        failed_accounts: failedAccounts,
      }),
      {
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
