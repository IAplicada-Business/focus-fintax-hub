import { supabase } from "@/integrations/supabase/client";
import {
  ESTEIRA_SLA_DIAS,
  ESTEIRA_STAGES,
  type EstagioEsteira,
  type EsteiraSlaMap,
} from "@/lib/esteira-constants";

export interface EsteiraSlaConfigRow {
  estagio: EstagioEsteira;
  label: string;
  sla_dias: number | null;
  ordem: number;
  ativo: boolean;
  atualizado_em?: string;
}

/** Defaults locais se a tabela ainda não existir / RLS bloquear. */
export function defaultEsteiraSlaConfig(): EsteiraSlaConfigRow[] {
  return ESTEIRA_STAGES.map((s, i) => ({
    estagio: s.value,
    label: s.label,
    sla_dias: ESTEIRA_SLA_DIAS[s.value],
    ordem: i + 1,
    ativo: true,
  }));
}

export function configToSlaMap(rows: EsteiraSlaConfigRow[]): EsteiraSlaMap {
  const map: EsteiraSlaMap = {};
  for (const r of rows) map[r.estagio] = r.sla_dias;
  return map;
}

export async function listEsteiraSlaConfig(): Promise<EsteiraSlaConfigRow[]> {
  const { data, error } = await (supabase as any)
    .from("esteira_sla_config")
    .select("estagio, label, sla_dias, ordem, ativo, atualizado_em")
    .order("ordem", { ascending: true });

  if (error || !data?.length) {
    if (error) {
      console.warn("esteira_sla_config indisponível — usando defaults", error.message);
    }
    return defaultEsteiraSlaConfig();
  }

  const byEstagio = new Map(
    (data as EsteiraSlaConfigRow[]).map((r) => [r.estagio, r]),
  );

  // Garante ordem/cobertura do enum do app (inclui etapas novas ainda não seedadas).
  return ESTEIRA_STAGES.map((s, i) => {
    const row = byEstagio.get(s.value);
    return (
      row ?? {
        estagio: s.value,
        label: s.label,
        sla_dias: ESTEIRA_SLA_DIAS[s.value],
        ordem: i + 1,
        ativo: true,
      }
    );
  }).sort((a, b) => a.ordem - b.ordem);
}

export type EsteiraSlaConfigUpdate = {
  estagio: EstagioEsteira;
  sla_dias: number | null;
  label?: string;
  ordem?: number;
  ativo?: boolean;
};

export async function updateEsteiraSlaConfig(
  updates: EsteiraSlaConfigUpdate[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const u of updates) {
    const payload: Record<string, unknown> = {
      sla_dias: u.sla_dias,
      atualizado_em: now,
    };
    if (u.label != null) payload.label = u.label;
    if (u.ordem != null) payload.ordem = u.ordem;
    if (u.ativo != null) payload.ativo = u.ativo;

    const { error } = await (supabase as any)
      .from("esteira_sla_config")
      .update(payload)
      .eq("estagio", u.estagio);

    if (error) throw error;
  }
}
