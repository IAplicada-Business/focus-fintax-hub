import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { listClientes, listCompensacoesMensais, listProcessosTeses } from "@/services/clientesService";

export interface AppNotification {
  id: string;
  type: "warning" | "info";
  title: string;
  subtitle: string;
  href: string;
}

async function fetchAppNotifications(qc: QueryClient): Promise<AppNotification[]> {
  const alerts: AppNotification[] = [];
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

  const [staleLeadsRes, clientes, processos, compensacoes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, empresa, status_funil_atualizado_em")
      .eq("status_funil", "contrato_emitido")
      .lt("status_funil_atualizado_em", threeDaysAgo),
    qc.ensureQueryData({ queryKey: ["clientes"], queryFn: listClientes }),
    qc.ensureQueryData({ queryKey: ["clientes", "processos"], queryFn: listProcessosTeses }),
    qc.ensureQueryData({ queryKey: ["clientes", "compensacoes"], queryFn: listCompensacoesMensais }),
  ]);

  staleLeadsRes.data?.forEach((l) => {
    const days = Math.floor(
      (Date.now() - new Date(l.status_funil_atualizado_em!).getTime()) / 86400000,
    );
    alerts.push({
      id: `lead-${l.id}`,
      type: "warning",
      title: `${l.empresa} parado em Contrato Emitido`,
      subtitle: `Sem atualização há ${days} dias`,
      href: "/pipeline",
    });
  });

  const creditoMap = new Map<string, number>();
  const compensadoMap = new Map<string, number>();
  processos.forEach((p) => {
    creditoMap.set(p.cliente_id, (creditoMap.get(p.cliente_id) ?? 0) + Number(p.valor_credito ?? 0));
  });
  compensacoes.forEach((c) => {
    compensadoMap.set(c.cliente_id, (compensadoMap.get(c.cliente_id) ?? 0) + Number(c.valor_compensado ?? 0));
  });

  clientes.forEach((c) => {
    const credito = creditoMap.get(c.id) ?? 0;
    const compensado = compensadoMap.get(c.id) ?? 0;
    if (credito > 0 && compensado >= credito) {
      alerts.push({
        id: `saldo-${c.id}`,
        type: "info",
        title: `${c.empresa} zerou o saldo`,
        subtitle: "Crédito totalmente compensado — considere nova tese",
        href: `/clientes/${c.id}`,
      });
    }
  });

  return alerts;
}

export function useNotifications() {
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const canSee = ["admin", "comercial", "pmo"].includes(userRole ?? "");

  const { data = [], isPending } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAppNotifications(qc),
    enabled: canSee,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  return { notifications: canSee ? data : [], loading: canSee && isPending && data.length === 0 };
}
