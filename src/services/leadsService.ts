import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { EnvioDiagnosticoResultado } from "@/lib/diagnostico-whatsapp";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadsImportacaoInsert = Database["public"]["Tables"]["leads_importacoes"]["Insert"];
type LeadsImportacaoUpdate = Database["public"]["Tables"]["leads_importacoes"]["Update"];
export type LeadUpdatePayload = Pick<
  Database["public"]["Tables"]["leads"]["Update"],
  | "nome"
  | "empresa"
  | "cnpj"
  | "email"
  | "whatsapp"
  | "regime_tributario"
  | "segmento"
  | "faturamento_faixa"
  | "observacoes"
  | "produto"
  | "sdr_id"
  | "closer_id"
>;

export async function listLeads() {
  // O embed de relatorios_leads vem ordenado e limitado a 1: o painel lê
  // `relatorios_leads[0]` e, sem ordem, leads com linhas antigas (antes do
  // índice único) mostravam um diagnóstico qualquer.
  const { data, error } = await supabase
    .from("leads")
    .select("*, relatorios_leads(estimativa_total_minima, estimativa_total_maxima, teses_identificadas, criado_em, enviado_whatsapp, enviado_em)")
    .order("criado_em", { ascending: false })
    .order("criado_em", { referencedTable: "relatorios_leads", ascending: false })
    .limit(1, { referencedTable: "relatorios_leads" });
  if (error) throw error;
  return data;
}

export async function listLeadsBasic(statusFilter?: string) {
  let query = supabase
    .from("leads")
    .select("id, nome, empresa, cnpj, score_lead, status, criado_em, segmento, produto, sdr_id, closer_id, faturamento_faixa, regime_tributario")
    .order("criado_em", { ascending: false });
  if (statusFilter && statusFilter !== "todos") {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getLeadExceptions() {
  const { data, error } = await supabase
    .from("lead_historico")
    .select("lead_id")
    .ilike("anotacao", "⚠ EXCEÇÃO:%");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.lead_id));
}

export async function createLead(lead: LeadInsert) {
  const { data, error } = await supabase.from("leads").insert(lead).select().single();
  if (error) throw error;
  return data as Lead;
}

export async function updateLeadStatus(id: string, statusFunil: string) {
  const { error } = await supabase
    .from("leads")
    .update({ status_funil: statusFunil, status_funil_atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getLead(id: string) {
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, nome, empresa, cnpj, email, whatsapp, regime_tributario, segmento, faturamento_faixa, origem, observacoes, status_funil, produto, sdr_id, closer_id",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateLead(id: string, payload: LeadUpdatePayload) {
  const { error } = await supabase.from("leads").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteLeads(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from("leads").delete().in("id", ids);
  if (error) throw error;
}

/**
 * Erro de edge function com a mensagem do corpo ({ error }) em vez do genérico
 * "Edge Function returned a non-2xx status code" — o analyze-lead explica ali
 * o que falta no lead (faturamento, regime, Simples...).
 */
async function erroDaFuncao(error: unknown): Promise<Error> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body.error === "string") return new Error(body.error);
    } catch {
      /* corpo não é JSON: cai na mensagem original */
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Gera/regera o diagnóstico (mesmo motor da landing page) e salva no lead. */
export async function analyzeLead(leadId: string) {
  const { data, error } = await supabase.functions.invoke("analyze-lead", {
    body: { lead_id: leadId },
  });
  if (error) throw await erroDaFuncao(error);
  return data as {
    success: boolean;
    token: string;
    score: number;
    estimativa_total_minima: number;
    estimativa_total_maxima: number;
    teses_count: number;
  };
}

/** Coloca na fila do Atendimento a mensagem com o link do diagnóstico. */
export async function enviarDiagnosticoWhatsapp(leadId: string): Promise<EnvioDiagnosticoResultado> {
  const { data, error } = await supabase.rpc("enviar_diagnostico_whatsapp", { p_lead_id: leadId });
  if (error) throw error;
  return (data ?? {}) as EnvioDiagnosticoResultado;
}

export interface AtribuicaoLeads {
  sdrId?: string | null;
  closerId?: string | null;
  /** Deixa o lead solto (sem SDR) mesmo que `sdrId` venha vazio. */
  limparSdr?: boolean;
  limparCloser?: boolean;
  produto?: string | null;
}

/**
 * Atribuição em lote. Só toca nos campos que a tela pediu: "manter atual"
 * = campo ausente. Passa direto pelo RLS de UPDATE em leads (admin/comercial/
 * sdr/gestor_comercial), por isso não há RPC.
 */
export async function atribuirLeads(ids: string[], atribuicao: AtribuicaoLeads) {
  if (ids.length === 0) return;
  const payload: Database["public"]["Tables"]["leads"]["Update"] = {};
  if (atribuicao.limparSdr) payload.sdr_id = null;
  else if (atribuicao.sdrId) payload.sdr_id = atribuicao.sdrId;
  if (atribuicao.limparCloser) payload.closer_id = null;
  else if (atribuicao.closerId) payload.closer_id = atribuicao.closerId;
  if (atribuicao.produto) payload.produto = atribuicao.produto;
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from("leads").update(payload).in("id", ids);
  if (error) throw error;
}

/** Chaves de duplicidade dos leads já no sistema (CNPJ, WhatsApp, e-mail). */
export async function listLeadsChavesDedupe() {
  const { data, error } = await supabase.from("leads").select("id, cnpj, whatsapp, email");
  if (error) throw error;
  return data ?? [];
}

export async function criarImportacaoLeads(importacao: LeadsImportacaoInsert) {
  const { data, error } = await supabase.from("leads_importacoes").insert(importacao).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function atualizarImportacaoLeads(id: string, payload: LeadsImportacaoUpdate) {
  const { error } = await supabase.from("leads_importacoes").update(payload).eq("id", id);
  if (error) throw error;
}

export const IMPORT_LEADS_CHUNK = 200;

/**
 * Insere em blocos de 200: um insert de 20k linhas estoura o tamanho do
 * request e, se falhar no meio, perderíamos tudo. Devolve ids inseridos e
 * erros por bloco; um bloco com erro não interrompe os demais.
 */
export async function inserirLeadsEmLote(
  leads: LeadInsert[],
  onProgresso?: (inseridos: number, total: number) => void,
): Promise<{ ids: { id: string; faturamento_faixa: string; regime_tributario: string }[]; erros: string[] }> {
  const ids: { id: string; faturamento_faixa: string; regime_tributario: string }[] = [];
  const erros: string[] = [];
  for (let i = 0; i < leads.length; i += IMPORT_LEADS_CHUNK) {
    const bloco = leads.slice(i, i + IMPORT_LEADS_CHUNK);
    const { data, error } = await supabase
      .from("leads")
      .insert(bloco)
      .select("id, faturamento_faixa, regime_tributario");
    if (error) {
      erros.push(`Linhas ${i + 1}–${i + bloco.length}: ${error.message}`);
    } else {
      ids.push(...(data ?? []));
    }
    onProgresso?.(Math.min(i + bloco.length, leads.length), leads.length);
  }
  return { ids, erros };
}
