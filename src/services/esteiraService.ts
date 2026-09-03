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
  criado_em: string;
  /** Ramos agregados (Épica 3); opcional até a migration. */
  tem_ramo_compensacao?: boolean;
  tem_ramo_ressarcimento?: boolean;
  tem_ramo_judicial?: boolean;
  /** Fase 1 (03/09/2026): contador de nova abordagem, motivo de parada e teses assinadas. */
  tentativas_abordagem?: number;
  motivo_parada?: string | null;
  teses_assinadas?: number;
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
