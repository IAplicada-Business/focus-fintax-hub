import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ListChecks, Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEsteiraClientes, useEsteiraSlaConfig } from "@/hooks/data/useEsteira";
import { EsteiraKanban } from "@/components/esteira/EsteiraKanban";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { Button } from "@/components/ui/button";
import { visibleEsteiraStages } from "@/lib/esteira-constants";

export default function Esteira() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const podeOrganizar = userRole === "admin" || userRole === "pmo";
  const { data: clientes, isLoading } = useEsteiraClientes();
  const { data: slaConfig } = useEsteiraSlaConfig();

  const stages = useMemo(() => {
    if (!slaConfig) return undefined;
    return visibleEsteiraStages(
      slaConfig,
      (clientes ?? []).map((c) => c.estagio_esteira || "triagem"),
    );
  }, [slaConfig, clientes]);

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
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Esteira Administrativa</h1>
          <p className="text-sm text-muted-foreground">
            Fluxo operacional dos clientes ativos (triagem → financeiro → concluído).
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {podeOrganizar && (
            <Button asChild size="sm" variant="outline">
              <Link to="/esteira/organizar">
                <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                Organizar
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/configuracoes/esteira-sla">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Configurar SLA
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : (
        <EsteiraKanban
          clientes={clientes ?? []}
          stages={stages}
          onClienteClick={(id) => navigate(`/clientes/${id}`)}
        />
      )}
    </div>
  );
}
