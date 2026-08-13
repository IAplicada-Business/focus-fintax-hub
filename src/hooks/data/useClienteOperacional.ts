import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getCliente,
  getClienteCompensacoes,
  getClienteCreditos,
  getClienteProcessos,
  getClienteStatusCompensacao,
  listMotorTesesAtivas,
  listTesesTributarias,
} from "@/services/clientesService";

const CATALOG_STALE = 30 * 60_000;
const MOTOR_STALE = 10 * 60_000;

export function clienteOperacionalKey(clienteId: string) {
  return ["cliente", clienteId, "operacional"] as const;
}

/** Invalida só os dados operacionais do cliente — não o cadastro (observações em edição). */
export function invalidateClienteOperacional(qc: QueryClient, clienteId: string) {
  return qc.invalidateQueries({ queryKey: clienteOperacionalKey(clienteId) });
}

export function useTesesTributarias() {
  return useQuery({
    queryKey: ["catalog", "teses_tributarias"],
    queryFn: listTesesTributarias,
    staleTime: CATALOG_STALE,
    gcTime: 60 * 60_000,
  });
}

export function useMotorTesesAtivas() {
  return useQuery({
    queryKey: ["catalog", "motor_teses_ativas"],
    queryFn: listMotorTesesAtivas,
    staleTime: MOTOR_STALE,
    gcTime: 60 * 60_000,
  });
}

export function useClienteRecord(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["cliente", clienteId, "record"],
    queryFn: () => getCliente(clienteId!),
    enabled: !!clienteId,
  });
}

export function useClienteProcessos(clienteId: string | undefined) {
  return useQuery({
    queryKey: [...clienteOperacionalKey(clienteId ?? ""), "processos"],
    queryFn: () => getClienteProcessos(clienteId!),
    enabled: !!clienteId,
  });
}

export function useClienteCompensacoes(clienteId: string | undefined) {
  return useQuery({
    queryKey: [...clienteOperacionalKey(clienteId ?? ""), "compensacoes"],
    queryFn: () => getClienteCompensacoes(clienteId!),
    enabled: !!clienteId,
  });
}

export function useClienteCreditos(clienteId: string | undefined) {
  return useQuery({
    queryKey: [...clienteOperacionalKey(clienteId ?? ""), "creditos"],
    queryFn: () => getClienteCreditos(clienteId!),
    enabled: !!clienteId,
  });
}

export function useClienteStatusCompensacao(clienteId: string | undefined) {
  return useQuery({
    queryKey: [...clienteOperacionalKey(clienteId ?? ""), "status"],
    queryFn: () => getClienteStatusCompensacao(clienteId!),
    enabled: !!clienteId,
  });
}

export function useInvalidateClienteOperacional(clienteId: string) {
  const qc = useQueryClient();
  return () => invalidateClienteOperacional(qc, clienteId);
}
