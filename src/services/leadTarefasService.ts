import { supabase } from "@/integrations/supabase/client";
import type { LeadTarefa, TipoTarefa } from "@/lib/lead-tarefas";

const COLUNAS = "id, lead_id, titulo, descricao, tipo, vence_em, responsavel_id, concluida_em, criado_por, criado_em";

/** Todas as tarefas de um lead (abertas e concluídas) — aba Tarefas do card. */
export async function listTarefasDoLead(leadId: string): Promise<LeadTarefa[]> {
  const { data, error } = await supabase
    .from("lead_tarefas")
    .select(COLUNAS)
    .eq("lead_id", leadId)
    .order("vence_em", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as LeadTarefa[];
}

/**
 * Tarefas abertas de todos os leads numa leitura só: alimenta o badge do
 * kanban e o lembrete "Minhas tarefas" (filtrado no cliente) sem uma
 * consulta por card nem um `.in()` gigante com os ids do quadro.
 */
export async function listTarefasAbertas(): Promise<LeadTarefa[]> {
  const { data, error } = await supabase
    .from("lead_tarefas")
    .select(COLUNAS)
    .is("concluida_em", null)
    .order("vence_em", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as LeadTarefa[];
}

export interface NovaTarefaInput {
  lead_id: string;
  titulo: string;
  tipo: TipoTarefa;
  vence_em: string;
  responsavel_id: string | null;
  descricao?: string | null;
}

/** O histórico ("Tarefa criada: …") é gravado pelo trigger do banco. */
export async function criarTarefa(input: NovaTarefaInput): Promise<LeadTarefa> {
  const { data, error } = await supabase
    .from("lead_tarefas")
    .insert({
      lead_id: input.lead_id,
      titulo: input.titulo.trim(),
      tipo: input.tipo,
      vence_em: input.vence_em,
      responsavel_id: input.responsavel_id,
      descricao: input.descricao?.trim() || null,
    })
    .select(COLUNAS)
    .single();
  if (error) throw error;
  return data as LeadTarefa;
}

/** Marca como concluída (agora) ou reabre. */
export async function concluirTarefa(id: string, concluida: boolean): Promise<void> {
  const { error } = await supabase
    .from("lead_tarefas")
    .update({ concluida_em: concluida ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function excluirTarefa(id: string): Promise<void> {
  const { error } = await supabase.from("lead_tarefas").delete().eq("id", id);
  if (error) throw error;
}
