import { supabase } from "@/integrations/supabase/client";
import {
  normalizarStatusCompensacao,
  type ProcessoTipoRecuperacaoRow,
  type StatusCompensacaoRow,
} from "@/lib/gerencial-filters";
import type { Database } from "@/integrations/supabase/types";
import type {
  ClienteStatusCompensacao,
} from "@/lib/client-operation";
import type { EstagioEsteira } from "@/lib/esteira-constants";

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

export async function updateClienteMotivoParada(id: string, motivoParada: string | null) {
  const { data, error } = await supabase
    .from("clientes")
    .update({
      motivo_parada: motivoParada,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select("motivo_parada")
    .single();
  if (error) throw error;
  return data.motivo_parada;
}

export interface ClienteResponsavelElegivel {
  user_id: string;
  full_name: string;
  cargo: string | null;
}

export async function listClienteResponsaveisElegiveis(): Promise<
  ClienteResponsavelElegivel[]
> {
  const { data, error } = await supabase.rpc("cliente_responsaveis_elegiveis");
  if (error) throw error;
  return (data ?? []) as ClienteResponsavelElegivel[];
}

export interface ClienteOperacaoUpdate {
  clienteId: string;
  statusCompensacao?: ClienteStatusCompensacao;
  estagio?: EstagioEsteira;
  responsavelId?: string;
}

export async function updateClienteOperacao({
  clienteId,
  statusCompensacao,
  estagio,
  responsavelId,
}: ClienteOperacaoUpdate): Promise<Cliente> {
  const { data, error } = await supabase.rpc("cliente_atualizar_operacao", {
    p_cliente_id: clienteId,
    ...(statusCompensacao ? { p_status_compensacao: statusCompensacao } : {}),
    ...(estagio ? { p_estagio: estagio } : {}),
    ...(responsavelId
      ? { p_responsavel_id: responsavelId, p_atualizar_responsavel: true }
      : {}),
  });
  if (error) throw error;
  return data as Cliente;
}

export async function listProcessosTeses() {
  const { data, error } = await supabase
    .from("processos_teses")
    .select("id, cliente_id, valor_credito, status_contrato, status_processo, criado_em, atualizado_em, tese, nome_exibicao, categoria, tipo_recuperacao")
    .limit(5000);
  if (error) throw error;
  return data;
}

export async function listCompensacoesMensais() {
  const { data, error } = await supabase
    .from("compensacoes_mensais")
    .select("cliente_id, mes_referencia, valor_compensado, honorario_valor, valor_nf_servico, tese_origem_id, processo_tese_id, tributo_enum, tributo, criado_em")
    .limit(5000);
  if (error) throw error;
  return data;
}

export async function listCreditosApurados() {
  const { data, error } = await supabase
    .from("creditos_apurados")
    .select("cliente_id, tese_id, valor_apurado_inicial, valor_compensado_manual, incluir_no_calculo")
    .limit(5000);
  if (error) throw error;
  return data;
}

export async function listTesesParaCalculo() {
  const { data, error } = await supabase
    .from("teses_tributarias")
    .select("id, codigo, label, incluir_no_calculo")
    .limit(500);
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

export async function deleteCompensacoes(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from("compensacoes_mensais").delete().in("id", ids);
  if (error) throw error;
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
    .select("status_principal, tem_reporto, tem_tese_ativa, tem_compensacao_mes_corrente, todos_encerrados, ultima_competencia_compensada")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    status_principal: normalizarStatusCompensacao(data as StatusCompensacaoRow),
  } as {
    status_principal: string | null;
    tem_reporto: boolean | null;
    tem_tese_ativa: boolean | null;
    ultima_competencia_compensada: string | null;
  };
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
  const db = supabase as any;
  const [statusRes, processosRes] = await Promise.all([
    db
      .from("v_clientes_status_compensacao")
      .select("cliente_id, status_principal, tem_compensacao_mes_corrente, tem_tese_ativa, todos_encerrados, tem_reporto"),
    supabase
      .from("processos_teses")
      .select("cliente_id, tipo_recuperacao, status_contrato, status_processo"),
  ]);
  if (statusRes.error) throw statusRes.error;
  if (processosRes.error) throw processosRes.error;

  const processosPorCliente = new Map<string, typeof processosRes.data>();
  for (const processo of processosRes.data ?? []) {
    const atuais = processosPorCliente.get(processo.cliente_id) ?? [];
    atuais.push(processo);
    processosPorCliente.set(processo.cliente_id, atuais);
  }
  return (statusRes.data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    status_principal: normalizarStatusCompensacao(row as unknown as StatusCompensacaoRow),
    processos: processosPorCliente.get(row.cliente_id as string) ?? [],
  })) as (StatusCompensacaoRow & { processos: ProcessoTipoRecuperacaoRow[] })[];
}
