// supabase/functions/meta-sync-insights/index.ts
// Sync horário de performance (insights) por ad, com janela rolante de 3 dias
// para cobrir delays de atribuição da Meta → meta_insights_daily.
import { createClient } from "npm:@supabase/supabase-js@2";

const SYS_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN")!;
const GRAPH     = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;

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
    const { data: creds } = await sb.from("meta_credentials").select("*").eq("active", true);
    if (!creds?.length) throw new Error("no active meta_credentials row");

    let inserted = 0;

    for (const c of creds) {
      const baseUrl =
        `${GRAPH}/${c.ad_account_id}/insights?level=ad&time_increment=1` +
        `&date_preset=last_3d&fields=${FIELDS}&limit=500&access_token=${SYS_TOKEN}`;

      let next: string | null = baseUrl;
      while (next) {
        const r = await fetch(next);
        const j = await r.json();
        if (j.error) throw new Error(JSON.stringify(j.error));

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
    }

    await sb
      .from("meta_execution_log")
      .update({
        finished_at: new Date().toISOString(),
        ok: true,
        rows_affected: inserted,
      })
      .eq("id", exec.data?.id);

    return new Response(JSON.stringify({ ok: true, inserted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
