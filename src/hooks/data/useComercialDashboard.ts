import { useQuery } from "@tanstack/react-query";
import { fetchComercialDashboard } from "@/services/comercialDashboardService";

/** Mesma raiz de chave ("dashboard") que o realtime do Dashboard invalida. */
export function useComercialDashboard() {
  return useQuery({
    queryKey: ["dashboard", "comercial", "v2"],
    queryFn: fetchComercialDashboard,
    staleTime: 60_000,
  });
}
