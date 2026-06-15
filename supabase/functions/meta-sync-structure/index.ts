// supabase/functions/meta-sync-structure/index.ts
// Sync diário da estrutura do Meta Ads: campanhas, ad sets, ads, criativos
// e formulários de leadgen → tabelas meta_*.
import { createClient } from "npm:@supabase/supabase-js@2";

const SYS_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN")!;
const GRAPH     = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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
  const exec = await sb
    .from("meta_execution_log")
    .insert({ function_name: "meta-sync-structure" })
    .select()
    .single();

  try {
    const { data: creds } = await sb.from("meta_credentials").select("*").eq("active", true);
    if (!creds?.length) throw new Error("no active meta_credentials row");

    const totals = { campaigns: 0, ad_sets: 0, ads: 0, creatives: 0, forms: 0 };

    for (const c of creds) {
      const base = `${GRAPH}/${c.ad_account_id}`;
      const tk   = `&access_token=${SYS_TOKEN}`;

      // Campanhas
      for (const x of await pagedFetch(
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
      for (const x of await pagedFetch(
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
      for (const x of await pagedFetch(
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
      for (const x of await pagedFetch(
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
      for (const x of await pagedFetch(
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
    }

    const totalRows = Object.values(totals).reduce((s, n) => s + n, 0);
    await sb
      .from("meta_execution_log")
      .update({
        finished_at: new Date().toISOString(),
        ok: true,
        rows_affected: totalRows,
        context: totals,
      })
      .eq("id", exec.data?.id);

    return new Response(JSON.stringify({ ok: true, ...totals }), {
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
