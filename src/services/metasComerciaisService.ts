import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  mesParaData,
  type EscopoMeta,
  type MetaComercialRow,
  type MetricaMeta,
  type RealizadoSdrRow,
} from "@/lib/metas-comerciais";

export interface MetasComerciaisMes {
  /** `YYYY-MM` consultado. */
  mes: string;
  realizado: RealizadoSdrRow[];
  metas: MetaComercialRow[];
}

/**
 * Realizado (RPC, lê lead_historico + leads no fuso de SP) e metas do mês
 * numa leitura só. Tabela/RPC ainda não migradas → lista vazia com aviso,
 * pra não derrubar o Dashboard inteiro.
 */
export async function fetchMetasComerciaisMes(mes: string): Promise<MetasComerciaisMes> {
  const pMes = mesParaData(mes);
  const [realizadoRes, metasRes] = await Promise.all([
    supabase.rpc("metas_comerciais_realizado", { p_mes: pMes }),
    supabase
      .from("metas_comerciais")
      .select("escopo, user_id, mes, reunioes_agendadas, reunioes_realizadas, leads_novos, contratos")
      .eq("mes", pMes),
  ]);

  if (realizadoRes.error) {
    console.warn("metas_comerciais_realizado indisponível", realizadoRes.error.message);
  }
  if (metasRes.error) {
    console.warn("metas_comerciais indisponível", metasRes.error.message);
  }

  return {
    mes,
    realizado: (realizadoRes.data ?? []).map((r) => ({
      user_id: r.user_id ?? null,
      full_name: r.full_name ?? null,
      reunioes_agendadas: Number(r.reunioes_agendadas ?? 0),
      reunioes_realizadas: Number(r.reunioes_realizadas ?? 0),
      leads_novos: Number(r.leads_novos ?? 0),
      contratos: Number(r.contratos ?? 0),
    })),
    metas: (metasRes.data ?? []).map((m) => ({
      escopo: (m.escopo === "equipe" ? "equipe" : "sdr") as EscopoMeta,
      user_id: m.user_id ?? null,
      mes: m.mes,
      reunioes_agendadas: m.reunioes_agendadas ?? null,
      reunioes_realizadas: m.reunioes_realizadas ?? null,
      leads_novos: m.leads_novos ?? null,
      contratos: m.contratos ?? null,
    })),
  };
}

export interface SalvarMetaComercialInput {
  escopo: EscopoMeta;
  /** null para a meta da equipe. */
  userId: string | null;
  /** `YYYY-MM`. */
  mes: string;
  metrica: MetricaMeta;
  valor: number | null;
}

/**
 * Upsert de um único campo da meta (escopo, user_id, mes). O ON CONFLICT só
 * atualiza as colunas enviadas, então editar "agendadas" não zera "realizadas".
 */
export async function salvarMetaComercial(input: SalvarMetaComercialInput): Promise<void> {
  const payload: Database["public"]["Tables"]["metas_comerciais"]["Insert"] = {
    escopo: input.escopo,
    user_id: input.escopo === "equipe" ? null : input.userId,
    mes: mesParaData(input.mes),
    atualizado_em: new Date().toISOString(),
  };
  payload[input.metrica] = input.valor;
  const { error } = await supabase.from("metas_comerciais").upsert(payload, { onConflict: "escopo,user_id,mes" });
  if (error) throw error;
}
