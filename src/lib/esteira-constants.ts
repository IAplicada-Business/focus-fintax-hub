export const ESTEIRA_STAGES = [
  { value: "triagem", label: "Triagem" },
  { value: "levantamento", label: "Levantamento" },
  { value: "emitir_contrato", label: "Emitir Contrato" },
  { value: "receber_assinado", label: "Receber Assinado" },
  { value: "em_compensacao", label: "Em Compensação" },
  { value: "concluido", label: "Concluído" },
] as const;

/** Espelha o enum `estagio_esteira` do Postgres. */
export type EstagioEsteira = (typeof ESTEIRA_STAGES)[number]["value"];

/**
 * Valida ids que chegam de fontes não tipadas (ex.: `droppableId` do
 * drag-and-drop) antes de mandar pro banco, onde um valor fora do enum
 * viraria erro `invalid input value for enum`.
 */
export function isEstagioEsteira(value: string): value is EstagioEsteira {
  return ESTEIRA_STAGES.some((s) => s.value === value);
}

export const ORIGEM_LABELS: Record<string, string> = {
  manual: "Manual",
  referencia: "Referência",
  prospeccao_ativa: "Prospecção Ativa",
  meta_ads: "Meta Ads",
  formulario_lp: "Formulário",
  calculadora: "Calculadora",
};
