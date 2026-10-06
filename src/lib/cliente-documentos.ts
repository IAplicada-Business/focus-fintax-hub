export const CLIENTE_DOCUMENTO_TIPOS = [
  { value: "contrato", label: "Contrato" },
  { value: "procuracao", label: "Procuração" },
  { value: "contrato_social", label: "Contrato social" },
  { value: "certidao", label: "Certidão" },
  { value: "outro", label: "Outro" },
] as const;

export type ClienteDocumentoTipo = (typeof CLIENTE_DOCUMENTO_TIPOS)[number]["value"];

export const CLIENTE_DOCUMENTO_TIPO_LABEL: Record<ClienteDocumentoTipo, string> = {
  contrato: "Contrato",
  procuracao: "Procuração",
  contrato_social: "Contrato social",
  certidao: "Certidão",
  outro: "Outro",
};

export const CLIENTE_DOCUMENTO_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const CLIENTE_DOCUMENTO_MAX_BYTES = 10 * 1024 * 1024;

export const CLIENTE_DOCUMENTOS_BUCKET = "cliente-documentos";

export function isClienteDocumentoTipo(value: string): value is ClienteDocumentoTipo {
  return CLIENTE_DOCUMENTO_TIPOS.some((item) => item.value === value);
}

export function sanitizeDocumentoFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "documento";
}

export function formatDocumentoBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pathClienteDocumento(
  clienteId: string,
  tipo: ClienteDocumentoTipo,
  fileName: string,
  now = Date.now(),
) {
  return `${clienteId}/cadastro/${tipo}/${now}-${sanitizeDocumentoFileName(fileName)}`;
}

export function validarArquivoClienteDocumento(file: File): string | null {
  if (file.size > CLIENTE_DOCUMENTO_MAX_BYTES) {
    return `${file.name} passa de 10 MB.`;
  }
  return null;
}
