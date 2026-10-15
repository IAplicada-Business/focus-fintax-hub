import { useQuery } from "@tanstack/react-query";
import { listEquipeComercial } from "@/services/usersService";

/** SDRs e closers ativos para selects, badges e filtros de responsável. */
export function useEquipeComercial(enabled = true) {
  return useQuery({
    queryKey: ["equipe-comercial", "cargos"],
    queryFn: listEquipeComercial,
    enabled,
    staleTime: 5 * 60_000,
  });
}
