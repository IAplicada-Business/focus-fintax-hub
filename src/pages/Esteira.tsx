import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEsteiraClientes } from "@/hooks/data/useEsteira";
import { EsteiraKanban } from "@/components/esteira/EsteiraKanban";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { useNavigate } from "react-router-dom";

export default function Esteira() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: clientes, isLoading } = useEsteiraClientes();

  useEffect(() => {
    const channel = supabase
      .channel("esteira-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["esteira"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // h-full + min-h-0: o kanban ocupa a altura restante do <main> em vez de
  // depender de um calc(100vh - N) que nunca bate com o header real.
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-bold text-foreground">Esteira Administrativa</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento operacional dos clientes ativos, do BPMN oficial (ramo Compensação).
        </p>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : (
        <EsteiraKanban
          clientes={clientes ?? []}
          onClienteClick={(id) => navigate(`/clientes/${id}`)}
        />
      )}
    </div>
  );
}
