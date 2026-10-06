import { supabase } from "@/integrations/supabase/client";
import {
  CLIENTE_DOCUMENTOS_BUCKET,
  pathClienteDocumento,
  validarArquivoClienteDocumento,
  type ClienteDocumentoTipo,
} from "@/lib/cliente-documentos";

export interface ClienteDocumento {
  id: string;
  cliente_id: string;
  tipo: ClienteDocumentoTipo;
  nome_arquivo: string;
  storage_path: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  criado_por: string | null;
  criado_em: string;
}

export async function listClienteDocumentos(clienteId: string) {
  const { data, error } = await supabase
    .from("cliente_documentos")
    .select("id, cliente_id, tipo, nome_arquivo, storage_path, mime_type, tamanho_bytes, criado_por, criado_em")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClienteDocumento[];
}

export async function uploadClienteDocumento(params: {
  clienteId: string;
  file: File;
  tipo: ClienteDocumentoTipo;
}) {
  const invalido = validarArquivoClienteDocumento(params.file);
  if (invalido) throw new Error(invalido);

  const path = pathClienteDocumento(params.clienteId, params.tipo, params.file.name);
  const { error: upErr } = await supabase.storage.from(CLIENTE_DOCUMENTOS_BUCKET).upload(path, params.file, {
    upsert: false,
    contentType: params.file.type || undefined,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("cliente_documentos")
    .insert({
      cliente_id: params.clienteId,
      tipo: params.tipo,
      nome_arquivo: params.file.name,
      storage_path: path,
      mime_type: params.file.type || null,
      tamanho_bytes: params.file.size,
    })
    .select("id, cliente_id, tipo, nome_arquivo, storage_path, mime_type, tamanho_bytes, criado_por, criado_em")
    .single();
  if (error) {
    await supabase.storage.from(CLIENTE_DOCUMENTOS_BUCKET).remove([path]);
    throw error;
  }
  return data as ClienteDocumento;
}

export async function deleteClienteDocumento(doc: Pick<ClienteDocumento, "id" | "storage_path">) {
  const { error } = await supabase.from("cliente_documentos").delete().eq("id", doc.id);
  if (error) throw error;
  const { error: stErr } = await supabase.storage.from(CLIENTE_DOCUMENTOS_BUCKET).remove([doc.storage_path]);
  if (stErr) throw stErr;
}

export async function urlClienteDocumento(path: string) {
  const { data, error } = await supabase.storage.from(CLIENTE_DOCUMENTOS_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
