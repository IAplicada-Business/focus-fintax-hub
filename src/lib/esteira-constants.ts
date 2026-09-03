export const ESTEIRA_STAGES = [
  { value: "nova_abordagem", label: "Nova abordagem" },
  { value: "triagem", label: "Triagem" },
  { value: "levantamento", label: "Levantamento" },
  { value: "emitir_contrato", label: "Emitir Contrato" },
  { value: "receber_assinado", label: "Receber Assinado" },
  { value: "em_compensacao", label: "Em Compensação" },
  { value: "encaminhar_financeiro", label: "Encaminhar Financeiro" },
  { value: "concluido", label: "Concluído" },
  { value: "devolutiva_cliente", label: "Devolutiva ao cliente" },
] as const;

/** Espelha o enum `estagio_esteira` do Postgres. */
export type EstagioEsteira = (typeof ESTEIRA_STAGES)[number]["value"];

/**
 * Defaults de SLA (dias de calendário). Fonte de verdade em runtime:
 * tabela `esteira_sla_config`. Estes valores são fallback + seed.
 * `null` = etapa sem meta.
 */
export const ESTEIRA_SLA_DIAS: Record<EstagioEsteira, number | null> = {
  nova_abordagem: 5,
  triagem: 1,
  levantamento: 3,
  emitir_contrato: 1,
  receber_assinado: 3,
  em_compensacao: 30,
  encaminhar_financeiro: 5,
  concluido: null,
  devolutiva_cliente: null,
};

/** Etapas terminais: cliente saiu do fluxo (com sucesso ou por tese inviável). */
export const ESTEIRA_STAGES_TERMINAIS: readonly EstagioEsteira[] = ["concluido", "devolutiva_cliente"];

export type EsteiraSlaMap = Partial<Record<EstagioEsteira, number | null>>;

export interface RealocacaoSugerida {
  estagio: EstagioEsteira;
  motivo: string;
}

/**
 * Sugestão de etapa pra realocação em massa (Fase 1 — decisão 03/09/2026).
 * Só sugere pra quem ainda está em Triagem; quem já foi movido mantém a etapa.
 * Regra a partir do status consolidado (`v_clientes_status_compensacao`):
 *   compensando | reporto | prevista | ressarcimento | judicial → em_compensacao
 *   encerrado → concluido
 *   sem_operacao (ou desconhecido) → triagem (fica, com SLA reiniciado)
 * Quem revisa o preview pode sobrescrever qualquer linha.
 */
export function sugerirEstagioRealocacao(
  statusPrincipal: string | null | undefined,
  estagioAtual: string,
): RealocacaoSugerida {
  if (estagioAtual !== "triagem") {
    const estagio = isEstagioEsteira(estagioAtual) ? estagioAtual : "triagem";
    return { estagio, motivo: "Já movido manualmente — mantém a etapa atual" };
  }
  switch (statusPrincipal) {
    case "compensando":
      return { estagio: "em_compensacao", motivo: "Compensação lançada no mês corrente" };
    case "reporto":
      return { estagio: "em_compensacao", motivo: "Tese Reporto assinada em andamento" };
    case "prevista":
      return { estagio: "em_compensacao", motivo: "Tese assinada aguardando compensação" };
    case "ressarcimento":
      return { estagio: "em_compensacao", motivo: "Ressarcimento em andamento" };
    case "judicial":
      return { estagio: "em_compensacao", motivo: "Recuperação judicial em andamento" };
    case "encerrado":
      return { estagio: "concluido", motivo: "Todas as teses encerradas" };
    default:
      return { estagio: "triagem", motivo: "Sem operação registrada — fica em Triagem" };
  }
}

/**
 * Valida ids que chegam de fontes não tipadas (ex.: `droppableId` do
 * drag-and-drop) antes de mandar pro banco, onde um valor fora do enum
 * viraria erro `invalid input value for enum`.
 */
export function isEstagioEsteira(value: string): value is EstagioEsteira {
  return ESTEIRA_STAGES.some((s) => s.value === value);
}

export function slaDiasDaEtapa(
  estagio: string,
  overrides?: EsteiraSlaMap,
): number | null {
  if (!isEstagioEsteira(estagio)) return null;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, estagio)) {
    return overrides[estagio] ?? null;
  }
  return ESTEIRA_SLA_DIAS[estagio];
}

export function isClienteAtrasadoSla(
  estagio: string,
  diasNaEtapa: number,
  overrides?: EsteiraSlaMap,
): boolean {
  const sla = slaDiasDaEtapa(estagio, overrides);
  if (sla == null) return false;
  return diasNaEtapa > sla;
}

export function diasAcimaDoSla(
  estagio: string,
  diasNaEtapa: number,
  overrides?: EsteiraSlaMap,
): number {
  const sla = slaDiasDaEtapa(estagio, overrides);
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
  overrides?: EsteiraSlaMap,
): ProjetaoAtrasoEtapa[] {
  return ESTEIRA_STAGES.map((stage) => {
    const naEtapa = clientes.filter((c) => c.estagio_esteira === stage.value);
    const sla = slaDiasDaEtapa(stage.value, overrides);
    let atrasados = 0;
    let atrasoAcumuladoDias = 0;
    for (const c of naEtapa) {
      const acima = diasAcimaDoSla(stage.value, c.dias_na_etapa ?? 0, overrides);
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

export interface EsteiraStageConfigLike {
  estagio: string;
  label: string;
  ativo: boolean;
}

/**
 * Colunas visíveis no kanban a partir da config editável (ordem já vem
 * aplicada por quem chama — normalmente `esteira_sla_config` ordenada).
 * Etapa inativa some, EXCETO quando ainda tem cliente alocado nela: nunca
 * esconder cliente por um toggle administrativo.
 */
export function visibleEsteiraStages(
  config: EsteiraStageConfigLike[],
  estagiosComCliente: Iterable<string>,
): { value: string; label: string }[] {
  const comCliente = new Set(estagiosComCliente);
  return config
    .filter((s) => s.ativo || comCliente.has(s.estagio))
    .map((s) => ({ value: s.estagio, label: s.label }));
}

export const ORIGEM_LABELS: Record<string, string> = {
  manual: "Manual",
  referencia: "Referência",
  prospeccao_ativa: "Prospecção Ativa",
  meta_ads: "Meta Ads",
  formulario_lp: "Formulário",
  calculadora: "Calculadora",
};
