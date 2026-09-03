/**
 * SLA do funil comercial — tempo parado por etapa do pipeline de leads vs meta.
 * Regras puras; a config editável vive em `pipeline_sla_config` (fallback aqui).
 */
import { STAGE_MERGE_MAP } from "@/lib/pipeline-constants";
import { slaInfo, type SlaInfo, type SlaStatus } from "@/lib/esteira-acompanhamento";

export const PIPELINE_SLA_STAGES = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "em_negociacao", label: "Negociação / Teses" },
  { value: "em_apresentacao", label: "Em Apresentação" },
  { value: "contrato_emitido", label: "Contrato Emitido" },
] as const;

export type EtapaFunil = (typeof PIPELINE_SLA_STAGES)[number]["value"];

/** Defaults (seed da tabela). Contrato Emitido = 3d bate com o banner de leads parados. */
export const PIPELINE_SLA_DIAS_DEFAULT: Record<EtapaFunil, number | null> = {
  novo: 3,
  qualificado: 5,
  em_negociacao: 10,
  em_apresentacao: 7,
  contrato_emitido: 3,
};

export interface PipelineSlaConfigRow {
  etapa: EtapaFunil;
  label: string;
  sla_dias: number | null;
  ordem: number;
  ativo: boolean;
}

export function isEtapaFunil(value: string): value is EtapaFunil {
  return PIPELINE_SLA_STAGES.some((s) => s.value === value);
}

export function defaultPipelineSlaConfig(): PipelineSlaConfigRow[] {
  return PIPELINE_SLA_STAGES.map((s, i) => ({
    etapa: s.value,
    label: s.label,
    sla_dias: PIPELINE_SLA_DIAS_DEFAULT[s.value],
    ordem: i + 1,
    ativo: true,
  }));
}

/**
 * status_funil → etapa medida. Valores legados (levantamento_teses) caem na
 * coluna unificada; vazio = novo; perdido/cliente_ativo/desconhecido = null
 * (fora do funil em andamento).
 */
export function normalizarEtapaFunil(status: string | null | undefined): EtapaFunil | null {
  const raw = (status ?? "").trim() || "novo";
  const unificado = STAGE_MERGE_MAP[raw] ?? raw;
  return isEtapaFunil(unificado) ? unificado : null;
}

export interface LeadFunilLike {
  id: string;
  empresa?: string | null;
  status_funil?: string | null;
  /** Setado pelo app ao mover no kanban; pode faltar em leads antigos. */
  status_funil_atualizado_em?: string | null;
  criado_em?: string | null;
  potencial?: number | null;
}

/** Dias inteiros desde a entrada na etapa (fallback: criação do lead). */
export function diasNaEtapaLead(lead: LeadFunilLike, agora: number = Date.now()): number {
  const ref = lead.status_funil_atualizado_em || lead.criado_em;
  if (!ref) return 0;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}

export interface LeadFunilLinha<T extends LeadFunilLike = LeadFunilLike> {
  lead: T;
  etapa: EtapaFunil;
  label: string;
  dias: number;
  sla: SlaInfo;
}

export interface EtapaFunilResumo {
  etapa: EtapaFunil;
  label: string;
  sla: number | null;
  leads: number;
  diasMedios: number | null;
  atrasados: number;
  /** Soma dos dias acima da meta na fila atual. */
  atrasoAcumulado: number;
  potencial: number;
}

export interface SlaFunilResumo<T extends LeadFunilLike = LeadFunilLike> {
  etapas: EtapaFunilResumo[];
  linhas: LeadFunilLinha<T>[];
  atrasados: LeadFunilLinha<T>[];
  totalAtrasados: number;
  totalNoPrazo: number;
  atrasoAcumulado: number;
}

export function resumirSlaFunil<T extends LeadFunilLike>(
  leads: T[],
  config: PipelineSlaConfigRow[],
  agora: number = Date.now(),
): SlaFunilResumo<T> {
  const ordenada = [...config].sort((a, b) => a.ordem - b.ordem);
  const cfgPorEtapa = new Map(ordenada.map((c) => [c.etapa, c]));

  const linhas: LeadFunilLinha<T>[] = [];
  for (const lead of leads) {
    const etapa = normalizarEtapaFunil(lead.status_funil);
    if (!etapa) continue;
    const cfg = cfgPorEtapa.get(etapa);
    const dias = diasNaEtapaLead(lead, agora);
    const sla = slaInfo({ estagio_esteira: etapa, dias_na_etapa: dias, sla_dias: cfg?.sla_dias ?? null });
    linhas.push({ lead, etapa, label: cfg?.label ?? etapa, dias, sla });
  }

  const etapas: EtapaFunilResumo[] = ordenada.map((c) => {
    const daEtapa = linhas.filter((l) => l.etapa === c.etapa);
    const atrasadosEtapa = daEtapa.filter((l) => l.sla.status === "estourado");
    const diasMedios =
      daEtapa.length === 0 ? null : Math.round((daEtapa.reduce((s, l) => s + l.dias, 0) / daEtapa.length) * 10) / 10;
    return {
      etapa: c.etapa,
      label: c.label,
      sla: c.sla_dias,
      leads: daEtapa.length,
      diasMedios,
      atrasados: atrasadosEtapa.length,
      atrasoAcumulado: atrasadosEtapa.reduce((s, l) => s + Math.abs(l.sla.restante ?? 0), 0),
      potencial: daEtapa.reduce((s, l) => s + Number(l.lead.potencial ?? 0), 0),
    };
  });

  const atrasados = linhas
    .filter((l) => l.sla.status === "estourado")
    .sort((a, b) => (a.sla.restante ?? 0) - (b.sla.restante ?? 0));

  return {
    etapas,
    linhas,
    atrasados,
    totalAtrasados: atrasados.length,
    totalNoPrazo: Math.max(0, linhas.length - atrasados.length),
    atrasoAcumulado: etapas.reduce((s, e) => s + e.atrasoAcumulado, 0),
  };
}

export const SLA_FUNIL_STATUS_LABEL: Record<SlaStatus, string> = {
  estourado: "Atrasado",
  atencao: "Vencendo",
  no_prazo: "No prazo",
  sem_sla: "Sem meta",
};
