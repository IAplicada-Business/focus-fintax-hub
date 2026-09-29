import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { listClientes, listCompensacoesMensais, listProcessosTeses } from "@/services/clientesService";

const NOTIF_DELAY_MS = 4_000;
const NOTIF_INTERVAL_MS = 15 * 60_000;

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
  // As notificações varrem clientes, processos e compensações inteiros. Isso
  // disputava banda com a tela que o usuário abriu; agora só começa depois
  // que a tela teve alguns segundos pra carregar o que é dela.
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPronto(true), NOTIF_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const { data = [], isPending } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAppNotifications(qc),
    enabled: canSee && pronto,
    staleTime: NOTIF_INTERVAL_MS,
    refetchInterval: NOTIF_INTERVAL_MS,
  });

  return { notifications: canSee ? data : [], loading: canSee && isPending && data.length === 0 };
}
