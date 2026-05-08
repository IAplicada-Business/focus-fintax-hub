import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listClientes, listProcessosTeses, listCompensacoesMensais, deleteCliente } from "@/services/clientesService";
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
