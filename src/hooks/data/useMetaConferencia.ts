import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MetaConferencia = {
  lastInsightDate: string | null;
  insightLeadsAll: number;
  insightLeads30d: number;
  crmMetaAll: number;
  crmMeta30d: number;
  metaLeadsAll: number;
  metaLeadsLinked: number;
  metaLeads30d: number;
};

export function useMetaConferencia() {
  return useQuery({
    queryKey: ["meta", "conferencia"],
    queryFn: async (): Promise<MetaConferencia> => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);
      const sinceIso = since.toISOString();

      const [insightsAll, insights30, crmAll, crm30, rawAll, rawLinked, raw30] = await Promise.all([
        supabase.from("meta_insights_daily").select("leads, date").eq("level", "ad"),
        supabase.from("meta_insights_daily").select("leads, date").eq("level", "ad").gte("date", sinceStr),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("origem", "meta_ads"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("origem", "meta_ads").gte("criado_em", sinceIso),
        supabase.from("meta_leads").select("id", { count: "exact", head: true }),
        supabase.from("meta_leads").select("id", { count: "exact", head: true }).not("crm_lead_id", "is", null),
        supabase.from("meta_leads").select("id", { count: "exact", head: true }).gte("created_time", sinceIso),
      ]);

      if (insightsAll.error) throw insightsAll.error;
      if (insights30.error) throw insights30.error;

      const sumLeads = (rows: { leads: number | null }[] | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.leads ?? 0), 0);

      const dates = (insightsAll.data ?? []).map((r) => String(r.date)).sort();

      return {
        lastInsightDate: dates.at(-1) ?? null,
        insightLeadsAll: sumLeads(insightsAll.data),
        insightLeads30d: sumLeads(insights30.data),
        crmMetaAll: crmAll.count ?? 0,
        crmMeta30d: crm30.count ?? 0,
        metaLeadsAll: rawAll.count ?? 0,
        metaLeadsLinked: rawLinked.count ?? 0,
        metaLeads30d: raw30.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
