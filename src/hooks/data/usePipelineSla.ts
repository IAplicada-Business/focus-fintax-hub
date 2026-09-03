import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toastError } from "@/lib/handle-error";
import type { EtapaFunil } from "@/lib/pipeline-sla";
import { listLeadsFunil, listPipelineSlaConfig, updatePipelineSlaMeta } from "@/services/pipelineSlaService";

export function usePipelineSlaConfig() {
  return useQuery({
    queryKey: ["pipeline", "sla-config"],
    queryFn: listPipelineSlaConfig,
    staleTime: 60_000,
  });
}

export function useLeadsFunil() {
  return useQuery({
    queryKey: ["leads", "funil-sla"],
    queryFn: listLeadsFunil,
    staleTime: 30_000,
  });
}

export function useUpdatePipelineSlaMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ etapa, slaDias }: { etapa: EtapaFunil; slaDias: number | null }) =>
      updatePipelineSlaMeta(etapa, slaDias),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "sla-config"] });
    },
    onError: (err) => toastError(err, "Erro ao salvar a meta da etapa"),
  });
}
