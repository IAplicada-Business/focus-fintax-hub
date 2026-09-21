import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteCliente,
  listClientes,
  listCompensacoesMensais,
  listCreditosApurados,
  listProcessosTeses,
  listTesesParaCalculo,
  updateClienteMotivoParada,
} from "@/services/clientesService";
import { toastError } from "@/lib/handle-error";
import { toast } from "sonner";

export function useClientes() {
  return useQuery({
    queryKey: ["clientes"],
    queryFn: listClientes,
  });
}

export function useProcessosTeses() {
  return useQuery({
    queryKey: ["clientes", "processos"],
    queryFn: listProcessosTeses,
  });
}

export function useCompensacoesMensais() {
  return useQuery({
    queryKey: ["clientes", "compensacoes"],
    queryFn: listCompensacoesMensais,
  });
}

export function useCreditosApurados() {
  return useQuery({
    queryKey: ["clientes", "creditos"],
    queryFn: listCreditosApurados,
  });
}

export function useTesesParaCalculo() {
  return useQuery({
    queryKey: ["clientes", "teses"],
    queryFn: listTesesParaCalculo,
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCliente(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Cliente excluído com sucesso");
    },
    onError: (err) => toastError(err, "Erro ao excluir cliente"),
  });
}

export function useUpdateClienteMotivoParada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, motivoParada }: { clienteId: string; motivoParada: string | null }) =>
      updateClienteMotivoParada(clienteId, motivoParada),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["esteira"] });
      qc.invalidateQueries({ queryKey: ["dashboard-gestao-resumo"] });
      toast.success("Motivo da parada salvo");
    },
    onError: (err) => toastError(err, "Erro ao salvar motivo da parada"),
  });
}
