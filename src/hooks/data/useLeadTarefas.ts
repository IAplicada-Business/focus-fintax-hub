import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toastError } from "@/lib/handle-error";
import { tarefasParaLembrete, type LeadTarefa } from "@/lib/lead-tarefas";
import {
  concluirTarefa,
  criarTarefa,
  excluirTarefa,
  listTarefasAbertas,
  listTarefasDoLead,
} from "@/services/leadTarefasService";

const RAIZ = "lead-tarefas";

/** Tarefas de um lead (aba Tarefas do card). */
export function useLeadTarefas(leadId: string | null | undefined) {
  return useQuery({
    queryKey: [RAIZ, "lead", leadId],
    queryFn: () => listTarefasDoLead(leadId as string),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

/** Tarefas abertas de todos os leads (badge do kanban). */
export function useTarefasAbertas(enabled = true) {
  return useQuery({
    queryKey: [RAIZ, "abertas"],
    queryFn: listTarefasAbertas,
    enabled,
    staleTime: 60_000,
    // Lembrete precisa virar "atrasada" sem recarregar a página.
    refetchInterval: 5 * 60_000,
  });
}

/**
 * Minhas tarefas abertas que vencem hoje ou já venceram. Reaproveita a mesma
 * consulta do kanban (mesma queryKey) e só filtra no cliente.
 */
export function useMinhasTarefasLembrete(userId: string | null | undefined) {
  return useQuery({
    queryKey: [RAIZ, "abertas"],
    queryFn: listTarefasAbertas,
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    select: (tarefas: LeadTarefa[]) => tarefasParaLembrete(tarefas, userId),
  });
}

function useInvalidarTarefas() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [RAIZ] });
}

export function useCriarTarefa() {
  const invalidar = useInvalidarTarefas();
  return useMutation({
    mutationFn: criarTarefa,
    onSuccess: invalidar,
    onError: (err) => toastError(err, "Erro ao agendar a tarefa"),
  });
}

export function useConcluirTarefa() {
  const invalidar = useInvalidarTarefas();
  return useMutation({
    mutationFn: ({ id, concluida }: { id: string; concluida: boolean }) => concluirTarefa(id, concluida),
    onSuccess: invalidar,
    onError: (err) => toastError(err, "Erro ao atualizar a tarefa"),
  });
}

export function useExcluirTarefa() {
  const invalidar = useInvalidarTarefas();
  return useMutation({
    mutationFn: excluirTarefa,
    onSuccess: invalidar,
    onError: (err) => toastError(err, "Erro ao excluir a tarefa"),
  });
}
