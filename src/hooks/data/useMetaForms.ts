import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMetaForms() {
  return useQuery({
    queryKey: ["meta", "forms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_leadgen_forms")
        .select("id, page_id, name, status, leads_count, questions, created_time, synced_at")
        .order("created_time", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
