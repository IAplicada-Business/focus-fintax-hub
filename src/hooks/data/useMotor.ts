import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listTeses, upsertTese, toggleTeseAtivo } from "@/services/motorService";
import type { Database } from "@/integrations/supabase/types";
import { toastError } from "@/lib/handle-error";
import { toast } from "sonner";

type MotorTeseInsert = Database["public"]["Tables"]["motor_teses_config"]["Insert"];

export function useTeses() {
  return useQuery({
    queryKey: ["motor", "teses"],
    queryFn: listTeses,
  });
}

export function useUpsertTese() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tese, isUpdate }: { tese: MotorTeseInsert & { id?: string }; isUpdate: boolean }) =>
      upsertTese(tese, isUpdate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["motor"] });
      toast.success("Tese salva com sucesso");
    },
    onError: (err) => toastError(err, "Erro ao salvar tese"),
  });
}

export function useToggleTeseAtivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => toggleTeseAtivo(id, ativo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["motor"] });
    },
    onError: (err) => toastError(err, "Erro ao alterar status da tese"),
  });
}
