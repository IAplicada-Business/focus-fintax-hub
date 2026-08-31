import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listConversasInbox } from "@/services/atendimentoService";
import { supabase } from "@/integrations/supabase/client";

export function useAtendimentoInbox() {
  const qc = useQueryClient();

  useEffect(() => {
    const canal = supabase
      .channel("atendimento-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atendimento_conversas" },
        () => qc.invalidateQueries({ queryKey: ["atendimento", "inbox"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atendimento_mensagens" },
        () => qc.invalidateQueries({ queryKey: ["atendimento", "inbox"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  return useQuery({
    queryKey: ["atendimento", "inbox"],
    queryFn: listConversasInbox,
    staleTime: 15_000,
  });
}
