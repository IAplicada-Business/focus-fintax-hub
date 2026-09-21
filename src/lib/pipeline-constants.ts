/**
 * Funil comercial. As etapas compartilhadas sincronizam a esteira operacional
 * pelo `estagioEsteiraDoFunil`, sem criar dois fluxos desconectados.
 */
export const PIPELINE_STAGES = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "apresentacao", label: "Apresentação" },
  { value: "triagem", label: "Triagem" },
  { value: "contrato_emitido", label: "Contrato Emitido" },
  { value: "contrato_assinado", label: "Contrato Assinado" },
  { value: "ganho", label: "Ganho" },
  { value: "perdido", label: "Perdido" },
] as const;

/** Maps legacy DB values to their unified kanban column */
export const STAGE_MERGE_MAP: Record<string, string> = {
  em_apresentacao: "apresentacao",
  em_negociacao: "triagem",
  levantamento_teses: "triagem",
  cliente_ativo: "ganho",
  nao_vai_fazer: "perdido",
};

export const STAGE_COLORS: Record<string, string> = {
  novo: "bg-blue-100 text-blue-800 border-blue-200",
  qualificado: "bg-cyan-100 text-cyan-800 border-cyan-200",
  apresentacao: "bg-indigo-100 text-indigo-800 border-indigo-200",
  triagem: "bg-amber-100 text-amber-800 border-amber-200",
  contrato_emitido: "bg-emerald-100 text-emerald-800 border-emerald-200",
  contrato_assinado: "bg-teal-100 text-teal-800 border-teal-200",
  ganho: "bg-green-200 text-green-900 border-green-300",
  perdido: "bg-red-100 text-red-800 border-red-200",
};

export const SEGMENTO_COLORS: Record<string, string> = {
  supermercado: "bg-blue-100 text-blue-700",
  farmacia: "bg-green-100 text-green-700",
  pet: "bg-orange-100 text-orange-700",
  materiais_construcao: "bg-gray-200 text-gray-700",
  outros: "bg-purple-100 text-purple-700",
};

export const SEGMENTO_LABELS: Record<string, string> = {
  supermercado: "Supermercado",
  pet: "PET",
  materiais_construcao: "Mat. Construção",
  farmacia: "Farmácia",
  outros: "Outros",
};

export const FATURAMENTO_MIDPOINTS: Record<string, number> = {
  ate_500k: 250_000,
  "500k_2m": 1_250_000,
  "2m_5m": 3_500_000,
  "5m_15m": 10_000_000,
  acima_15m: 20_000_000,
};

export const SCORE_CONFIG: Record<string, { label: string; color: string; min: number }> = {
  A: { label: "A", color: "bg-red-500 text-white", min: 80 },
  B: { label: "B", color: "bg-orange-500 text-white", min: 60 },
  C: { label: "C", color: "bg-yellow-400 text-yellow-900", min: 40 },
  D: { label: "D", color: "bg-gray-400 text-white", min: 0 },
};

export function getScoreLabel(score: number | null): string {
  if (!score) return "D";
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

export const ORIGENS = [
  { value: "manual", label: "Manual" },
  { value: "referencia", label: "Referência" },
  { value: "prospeccao_ativa", label: "Prospecção Ativa" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "formulario_lp", label: "Formulário LP" },
] as const;

export const ACTIVE_STAGES = PIPELINE_STAGES.filter(
  (s) => s.value !== "perdido"
);

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")}mi`;
  }
  if (value >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(0)}mil`;
  }
  return `R$ ${value.toFixed(0)}`;
}

export function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}
