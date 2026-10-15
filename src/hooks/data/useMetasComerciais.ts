import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toastError } from "@/lib/handle-error";
import { fetchMetasComerciaisMes, salvarMetaComercial } from "@/services/metasComerciaisService";

/** Metas × realizado de um mês (`YYYY-MM`). Raiz "dashboard" pra o realtime invalidar junto. */
export function useMetasComerciais(mes: string) {
  return useQuery({
    queryKey: ["dashboard", "metas-comerciais", mes],
    queryFn: () => fetchMetasComerciaisMes(mes),
    staleTime: 60_000,
    enabled: /^\d{4}-\d{2}$/.test(mes),
  });
}

export function useSalvarMetaComercial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salvarMetaComercial,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "metas-comerciais"] });
    },
    onError: (err) => toastError(err, "Erro ao salvar a meta"),
  });
}
