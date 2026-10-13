import { supabase } from "@/integrations/supabase/client";

export interface DestinatarioComercial {
  user_id: string;
  full_name: string | null;
  cargo: string | null;
  papel: string;
  tem_whatsapp: boolean;
  tem_email: boolean;
  trouxe_o_lead: boolean;
}

export type DestinoEnvioComercial = "todos" | "especifico";

export interface ResultadoEnvioComercial {
  user_id: string;
  nome: string | null;
  /** "enviado" ou o motivo (sem_numero, sem_email, email_nao_configurado, erro da API). */
  whatsapp: string;
  email: string;
}

/** Time comercial que pode receber o cliente, com quem trouxe o lead marcado. */
export async function listDestinatariosComerciais(clienteId: string): Promise<DestinatarioComercial[]> {
  // RPC nova (migração 20261013120000), ainda fora dos tipos gerados.
  const client = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
  };
  const { data, error } = await client.rpc("equipe_comercial_destinatarios", {
    p_cliente_id: clienteId,
  });
  if (error) throw error;
  return (data ?? []) as DestinatarioComercial[];
}

export async function enviarParaEquipeComercial(params: {
  clienteId: string;
  destino: DestinoEnvioComercial;
  comercialId?: string | null;
  observacao?: string;
}): Promise<ResultadoEnvioComercial[]> {
  const { data, error } = await supabase.functions.invoke("notificar-equipe-comercial", {
    body: {
      cliente_id: params.clienteId,
      destino: params.destino,
      comercial_id: params.destino === "especifico" ? params.comercialId : null,
      observacao: params.observacao?.trim() || null,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.resultados ?? []) as ResultadoEnvioComercial[];
}

/** Resumo legível do envio para o toast. */
export function resumirEnvioComercial(resultados: ResultadoEnvioComercial[]): {
  titulo: string;
  detalhe: string;
  algumEnviado: boolean;
} {
  const whats = resultados.filter((r) => r.whatsapp === "enviado").length;
  const emails = resultados.filter((r) => r.email === "enviado").length;
  const pendencias = resultados.flatMap((r) => {
    const nome = r.nome || "Comercial";
    const itens: string[] = [];
    if (r.whatsapp === "sem_numero") itens.push(`${nome} sem WhatsApp cadastrado`);
    else if (r.whatsapp !== "enviado") itens.push(`WhatsApp de ${nome} falhou (${r.whatsapp})`);
    if (r.email === "email_nao_configurado") itens.push("e-mail ainda não configurado no servidor");
    else if (r.email === "sem_email") itens.push(`${nome} sem e-mail`);
    else if (r.email !== "enviado") itens.push(`e-mail de ${nome} falhou (${r.email})`);
    return itens;
  });
  const unicas = [...new Set(pendencias)];
  return {
    titulo: `Enviado para ${resultados.length} ${resultados.length === 1 ? "comercial" : "comerciais"}`,
    detalhe: [`WhatsApp: ${whats} · E-mail: ${emails}`, ...unicas].join(" · "),
    algumEnviado: whats + emails > 0,
  };
}
