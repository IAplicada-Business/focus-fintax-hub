import { useQuery } from "@tanstack/react-query";
import {
  fetchCommercialKpis,
  fetchCommercialCharts,
  fetchOperationalKpis,
  fetchOperationalHealth,
  fetchIntimacoesSummary,
} from "@/services/dashboardService";

export function useCommercialKpis() {
  return useQuery({
    queryKey: ["dashboard", "commercial", "kpis"],
    queryFn: fetchCommercialKpis,
  });
}

export function useCommercialCharts() {
  return useQuery({
    queryKey: ["dashboard", "commercial", "charts"],
    queryFn: fetchCommercialCharts,
  });
}

export function useOperationalKpis() {
  return useQuery({
    queryKey: ["dashboard", "operational", "kpis"],
    queryFn: fetchOperationalKpis,
  });
}

export function useOperationalHealth() {
  return useQuery({
    queryKey: ["dashboard", "operational", "health"],
    queryFn: fetchOperationalHealth,
  });
}

export function useIntimacoesSummary() {
  return useQuery({
    queryKey: ["dashboard", "intimacoes"],
    queryFn: fetchIntimacoesSummary,
  });
}
