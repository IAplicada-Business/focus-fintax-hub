import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export async function listLeads() {
  const { data, error } = await supabase
    .from("leads")
    .select("*, relatorios_leads(estimativa_total_minima, estimativa_total_maxima, teses_identificadas)")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listLeadsBasic(statusFilter?: string) {
  let query = supabase
    .from("leads")
    .select("id, nome, empresa, cnpj, score_lead, status, criado_em, segmento")
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

export async function analyzeLead(leadId: string) {
  const { data, error } = await supabase.functions.invoke("analyze-lead", {
    body: { lead_id: leadId },
  });
  if (error) throw error;
  return data;
}
