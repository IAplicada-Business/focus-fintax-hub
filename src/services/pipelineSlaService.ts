import { supabase } from "@/integrations/supabase/client";
import {
  PIPELINE_SLA_STAGES,
  PIPELINE_SLA_DIAS_DEFAULT,
  defaultPipelineSlaConfig,
  type EtapaFunil,
  type LeadFunilLike,
  type PipelineSlaConfigRow,
} from "@/lib/pipeline-sla";

/** Metas por etapa do funil; defaults locais se a tabela ainda não existir. */
export async function listPipelineSlaConfig(): Promise<PipelineSlaConfigRow[]> {
  const { data, error } = await supabase
    .from("pipeline_sla_config")
    .select("etapa, label, sla_dias, ordem, ativo")
    .order("ordem", { ascending: true });

  if (error || !data?.length) {
    if (error) console.warn("pipeline_sla_config indisponível — usando defaults", error.message);
    return defaultPipelineSlaConfig();
  }

  const byEtapa = new Map(data.map((r) => [r.etapa, r]));
  return PIPELINE_SLA_STAGES.map((s, i) => {
    const row = byEtapa.get(s.value);
    return row
      ? { etapa: s.value, label: row.label, sla_dias: row.sla_dias, ordem: row.ordem, ativo: row.ativo }
      : { etapa: s.value, label: s.label, sla_dias: PIPELINE_SLA_DIAS_DEFAULT[s.value], ordem: i + 1, ativo: true };
  }).sort((a, b) => a.ordem - b.ordem);
}

export async function updatePipelineSlaMeta(etapa: EtapaFunil, slaDias: number | null): Promise<void> {
  const { error } = await supabase
    .from("pipeline_sla_config")
    .update({ sla_dias: slaDias, atualizado_em: new Date().toISOString() })
    .eq("etapa", etapa);
  if (error) throw error;
}

export interface LeadFunil extends LeadFunilLike {
  id: string;
  empresa: string;
  status_funil: string | null;
  status_funil_atualizado_em: string | null;
  criado_em: string | null;
  segmento: string | null;
  score_lead: number | null;
}

/** Leads em andamento no funil (mesmo recorte do Dashboard: sem perdidos/cliente ativo). */
export async function listLeadsFunil(): Promise<LeadFunil[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, empresa, status_funil, status_funil_atualizado_em, criado_em, segmento, score_lead")
    .not("status_funil", "in", "(perdido,nao_vai_fazer,cliente_ativo)")
    .limit(5000);
  if (error) throw error;
  const leads = (data ?? []) as LeadFunil[];

  // Potencial máximo do relatório (mesma fonte do funil comercial).
  const ids = leads.map((l) => l.id);
  if (ids.length > 0) {
    const { data: rels } = await supabase
      .from("relatorios_leads")
      .select("lead_id, estimativa_total_maxima")
      .in("lead_id", ids);
    const pot = new Map<string, number>();
    for (const r of rels ?? []) {
      pot.set(r.lead_id, Math.max(pot.get(r.lead_id) ?? 0, Number(r.estimativa_total_maxima ?? 0)));
    }
    for (const l of leads) l.potencial = pot.get(l.id) ?? 0;
  }
  return leads;
}
