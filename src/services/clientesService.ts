import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Cliente = Database["public"]["Tables"]["clientes"]["Row"];

export async function listClientes() {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data as Cliente[];
}

export async function getCliente(id: string) {
  const { data, error } = await supabase.from("clientes").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Cliente;
}

export async function listProcessosTeses() {
  const { data, error } = await supabase
    .from("processos_teses")
    .select("id, cliente_id, valor_credito, status_contrato, status_processo, criado_em, atualizado_em, tese, nome_exibicao")
    .limit(5000);
  if (error) throw error;
  return data;
}

export async function listCompensacoesMensais() {
  const { data, error } = await supabase
    .from("compensacoes_mensais")
    .select("cliente_id, valor_compensado, processo_tese_id")
    .limit(5000);
  if (error) throw error;
  return data;
}

export async function deleteCliente(id: string) {
  await supabase.from("compensacoes_mensais").delete().eq("cliente_id", id);
  await supabase.from("processos_teses").delete().eq("cliente_id", id);
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw error;
}
