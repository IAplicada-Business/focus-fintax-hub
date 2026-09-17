import { useQuery } from "@tanstack/react-query";
import { fetchOperacionalDashboard } from "@/services/operacionalDashboardService";

/** Compartilhado pelas três abas do Dashboard operacional. */
export function useOperacionalDashboard() {
  return useQuery({
    queryKey: ["dashboard", "operacional", "v2"],
    queryFn: fetchOperacionalDashboard,
    staleTime: 60_000,
  });
}
