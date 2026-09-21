/**
 * Esteira operacional do cliente. Triagem e contrato são sincronizados com o
 * comercial; depois de Ganho, a operação segue até Concluído.
 */
export const ESTEIRA_STAGES = [
  { value: "triagem", label: "Triagem" },
  { value: "contrato_emitido", label: "Contrato Emitido" },
  { value: "contrato_assinado", label: "Contrato Assinado" },
  { value: "em_compensacao", label: "Em Compensação" },
  { value: "compensado", label: "Compensado" },
  { value: "concluido", label: "Concluído" },
] as const;

/**
 * Etapa legada removida do fluxo operacional vigente. O valor permanece no
 * enum e no histórico para não apagar auditoria, mas não é mais um destino.
 */
export const ESTEIRA_STAGES_LEGADAS = [
  { value: "nova_abordagem", label: "Nova abordagem (legado comercial)" },
  { value: "levantamento", label: "Levantamento (legado)" },
  { value: "emitir_contrato", label: "Emitir Contrato (legado)" },
  { value: "receber_assinado", label: "Receber Assinado (legado)" },
  { value: "encaminhar_financeiro", label: "Encaminhar Financeiro (legado)" },
  { value: "devolutiva_cliente", label: "Devolutiva ao cliente (legado)" },
] as const;

export const ESTEIRA_ALL_STAGES = [...ESTEIRA_STAGES, ...ESTEIRA_STAGES_LEGADAS] as const;

/** Espelha o enum `estagio_esteira` do Postgres, incluindo valores históricos. */
export type EstagioEsteira = (typeof ESTEIRA_ALL_STAGES)[number]["value"];

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
  contrato_emitido: 3,
  contrato_assinado: 3,
  compensado: 5,
};

/** Etapa terminal vigente. Valores legados continuam reconhecidos no histórico. */
export const ESTEIRA_STAGES_TERMINAIS: readonly EstagioEsteira[] = ["concluido"];

export type EsteiraSlaMap = Partial<Record<EstagioEsteira, number | null>>;

export interface RealocacaoSugerida {
  estagio: EstagioEsteira;
  motivo: string;
}

/**
 * Sugestão de etapa pra realocação em massa (Fase 1 — decisão 03/09/2026).
 * Só sugere pra quem ainda está em Triagem; quem já foi movido mantém a etapa.
 * Regra a partir do status consolidado (`v_clientes_status_compensacao`):
 *   compensando | reporto | prevista → em_compensacao
 *   encerrado → concluido
 *   sem_operacao (ou desconhecido) → triagem (fica, com SLA reiniciado)
 * `ressarcimento`/`judicial` abaixo são aliases legados enquanto ambientes
 * ainda não aplicaram a migration que separa status de ramo.
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
  return ESTEIRA_ALL_STAGES.some((s) => s.value === value);
}

export function esteiraStageLabel(value: string): string {
  return ESTEIRA_ALL_STAGES.find((s) => s.value === value)?.label ?? value;
}

export function ordemEsteira(value: string): number {
  const idx = ESTEIRA_STAGES.findIndex((s) => s.value === value);
  return idx < 0 ? -1 : idx;
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
  const configuradas = new Set(config.map((s) => s.estagio));
  const visiveis = config
    .filter((s) => s.ativo || comCliente.has(s.estagio))
    .map((s) => ({ value: s.estagio, label: s.label }));
  for (const estagio of comCliente) {
    if (configuradas.has(estagio)) continue;
    visiveis.push({
      value: estagio,
      label: estagio === "__sem_etapa__" ? "Sem etapa configurada" : `Etapa não configurada: ${estagio}`,
    });
  }
  return visiveis;
}

export const ORIGEM_LABELS: Record<string, string> = {
  manual: "Manual",
  referencia: "Referência",
  prospeccao_ativa: "Prospecção Ativa",
  meta_ads: "Meta Ads",
  formulario_lp: "Formulário",
  calculadora: "Calculadora",
};
