import { useRef, useState } from "react";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useClienteDocumentos,
  useDeleteClienteDocumento,
  useUploadClienteDocumento,
} from "@/hooks/data/useClienteDocumentos";
import {
  CLIENTE_DOCUMENTO_ACCEPT,
  CLIENTE_DOCUMENTO_TIPO_LABEL,
  CLIENTE_DOCUMENTO_TIPOS,
  formatDocumentoBytes,
  validarArquivoClienteDocumento,
  type ClienteDocumentoTipo,
} from "@/lib/cliente-documentos";
import { urlClienteDocumento, type ClienteDocumento } from "@/services/clienteDocumentosService";
import { cn } from "@/lib/utils";

export interface PendingClienteDocumento {
  id: string;
  file: File;
  tipo: ClienteDocumentoTipo;
}

interface Props {
  clienteId?: string | null;
  editable: boolean;
  compact?: boolean;
  pending?: PendingClienteDocumento[];
  onPendingChange?: (next: PendingClienteDocumento[]) => void;
}

export function ClienteDocumentosPanel({
  clienteId,
  editable,
  compact = false,
  pending = [],
  onPendingChange,
}: Props) {
  const [tipo, setTipo] = useState<ClienteDocumentoTipo>("contrato");
  const [paraExcluir, setParaExcluir] = useState<ClienteDocumento | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const docsQ = useClienteDocumentos(clienteId, !!clienteId);
  const upload = useUploadClienteDocumento(clienteId);
  const remove = useDeleteClienteDocumento(clienteId);
  const docs = docsQ.data ?? [];

  const adicionarArquivos = async (files: FileList | File[]) => {
    const lista = Array.from(files);
    if (lista.length === 0) return;

    if (!clienteId) {
      const aceitos: PendingClienteDocumento[] = [];
      for (const file of lista) {
        const erro = validarArquivoClienteDocumento(file);
        if (erro) {
          toast.error(erro);
          continue;
        }
        aceitos.push({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, tipo });
      }
      if (aceitos.length) onPendingChange?.([...pending, ...aceitos]);
      return;
    }

    for (const file of lista) {
      const erro = validarArquivoClienteDocumento(file);
      if (erro) {
        toast.error(erro);
        continue;
      }
      await upload.mutateAsync({ file, tipo });
    }
  };

  const abrir = async (path: string) => {
    try {
      const url = await urlClienteDocumento(path);
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir o documento.");
    }
  };

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className={cn("flex flex-wrap items-end gap-2", compact && "gap-1.5")}>
        {editable && (
          <>
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-[11px]">Tipo do documento</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as ClienteDocumentoTipo)}>
                <SelectTrigger aria-label="Tipo do documento" className={cn(compact && "h-8 text-xs")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENTE_DOCUMENTO_TIPOS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              className="gap-1.5"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {upload.isPending ? "Enviando..." : "Anexar arquivos"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={CLIENTE_DOCUMENTO_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) void adicionarArquivos(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </>
        )}
      </div>

      {docs.length === 0 && pending.length === 0 ? (
        compact ? (
          <p className="text-[11px] text-muted-foreground">
            Nenhum anexo ainda. Contrato, procuração, contrato social e certidões entram aqui.
          </p>
        ) : (
          <EmptyState
            icon={<FileText className="w-5 h-5 text-ink-35" />}
            title="Nenhum documento anexado"
            subtitle="Contrato, procuração, contrato social e certidões ficam listados nesta aba."
          />
        )
      ) : (
        <ul className={cn("divide-y rounded-lg border", compact && "max-h-40 overflow-y-auto")}>
          {pending.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-ink-35" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {CLIENTE_DOCUMENTO_TIPO_LABEL[item.tipo]} · {formatDocumentoBytes(item.file.size)} · envia ao salvar
                </p>
              </div>
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Remover ${item.file.name}`}
                  onClick={() => onPendingChange?.(pending.filter((p) => p.id !== item.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-ink-35" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.nome_arquivo}</p>
                <p className="text-[11px] text-muted-foreground">
                  {CLIENTE_DOCUMENTO_TIPO_LABEL[doc.tipo] ?? doc.tipo} · {formatDocumentoBytes(doc.tamanho_bytes)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Baixar ${doc.nome_arquivo}`}
                onClick={() => void abrir(doc.storage_path)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Excluir ${doc.nome_arquivo}`}
                  onClick={() => setParaExcluir(doc)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!paraExcluir} onOpenChange={(open) => !open && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento</AlertDialogTitle>
            <AlertDialogDescription>
              Remover <strong>{paraExcluir?.nome_arquivo}</strong> da ficha deste cliente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!paraExcluir) return;
                await remove.mutateAsync(paraExcluir);
                setParaExcluir(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
