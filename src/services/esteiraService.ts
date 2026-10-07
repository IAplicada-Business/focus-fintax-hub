import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { EstagioEsteira } from "@/lib/esteira-constants";

export interface EsteiraCliente {
  id: string;
  empresa: string;
  cnpj: string;
  segmento: string;
  regime_tributario: string;
  estagio_esteira: string;
  data_entrada_estagio: string;
  dias_na_etapa: number;
  /** Presente após migration do painel SLA; opcional no fallback. */
  sla_dias?: number | null;
  atrasado?: boolean;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  origem: string;
  status: string;
  status_operacional: string | null;
  /** Status geral da ficha; presente após a migration que dispensa a triagem de quem já opera. */
  status_compensacao?: string | null;
  criado_em: string;
  /** Ramos agregados (Épica 3); opcional até a migration. */
  tem_ramo_compensacao?: boolean;
  tem_ramo_ressarcimento?: boolean;
  tem_ramo_judicial?: boolean;
  /** Fase 1 (03/09/2026): contador de nova abordagem, motivo de parada e teses assinadas. */
  tentativas_abordagem?: number;
  motivo_parada?: string | null;
  teses_assinadas?: number;
  /** Fase 2: última ação em cliente_historico (null se nunca registrada). */
  ultima_acao_em?: string | null;
  ultima_acao_descricao?: string | null;
  ultima_acao_tipo?: string | null;
  triagem_realizada?: boolean | null;
  triagem_documento_path?: string | null;
  triagem_documento_nome?: string | null;
}

export async function listEsteiraClientes() {
  const { data, error } = await supabase
    .from("v_esteira_clientes")
    .select("*")
    .order("data_entrada_estagio", { ascending: true });
  if (error) throw error;
  return data as EsteiraCliente[];
}

export async function updateEstagioEsteira(clienteId: string, estagio: EstagioEsteira) {
  const { error } = await supabase
    .from("clientes")
    .update({ estagio_esteira: estagio })
    .eq("id", clienteId);
  if (error) throw error;
}

export async function updateTriagemRealizada(clienteId: string, realizada: boolean) {
  const { error } = await supabase
    .from("clientes")
    .update({ triagem_realizada: realizada, atualizado_em: new Date().toISOString() })
    .eq("id", clienteId);
  if (error) throw error;
}

const BUCKET_TRIAGEM = "cliente-documentos";

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "documento";
}

export async function uploadTriagemDocumento(clienteId: string, file: File) {
  const path = `${clienteId}/triagem/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET_TRIAGEM).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) throw upErr;
  const { error } = await supabase
    .from("clientes")
    .update({
      triagem_documento_path: path,
      triagem_documento_nome: file.name,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", clienteId);
  if (error) throw error;
  return { path, nome: file.name };
}

export async function urlTriagemDocumento(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET_TRIAGEM).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export interface EsteiraResponsavel {
  user_id: string;
  full_name: string;
  cargo: string | null;
}

/** Usuários ativos elegíveis a responsável por cliente na esteira. */
export async function listEsteiraResponsaveis(): Promise<EsteiraResponsavel[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, cargo")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EsteiraResponsavel[];
}

export interface RealocacaoItem {
  cliente_id: string;
  /** Omitido/null = não muda de etapa. */
  estagio?: EstagioEsteira | null;
  /** Omitido/null = mantém o responsável atual. */
  responsavel_id?: string | null;
  /** Omitido/null = mantém o segmento atual. */
  segmento?: string | null;
}

/** RPC `esteira_aplicar_realocacao` — só admin/pmo; audita em cliente_historico. */
export async function aplicarRealocacaoEsteira(
  itens: RealocacaoItem[],
  motivo?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("esteira_aplicar_realocacao", {
    p_itens: itens as unknown as Json,
    p_motivo: motivo,
  });
  if (error) throw error;
  return data ?? 0;
}

/** RPC `esteira_reiniciar_sla` — zera o contador sem mudar etapa; só admin/pmo. */
export async function reiniciarSlaEsteira(clienteIds: string[], motivo?: string): Promise<number> {
  const { data, error } = await supabase.rpc("esteira_reiniciar_sla", {
    p_cliente_ids: clienteIds,
    p_motivo: motivo,
  });
  if (error) throw error;
  return data ?? 0;
}

export interface EsteiraHistoricoItem {
  id: string;
  cliente_id: string;
  estagio: string;
  entrou_em: string;
  saiu_em: string | null;
  origem: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
}

/** Permanências do cliente na esteira, mais recente primeiro, com nome do responsável. */
export async function listEsteiraHistorico(clienteId: string): Promise<EsteiraHistoricoItem[]> {
  const { data, error } = await supabase
    .from("esteira_historico")
    .select("id, cliente_id, estagio, entrou_em, saiu_em, origem, responsavel_id")
    .eq("cliente_id", clienteId)
    .order("entrou_em", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Omit<EsteiraHistoricoItem, "responsavel_nome">[];

  const ids = [...new Set(rows.map((r) => r.responsavel_id).filter((v): v is string => !!v))];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
    for (const p of profiles ?? []) nomes.set(p.user_id, p.full_name);
  }
  return rows.map((r) => ({ ...r, responsavel_nome: r.responsavel_id ? nomes.get(r.responsavel_id) ?? null : null }));
}

export interface EsteiraClienteResumo {
  estagio_esteira: string | null;
  data_entrada_estagio: string | null;
  dias_na_etapa: number | null;
  sla_dias: number | null;
  atrasado: boolean | null;
  responsavel_nome: string | null;
  motivo_parada: string | null;
}

/**
 * Posição de um único cliente na esteira (etapa, dias, SLA, atrasado).
 * Retorna null quando a view não está disponível pro papel do usuário —
 * a ficha do cliente então mostra só a etapa gravada no cadastro.
 */
export async function getEsteiraCliente(clienteId: string): Promise<EsteiraClienteResumo | null> {
  const { data, error } = await supabase
    .from("v_esteira_clientes")
    .select("estagio_esteira, data_entrada_estagio, dias_na_etapa, sla_dias, atrasado, responsavel_nome, motivo_parada")
    .eq("id", clienteId)
    .maybeSingle();
  if (error) return null;
  return (data as EsteiraClienteResumo | null) ?? null;
}
