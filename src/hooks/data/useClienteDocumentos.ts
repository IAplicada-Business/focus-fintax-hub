import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toastError } from "@/lib/handle-error";
import type { ClienteDocumentoTipo } from "@/lib/cliente-documentos";
import {
  deleteClienteDocumento,
  listClienteDocumentos,
  uploadClienteDocumento,
} from "@/services/clienteDocumentosService";
import { toast } from "sonner";

export function clienteDocumentosKey(clienteId: string) {
  return ["cliente", clienteId, "documentos"] as const;
}

export function useClienteDocumentos(clienteId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: clienteId ? clienteDocumentosKey(clienteId) : ["cliente", "documentos", "idle"],
    queryFn: () => listClienteDocumentos(clienteId!),
    enabled: !!clienteId && enabled,
  });
}

export function useUploadClienteDocumento(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, tipo }: { file: File; tipo: ClienteDocumentoTipo }) => {
      if (!clienteId) throw new Error("Salve o cliente antes de anexar o documento.");
      return uploadClienteDocumento({ clienteId, file, tipo });
    },
    onSuccess: () => {
      if (clienteId) void qc.invalidateQueries({ queryKey: clienteDocumentosKey(clienteId) });
      toast.success("Documento anexado.");
    },
    onError: (err) => toastError(err, "Erro ao anexar o documento"),
  });
}

export function useDeleteClienteDocumento(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteClienteDocumento,
    onSuccess: () => {
      if (clienteId) void qc.invalidateQueries({ queryKey: clienteDocumentosKey(clienteId) });
      toast.success("Documento removido.");
    },
    onError: (err) => toastError(err, "Erro ao remover o documento"),
  });
}
