import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampaignFilters {
  status?: string;
  objective?: string;
}

export function useMetaCampaigns(filters: CampaignFilters = {}) {
  return useQuery({
    queryKey: ["meta", "campaigns", filters],
    queryFn: async () => {
      let q = supabase
        .from("meta_campaigns")
        .select("id, ad_account_id, name, status, objective, daily_budget, lifetime_budget, start_time, stop_time, created_time, synced_at")
        .order("created_time", { ascending: false });
      if (filters.status)    q = q.eq("status", filters.status);
      if (filters.objective) q = q.eq("objective", filters.objective);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
