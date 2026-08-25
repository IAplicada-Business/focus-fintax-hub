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

export async function getClienteProcessos(clienteId: string) {
  const { data, error } = await supabase
    .from("processos_teses")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("criado_em");
  if (error) throw error;
  return data ?? [];
}

export async function getClienteCompensacoes(clienteId: string) {
  const { data, error } = await supabase
    .from("compensacoes_mensais")
    .select(
      "*, processos_teses:processo_tese_id(id, tese, nome_exibicao, categoria, percentual_honorario, valor_credito), dcomps(id, numero_declaracao)",
    )
    .eq("cliente_id", clienteId)
    .order("mes_referencia", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getClienteCreditos(clienteId: string) {
  const { data, error } = await (supabase as any)
    .from("creditos_apurados")
    .select("tese_id, valor_apurado_inicial, incluir_no_calculo")
    .eq("cliente_id", clienteId);
  if (error) throw error;
  return (data ?? []) as {
    tese_id: string;
    valor_apurado_inicial: number;
    incluir_no_calculo: boolean | null;
  }[];
}

export async function getClienteStatusCompensacao(clienteId: string) {
  const { data, error } = await (supabase as any)
    .from("v_clientes_status_compensacao")
    .select("status_principal, tem_reporto, tem_tese_ativa, ultima_competencia_compensada")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    status_principal: string | null;
    tem_reporto: boolean | null;
    tem_tese_ativa: boolean | null;
    ultima_competencia_compensada: string | null;
  } | null;
}

export async function listTesesTributarias() {
  const { data, error } = await (supabase as any)
    .from("teses_tributarias")
    .select("id, codigo, label");
  if (error) throw error;
  return (data ?? []) as { id: string; codigo: string | null; label: string | null }[];
}

export async function listMotorTesesAtivas() {
  const { data, error } = await supabase
    .from("motor_teses_config")
    .select("tese, nome_exibicao, tipo_recuperacao_padrao")
    .eq("ativo", true);
  if (error) throw error;
  return data ?? [];
}

export async function listStatusCompensacaoRows() {
  const { data, error } = await (supabase as any)
    .from("v_clientes_status_compensacao")
    .select("cliente_id, status_principal");
  if (error) throw error;
  return (data ?? []) as { cliente_id: string; status_principal: string }[];
}
