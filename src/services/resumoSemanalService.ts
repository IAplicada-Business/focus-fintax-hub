import { supabase } from "@/integrations/supabase/client";
import type { ModeloResumo, ResumoSemanalDados } from "@/lib/resumo-semanal";

export interface ResumoDestinatario {
  id: string;
  nome: string | null;
  whatsapp: string;
  ativo: boolean;
  criado_em: string;
}

export interface ResumoEnvio {
  id: string;
  tipo: string;
  periodo_inicio: string;
  periodo_fim: string;
  destinatario: string;
  mensagem: string;
  status: string;
  erro: string | null;
  executado_em: string;
}

export interface ResultadoEnvioResumo {
  ok: boolean;
  tipo: string;
  modelo?: string;
  enviados: number;
  falhas: number;
  comparou_com_segunda?: boolean;
  aviso?: string;
  resultados?: { destinatario: string; status: string; erro: string | null }[];
}

export async function listResumoDestinatarios(): Promise<ResumoDestinatario[]> {
  const { data, error } = await supabase
    .from("resumo_semanal_destinatarios")
    .select("*")
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ResumoDestinatario[];
}

export async function addResumoDestinatario(input: { nome: string; whatsapp: string }) {
  const { error } = await supabase
    .from("resumo_semanal_destinatarios")
    .insert({ nome: input.nome.trim() || null, whatsapp: input.whatsapp.trim(), ativo: true });
  if (error) throw error;
}

export async function setResumoDestinatarioAtivo(id: string, ativo: boolean) {
  const { error } = await supabase.from("resumo_semanal_destinatarios").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function removeResumoDestinatario(id: string) {
  const { error } = await supabase.from("resumo_semanal_destinatarios").delete().eq("id", id);
  if (error) throw error;
}

export async function listResumoEnvios(limite = 10): Promise<ResumoEnvio[]> {
  const { data, error } = await supabase
    .from("resumo_semanal_envios")
    .select("id, tipo, periodo_inicio, periodo_fim, destinatario, mensagem, status, erro, executado_em")
    .order("executado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as ResumoEnvio[];
}

/** Foto consolidada que alimenta a mensagem (só admin/pmo — a RPC valida). */
export async function previewResumoDados(modelo: ModeloResumo, referencia?: string | null): Promise<ResumoSemanalDados> {
  const { data, error } = await supabase.rpc("resumo_semanal_dados", {
    p_tipo: modelo,
    p_referencia: referencia ?? undefined,
  });
  if (error) throw error;
  return data as unknown as ResumoSemanalDados;
}

/** Último snapshot de segunda da mesma semana, pro preview da sexta comparar. */
export async function getSnapshotSegunda(periodoInicio: string): Promise<ResumoSemanalDados | null> {
  const { data, error } = await supabase
    .from("resumo_semanal_envios")
    .select("dados")
    .eq("tipo", "segunda")
    .eq("periodo_inicio", periodoInicio)
    .not("dados", "is", null)
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.dados as unknown as ResumoSemanalDados | null) ?? null;
}

export async function enviarResumoTeste(params: { whatsapp: string; modelo: ModeloResumo }): Promise<ResultadoEnvioResumo> {
  const { data, error } = await supabase.functions.invoke("resumo-semanal", {
    body: { tipo: "teste", modelo: params.modelo, destinatarios: [params.whatsapp] },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as ResultadoEnvioResumo;
}
