import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listEsteiraClientes, updateEstagioEsteira } from "@/services/esteiraService";
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
