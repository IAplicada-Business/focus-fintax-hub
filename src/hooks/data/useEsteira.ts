import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  aplicarRealocacaoEsteira,
  listEsteiraClientes,
  listEsteiraResponsaveis,
  reiniciarSlaEsteira,
  updateEstagioEsteira,
  type RealocacaoItem,
} from "@/services/esteiraService";
import { listStatusCompensacaoRows } from "@/services/clientesService";
import { fetchEsteiraSla } from "@/services/esteiraSlaService";
import {
  listEsteiraSlaConfig,
  updateEsteiraSlaConfig,
  type EsteiraSlaConfigUpdate,
} from "@/services/esteiraSlaConfigService";
import type { EstagioEsteira } from "@/lib/esteira-constants";
import { toastError } from "@/lib/handle-error";

export function useEsteiraClientes() {
  return useQuery({
    queryKey: ["esteira", "clientes"],
    queryFn: listEsteiraClientes,
  });
}

export function useEsteiraSla() {
  return useQuery({
    queryKey: ["esteira", "sla"],
    queryFn: fetchEsteiraSla,
    staleTime: 30_000,
  });
}

export function useEsteiraSlaConfig() {
  return useQuery({
    queryKey: ["esteira", "sla-config"],
    queryFn: listEsteiraSlaConfig,
    staleTime: 60_000,
  });
}

export function useUpdateEsteiraSlaConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: EsteiraSlaConfigUpdate[]) => updateEsteiraSlaConfig(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["esteira"] });
    },
    onError: (err) => toastError(err, "Erro ao salvar SLA da esteira"),
  });
}

export function useUpdateEstagioEsteira() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, estagio }: { clienteId: string; estagio: EstagioEsteira }) =>
      updateEstagioEsteira(clienteId, estagio),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["esteira"] });
    },
    onError: (err) => toastError(err, "Erro ao mover cliente na esteira"),
  });
}

export function useEsteiraResponsaveis() {
  return useQuery({
    queryKey: ["esteira", "responsaveis"],
    queryFn: listEsteiraResponsaveis,
    staleTime: 5 * 60_000,
  });
}

/** Mesma chave do `useStatusCompensacao` (StatusCompensacaoFilter) — compartilha cache. */
export function useStatusPrincipalPorCliente() {
  return useQuery({
    queryKey: ["catalog", "status_compensacao"],
    queryFn: listStatusCompensacaoRows,
    staleTime: 60_000,
  });
}

/** Invalida tudo que lê estágio/responsável do cliente (esteira, carteira, dashboards). */
function invalidateEsteiraEClientes(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["esteira"] });
  qc.invalidateQueries({ queryKey: ["clientes"] });
  qc.invalidateQueries({ queryKey: ["catalog"] });
  qc.invalidateQueries({ queryKey: ["dashboard-gestao-resumo"] });
  qc.invalidateQueries({ queryKey: ["dashboard-gestao-ciclo"] });
}

export function useAplicarRealocacaoEsteira() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itens, motivo }: { itens: RealocacaoItem[]; motivo?: string }) =>
      aplicarRealocacaoEsteira(itens, motivo),
    onSuccess: () => invalidateEsteiraEClientes(qc),
    onError: (err) => toastError(err, "Erro ao aplicar realocação"),
  });
}

export function useReiniciarSlaEsteira() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteIds, motivo }: { clienteIds: string[]; motivo?: string }) =>
      reiniciarSlaEsteira(clienteIds, motivo),
    onSuccess: () => invalidateEsteiraEClientes(qc),
    onError: (err) => toastError(err, "Erro ao reiniciar SLA"),
  });
}
