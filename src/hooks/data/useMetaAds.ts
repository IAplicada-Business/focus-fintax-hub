import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdRow {
  id: string;
  name: string | null;
  status: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_set_id: string | null;
  creative_id: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  synced_at: string | null;
}

/**
 * Lista todos os anúncios com métricas agregadas dos últimos N dias (default 30d)
 * de meta_insights_daily, com nome da campanha.
 */
export function useMetaAds(days = 30) {
  return useQuery({
    queryKey: ["meta", "ads", days],
    queryFn: async (): Promise<AdRow[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().slice(0, 10);

      const [adsRes, insightsRes, campsRes] = await Promise.all([
        supabase
          .from("meta_ads")
          .select("id, name, status, campaign_id, ad_set_id, creative_id, synced_at"),
        supabase
          .from("meta_insights_daily")
          .select("object_id, spend, impressions, clicks, link_clicks, leads, cost_per_lead, ctr")
          .eq("level", "ad")
          .gte("date", sinceStr),
        supabase
          .from("meta_campaigns")
          .select("id, name"),
      ]);

      if (adsRes.error) throw adsRes.error;
      if (insightsRes.error) throw insightsRes.error;
      if (campsRes.error) throw campsRes.error;

      const campNameById = new Map<string, string>(
        (campsRes.data ?? []).map((c) => [c.id, c.name ?? ""])
      );

      // Agrega métricas por ad_id
      const metricsByAd = new Map<string, {
        spend: number; impressions: number; clicks: number;
        link_clicks: number; leads: number; cpl_sum: number; cpl_n: number; ctr_sum: number; ctr_n: number;
      }>();
      for (const r of insightsRes.data ?? []) {
        const m = metricsByAd.get(r.object_id) ?? {
          spend: 0, impressions: 0, clicks: 0, link_clicks: 0, leads: 0,
          cpl_sum: 0, cpl_n: 0, ctr_sum: 0, ctr_n: 0,
        };
        m.spend       += Number(r.spend ?? 0);
        m.impressions += Number(r.impressions ?? 0);
        m.clicks      += Number(r.clicks ?? 0);
        m.link_clicks += Number(r.link_clicks ?? 0);
        m.leads       += Number(r.leads ?? 0);
        if (r.cost_per_lead != null) { m.cpl_sum += Number(r.cost_per_lead); m.cpl_n++; }
        if (r.ctr != null)           { m.ctr_sum += Number(r.ctr);           m.ctr_n++; }
        metricsByAd.set(r.object_id, m);
      }

      return (adsRes.data ?? []).map((ad): AdRow => {
        const m = metricsByAd.get(ad.id);
        return {
          id: ad.id,
          name: ad.name,
          status: ad.status,
          campaign_id: ad.campaign_id,
          campaign_name: ad.campaign_id ? campNameById.get(ad.campaign_id) ?? null : null,
          ad_set_id: ad.ad_set_id,
          creative_id: ad.creative_id,
          spend:       m?.spend ?? 0,
          impressions: m?.impressions ?? 0,
          clicks:      m?.clicks ?? 0,
          link_clicks: m?.link_clicks ?? 0,
          leads:       m?.leads ?? 0,
          cpl:         m && m.leads > 0 ? m.spend / m.leads : null,
          ctr:         m && m.ctr_n > 0 ? m.ctr_sum / m.ctr_n : null,
          synced_at:   ad.synced_at,
        };
      });
    },
  });
}
