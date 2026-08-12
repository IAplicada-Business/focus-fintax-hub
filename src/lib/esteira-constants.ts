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
 * SLA esperado em dias úteis de calendário (mesmo critério do SQL).
 * `null` = etapa sem meta (concluído).
 * `em_compensacao` = 30d — default operacional (backlog não especificava).
 */
export const ESTEIRA_SLA_DIAS: Record<EstagioEsteira, number | null> = {
  triagem: 1,
  levantamento: 3,
  emitir_contrato: 1,
  receber_assinado: 3,
  em_compensacao: 30,
  concluido: null,
};

/**
 * Valida ids que chegam de fontes não tipadas (ex.: `droppableId` do
 * drag-and-drop) antes de mandar pro banco, onde um valor fora do enum
 * viraria erro `invalid input value for enum`.
 */
export function isEstagioEsteira(value: string): value is EstagioEsteira {
  return ESTEIRA_STAGES.some((s) => s.value === value);
}

export function slaDiasDaEtapa(estagio: string): number | null {
  if (!isEstagioEsteira(estagio)) return null;
  return ESTEIRA_SLA_DIAS[estagio];
}

export function isClienteAtrasadoSla(estagio: string, diasNaEtapa: number): boolean {
  const sla = slaDiasDaEtapa(estagio);
  if (sla == null) return false;
  return diasNaEtapa > sla;
}

export function diasAcimaDoSla(estagio: string, diasNaEtapa: number): number {
  const sla = slaDiasDaEtapa(estagio);
  if (sla == null) return 0;
  return Math.max(0, diasNaEtapa - sla);
}

export type ProjetaoAtrasoEtapa = {
  estagio: EstagioEsteira;
  label: string;
  slaDias: number | null;
  clientes: number;
  atrasados: number;
  /** Soma dos dias acima do SLA na fila atual (proxy de “atraso acumulado”). */
  atrasoAcumuladoDias: number;
};

/**
 * Projeção simples de atraso: por etapa, soma `max(0, dias - sla)` dos clientes.
 * Não prevê futuro probabilístico — só quantifica o backlog de atraso hoje.
 */
export function projetarAtrasoPorEtapa(
  clientes: Array<{ estagio_esteira: string; dias_na_etapa: number }>,
): ProjetaoAtrasoEtapa[] {
  return ESTEIRA_STAGES.map((stage) => {
    const naEtapa = clientes.filter((c) => c.estagio_esteira === stage.value);
    const sla = ESTEIRA_SLA_DIAS[stage.value];
    let atrasados = 0;
    let atrasoAcumuladoDias = 0;
    for (const c of naEtapa) {
      const acima = diasAcimaDoSla(stage.value, c.dias_na_etapa ?? 0);
      if (acima > 0) {
        atrasados += 1;
        atrasoAcumuladoDias += acima;
      }
    }
    return {
      estagio: stage.value,
      label: stage.label,
      slaDias: sla,
      clientes: naEtapa.length,
      atrasados,
      atrasoAcumuladoDias,
    };
  });
}

export const ORIGEM_LABELS: Record<string, string> = {
  manual: "Manual",
  referencia: "Referência",
  prospeccao_ativa: "Prospecção Ativa",
  meta_ads: "Meta Ads",
  formulario_lp: "Formulário",
  calculadora: "Calculadora",
};
