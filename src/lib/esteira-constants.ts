export const ESTEIRA_STAGES = [
  { value: "triagem", label: "Triagem" },
  { value: "levantamento", label: "Levantamento" },
  { value: "emitir_contrato", label: "Emitir Contrato" },
  { value: "receber_assinado", label: "Receber Assinado" },
  { value: "em_compensacao", label: "Em Compensação" },
  { value: "concluido", label: "Concluído" },
] as const;

export const ORIGEM_LABELS: Record<string, string> = {
  manual: "Manual",
  referencia: "Referência",
  prospeccao_ativa: "Prospecção Ativa",
  meta_ads: "Meta Ads",
  formulario_lp: "Formulário",
  calculadora: "Calculadora",
};
