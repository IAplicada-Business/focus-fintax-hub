import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useMetaLeads(limit = 200) {
  return useQuery({
    queryKey: ["meta", "leads", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_leads")
        .select(`
          id, form_id, ad_id, campaign_id, page_id, created_time,
          email, phone, cnpj, nome, razao_social,
          segmento, regime_tributacao, faturamento_faixa, faturamento_estimado,
          ja_fez_compensacao, crm_lead_id, processed_at, error_text, inserted_at
        `)
        .order("created_time", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Realtime subscription em meta_leads — invalida cache quando chega lead novo */
export function useMetaLeadsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("meta-leads-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meta_leads" },
        () => qc.invalidateQueries({ queryKey: ["meta", "leads"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
