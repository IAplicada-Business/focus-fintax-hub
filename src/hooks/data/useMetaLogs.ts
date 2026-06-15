import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMetaLogs(limit = 50) {
  return useQuery({
    queryKey: ["meta", "logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_execution_log")
        .select("id, function_name, started_at, finished_at, ok, rows_affected, error_text, context")
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
