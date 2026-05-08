import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listIntimacoes, deleteIntimacao } from "@/services/intimacoesService";
import { toastError } from "@/lib/handle-error";
import { toast } from "sonner";

export function useIntimacoes() {
  return useQuery({
    queryKey: ["intimacoes"],
    queryFn: listIntimacoes,
  });
}

export function useDeleteIntimacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIntimacao(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intimacoes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Intimação excluída");
    },
    onError: (err) => toastError(err, "Erro ao excluir intimação"),
  });
}
