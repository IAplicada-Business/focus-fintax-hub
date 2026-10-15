import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModeloResumo, ResumoSemanalDados } from "@/lib/resumo-semanal";
import {
  enviarResumoTeste,
  getSnapshotSegunda,
  listResumoDestinatarios,
  listResumoEnvios,
  listUsuariosComWhatsapp,
  previewResumoDados,
  removeResumoDestinatario,
  toggleDestinatarioUsuario,
} from "@/services/resumoSemanalService";
import { toastError } from "@/lib/handle-error";

const KEY = ["resumo-semanal"] as const;

export function useResumoDestinatarios(enabled = true) {
  return useQuery({ queryKey: [...KEY, "destinatarios"], queryFn: listResumoDestinatarios, enabled });
}

export function useUsuariosResumo(enabled = true) {
  return useQuery({ queryKey: [...KEY, "usuarios"], queryFn: listUsuariosComWhatsapp, enabled, staleTime: 60_000 });
}

export function useResumoEnvios(enabled = true) {
  return useQuery({ queryKey: [...KEY, "envios"], queryFn: () => listResumoEnvios(15), enabled, staleTime: 30_000 });
}

/** Dados + snapshot de segunda (quando o modelo é sexta) pro preview. */
export function useResumoPreview(modelo: ModeloResumo, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "preview", modelo],
    queryFn: async (): Promise<{ dados: ResumoSemanalDados; segunda: ResumoSemanalDados | null }> => {
      const dados = await previewResumoDados(modelo);
      // Snapshot de segunda é opcional: sem ele a prévia avisa, não quebra.
      const segunda: ResumoSemanalDados | null =
        modelo === "sexta" ? await getSnapshotSegunda(dados.periodo_inicio).catch((): null => null) : null;
      return { dados, segunda };
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useResumoDestinatarioMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [...KEY, "destinatarios"] });
  const alternarUsuario = useMutation({
    mutationFn: toggleDestinatarioUsuario,
    onSuccess: invalidate,
    onError: (e) => toastError(e, "Erro ao atualizar quem recebe o resumo"),
  });
  const remover = useMutation({
    mutationFn: removeResumoDestinatario,
    onSuccess: invalidate,
    onError: (e) => toastError(e, "Erro ao remover destinatário"),
  });
  return { alternarUsuario, remover };
}

export function useEnviarResumoTeste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enviarResumoTeste,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "envios"] }),
  });
}
