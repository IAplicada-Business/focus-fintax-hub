import { supabase } from "@/integrations/supabase/client";
import type { HistoricoLeadLike } from "@/lib/comercial-analytics";
import { listConversasInbox, type InboxConversa } from "@/services/atendimentoService";
import { listPipelineSlaConfig } from "@/services/pipelineSlaService";
import type { PipelineSlaConfigRow } from "@/lib/pipeline-sla";

const MS_DIA = 86_400_000;

/** Lead com o que o Dashboard comercial precisa (funil, SLA, origem, perfil). */
export interface LeadDashboard {
  id: string;
  empresa: string;
  nome: string | null;
  whatsapp: string | null;
  status_funil: string | null;
  status_funil_atualizado_em: string | null;
  criado_em: string | null;
  segmento: string | null;
  regime_tributario: string | null;
  score_lead: number | null;
  origem: string | null;
  /** Potencial máximo do diagnóstico (0 sem relatório). */
  potencial: number;
}

export interface ComercialDashboardData {
  leads: LeadDashboard[];
  historico: HistoricoLeadLike[];
  motor: { tesesAtivas: number; regimes: (string[] | null)[]; diagnosticos: number };
  conversas: InboxConversa[];
  slaConfig: PipelineSlaConfigRow[];
}

/**
 * Uma única leitura para a Visão Comercial inteira. Cada bloco da tela deriva
 * (com funções puras de `comercial-analytics`) do que vem aqui — sem consultas
 * repetidas por card.
 */
export async function fetchComercialDashboard(): Promise<ComercialDashboardData> {
  const desdeHistorico = new Date(Date.now() - 120 * MS_DIA).toISOString();

  const [leadsRes, relsRes, histRes, motorRes, diagRes, conversas, slaConfig] = await Promise.all([
    supabase
      .from("leads")
      .select("id, empresa, nome, whatsapp, status_funil, status_funil_atualizado_em, criado_em, segmento, regime_tributario, score_lead, origem")
      .limit(5000),
    supabase.from("relatorios_leads").select("lead_id, estimativa_total_maxima").limit(10000),
    supabase.from("lead_historico").select("lead_id, para_etapa, criado_em").gte("criado_em", desdeHistorico).limit(10000),
    supabase.from("motor_teses_config").select("regimes_elegiveis").eq("ativo", true),
    supabase.from("diagnosticos_leads").select("lead_id").limit(10000),
    listConversasInbox().catch(() => [] as InboxConversa[]),
    listPipelineSlaConfig(),
  ]);

  if (leadsRes.error) throw leadsRes.error;

  const potencial = new Map<string, number>();
  for (const r of relsRes.data ?? []) {
    potencial.set(r.lead_id, Math.max(potencial.get(r.lead_id) ?? 0, Number(r.estimativa_total_maxima ?? 0)));
  }

  const leads: LeadDashboard[] = (leadsRes.data ?? []).map((l) => ({
    id: l.id,
    empresa: l.empresa || "Sem empresa",
    nome: l.nome ?? null,
    whatsapp: l.whatsapp ?? null,
    status_funil: l.status_funil ?? null,
    status_funil_atualizado_em: l.status_funil_atualizado_em ?? null,
    criado_em: l.criado_em ?? null,
    segmento: l.segmento ?? null,
    regime_tributario: l.regime_tributario ?? null,
    score_lead: l.score_lead ?? null,
    origem: l.origem ?? null,
    potencial: potencial.get(l.id) ?? 0,
  }));

  const historico: HistoricoLeadLike[] = (histRes.data ?? []).map((h) => ({
    lead_id: h.lead_id,
    para_etapa: h.para_etapa,
    criado_em: h.criado_em ?? null,
  }));

  return {
    leads,
    historico,
    motor: {
      tesesAtivas: motorRes.data?.length ?? 0,
      regimes: (motorRes.data ?? []).map((t) => t.regimes_elegiveis),
      diagnosticos: new Set((diagRes.data ?? []).map((d) => d.lead_id)).size,
    },
    conversas,
    slaConfig,
  };
}
