import { supabase } from "@/integrations/supabase/client";
import type { CanalBrief, ClienteBrief, ResultadoBrief } from "@/lib/brief-cliente";

/** Contato do cliente pro diálogo do brief (a view da esteira não traz esses campos). */
export async function getClienteContatoBrief(clienteId: string): Promise<ClienteBrief> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, empresa, nome_contato, whatsapp, email")
    .eq("id", clienteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrado");
  return data as ClienteBrief;
}

export async function enviarBriefCliente(params: {
  clienteId: string;
  canais: CanalBrief[];
  textoWhatsapp?: string;
  assunto?: string;
  html?: string;
}): Promise<ResultadoBrief> {
  const { data, error } = await supabase.functions.invoke("enviar-brief-cliente", {
    body: {
      cliente_id: params.clienteId,
      canais: params.canais,
      texto_whatsapp: params.textoWhatsapp?.trim() || null,
      assunto: params.assunto?.trim() || null,
      html: params.html?.trim() || null,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.resultados ?? { whatsapp: "nao_selecionado", email: "nao_selecionado" }) as ResultadoBrief;
}
