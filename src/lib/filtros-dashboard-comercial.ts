/**
 * Filtros da Visão Comercial: período de entrada do lead, empresa (produto),
 * etapa atual, responsável (SDR/closer) e faixa de valor (potencial do
 * diagnóstico). Tudo puro — o CommercialView aplica sobre os leads e recalcula
 * os cards a partir do recorte.
 */
import { etapaUnificada } from "@/lib/comercial-analytics";
import { filtrarPorResponsavel, type FiltroResponsavel } from "@/lib/equipe-comercial";
import { filtrarPorPeriodo, PERIODO_PIPELINE_PADRAO, type PeriodoPipeline } from "@/lib/pipeline-periodo";
import { filtrarPorProduto, type FiltroProduto } from "@/lib/produto-lead";

export type FaixaValor = "todas" | "sem_diagnostico" | "ate_100k" | "100k_500k" | "500k_1m" | "acima_1m";

/** Limites em reais: `min` inclusivo, `max` exclusivo (null = sem teto). */
export const FAIXAS_VALOR: { value: FaixaValor; label: string; min?: number; max?: number | null }[] = [
  { value: "todas", label: "Qualquer valor" },
  { value: "sem_diagnostico", label: "Sem valor estimado" },
  { value: "ate_100k", label: "Até R$ 100 mil", min: 0, max: 100_000 },
  { value: "100k_500k", label: "R$ 100 mil a 500 mil", min: 100_000, max: 500_000 },
  { value: "500k_1m", label: "R$ 500 mil a 1 milhão", min: 500_000, max: 1_000_000 },
  { value: "acima_1m", label: "Acima de R$ 1 milhão", min: 1_000_000, max: null },
];

/** "todas" ou uma etapa unificada do funil (FUNNEL_STAGES_COM). */
export type FiltroEtapa = "todas" | string;

export interface FiltrosDashboardComercial {
  periodo: PeriodoPipeline;
  produto: FiltroProduto;
  etapa: FiltroEtapa;
  responsavel: FiltroResponsavel;
  valor: FaixaValor;
}

export const FILTROS_COMERCIAL_PADRAO: FiltrosDashboardComercial = {
  periodo: PERIODO_PIPELINE_PADRAO,
  produto: "todos",
  etapa: "todas",
  responsavel: "todos",
  valor: "todas",
};

export function isFaixaValor(v: unknown): v is FaixaValor {
  return FAIXAS_VALOR.some((f) => f.value === v);
}

export function dentroDaFaixa(potencial: number | null | undefined, faixa: FaixaValor): boolean {
  if (faixa === "todas") return true;
  const v = Number(potencial ?? 0);
  if (faixa === "sem_diagnostico") return !(v > 0);
  const f = FAIXAS_VALOR.find((x) => x.value === faixa);
  // "Até 100 mil" só conta quem tem valor: zero é "Sem valor estimado".
  if (!f || !(v > 0)) return false;
  return v >= (f.min ?? 0) && (f.max == null || v < f.max);
}

export function contarFiltrosAtivos(f: FiltrosDashboardComercial): number {
  return (
    (f.periodo.tipo !== "tudo" ? 1 : 0) +
    (f.produto !== "todos" ? 1 : 0) +
    (f.etapa !== "todas" ? 1 : 0) +
    (f.responsavel !== "todos" ? 1 : 0) +
    (f.valor !== "todas" ? 1 : 0)
  );
}

type LeadFiltravel = {
  criado_em?: string | null;
  produto?: string | null;
  status_funil?: string | null;
  sdr_id?: string | null;
  closer_id?: string | null;
  potencial?: number | null;
};

export function aplicarFiltrosComercial<T extends LeadFiltravel>(
  leads: T[],
  f: FiltrosDashboardComercial,
  agora: number = Date.now(),
): T[] {
  let out = filtrarPorPeriodo(leads, f.periodo, agora);
  out = filtrarPorProduto(out, f.produto);
  out = filtrarPorResponsavel(out, f.responsavel);
  if (f.etapa !== "todas") out = out.filter((l) => etapaUnificada(l.status_funil) === f.etapa);
  if (f.valor !== "todas") out = out.filter((l) => dentroDaFaixa(l.potencial, f.valor));
  return out;
}
