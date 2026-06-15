import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OverviewKpis {
  spend: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  link_clicks: number;
  impressions: number;
}

export interface DailyPoint {
  date: string;
  spend: number;
  leads: number;
}

export interface TopCampaign {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  leads: number;
}

export interface TopAd {
  ad_id: string;
  ad_name: string;
  campaign_name: string | null;
  leads: number;
  spend: number;
}

/**
 * KPIs agregados dos últimos N dias (default 30) + série diária +
 * top 3 campanhas por gasto + top 3 ads por leads.
 */
export function useMetaOverview(days = 30) {
  return useQuery({
    queryKey: ["meta", "overview", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().slice(0, 10);

      const [insightsRes, adsRes, campsRes] = await Promise.all([
        supabase
          .from("meta_insights_daily")
          .select("date, object_id, spend, impressions, clicks, link_clicks, leads, cost_per_lead, ctr")
          .eq("level", "ad")
          .gte("date", sinceStr),
        supabase.from("meta_ads").select("id, name, campaign_id"),
        supabase.from("meta_campaigns").select("id, name"),
      ]);

      if (insightsRes.error) throw insightsRes.error;
      if (adsRes.error) throw adsRes.error;
      if (campsRes.error) throw campsRes.error;

      const rows = insightsRes.data ?? [];

      // KPIs agregados
      let spend = 0, leads = 0, link_clicks = 0, impressions = 0;
      let ctr_sum = 0, ctr_n = 0;
      for (const r of rows) {
        spend       += Number(r.spend ?? 0);
        leads       += Number(r.leads ?? 0);
        link_clicks += Number(r.link_clicks ?? 0);
        impressions += Number(r.impressions ?? 0);
        if (r.ctr != null) { ctr_sum += Number(r.ctr); ctr_n++; }
      }
      const kpis: OverviewKpis = {
        spend, leads, link_clicks, impressions,
        cpl: leads > 0 ? spend / leads : null,
        ctr: ctr_n > 0 ? ctr_sum / ctr_n : null,
      };

      // Série diária
      const byDate = new Map<string, { spend: number; leads: number }>();
      for (const r of rows) {
        const d = String(r.date);
        const acc = byDate.get(d) ?? { spend: 0, leads: 0 };
        acc.spend += Number(r.spend ?? 0);
        acc.leads += Number(r.leads ?? 0);
        byDate.set(d, acc);
      }
      const daily: DailyPoint[] = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));

      const adById     = new Map((adsRes.data ?? []).map((a) => [a.id, a]));
      const campById   = new Map((campsRes.data ?? []).map((c) => [c.id, c]));

      // Top 3 campanhas por gasto
      const byCampaign = new Map<string, { spend: number; leads: number }>();
      for (const r of rows) {
        const ad = adById.get(r.object_id);
        const cid = ad?.campaign_id;
        if (!cid) continue;
        const acc = byCampaign.get(cid) ?? { spend: 0, leads: 0 };
        acc.spend += Number(r.spend ?? 0);
        acc.leads += Number(r.leads ?? 0);
        byCampaign.set(cid, acc);
      }
      const topCampaigns: TopCampaign[] = [...byCampaign.entries()]
        .sort((a, b) => b[1].spend - a[1].spend)
        .slice(0, 3)
        .map(([campaign_id, v]) => ({
          campaign_id,
          campaign_name: campById.get(campaign_id)?.name ?? campaign_id,
          spend: v.spend,
          leads: v.leads,
        }));

      // Top 3 ads por leads
      const byAd = new Map<string, { spend: number; leads: number }>();
      for (const r of rows) {
        const acc = byAd.get(r.object_id) ?? { spend: 0, leads: 0 };
        acc.spend += Number(r.spend ?? 0);
        acc.leads += Number(r.leads ?? 0);
        byAd.set(r.object_id, acc);
      }
      const topAds: TopAd[] = [...byAd.entries()]
        .sort((a, b) => b[1].leads - a[1].leads)
        .slice(0, 3)
        .map(([ad_id, v]) => {
          const ad = adById.get(ad_id);
          return {
            ad_id,
            ad_name: ad?.name ?? ad_id,
            campaign_name: ad?.campaign_id ? campById.get(ad.campaign_id)?.name ?? null : null,
            leads: v.leads,
            spend: v.spend,
          };
        });

      return { kpis, daily, topCampaigns, topAds };
    },
  });
}
