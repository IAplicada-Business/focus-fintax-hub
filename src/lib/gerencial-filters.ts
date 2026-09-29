import type { TipoRecuperacao } from "@/lib/tipo-recuperacao";
import {
  RAMO_GERENCIAL_FILTROS,
  pertenceAoRamoGerencial,
  type ClienteRamoFlags,
  type RamoGerencialFiltro,
} from "@/lib/esteira-acompanhamento";

export const STATUS_COMPENSACAO_VALUES = [
  "compensando",
  "reporto",
  "encerrado",
] as const;

export type StatusCompensacaoPadrao = (typeof STATUS_COMPENSACAO_VALUES)[number];

/**
 * Opções extras do filtro "Status compensação" (AGF set/2026). Não são um
 * status exclusivo do cliente — vêm do ramo das teses — então somam ao
 * recorte (união) em vez de competir com o status principal.
 */
export const STATUS_FILTRO_EXTRAS = [
  "recuperacao_judicial",
  "ressarcimento_concluido",
] as const;

export type StatusFiltroExtra = (typeof STATUS_FILTRO_EXTRAS)[number];

/** As 5 opções do seletor, na ordem de exibição. */
export const STATUS_FILTRO_VALUES = [
  ...STATUS_COMPENSACAO_VALUES,
  ...STATUS_FILTRO_EXTRAS,
] as const;

/** Aliases legados internos (`prevista`, `sem_operacao`) não aparecem em seletores. */
export type StatusCompensacao =
  | StatusCompensacaoPadrao
  | StatusFiltroExtra
  | "prevista"
  | "sem_operacao";

/** Etapa que encerra um ressarcimento (mesmo terminal das demais teses). */
export const STATUS_PROCESSO_CONCLUIDO = "compensado";

export interface StatusCompensacaoRow {
  cliente_id: string;
  status_principal?: string | null;
  tem_compensacao_mes_corrente?: boolean | null;
  tem_tese_ativa?: boolean | null;
  todos_encerrados?: boolean | null;
  tem_reporto?: boolean | null;
}

export interface ProcessoTipoRecuperacaoRow {
  cliente_id: string;
  tipo_recuperacao?: TipoRecuperacao | string | null;
  status_contrato?: string | null;
  status_processo?: string | null;
}

export function normalizarStatusCompensacao(row: StatusCompensacaoRow): StatusCompensacao {
  const status = row.status_principal;
  // Movimento real no mês corrente é a evidência operacional mais forte.
  // REPORTO é tipo de tese/possível futuro e não pode esconder um cliente
  // que também está efetivamente compensando.
  if (row.tem_compensacao_mes_corrente) return "compensando";
  if (STATUS_COMPENSACAO_VALUES.includes(status as StatusCompensacaoPadrao)) {
    return status as StatusCompensacaoPadrao;
  }

  // Compatibilidade com a view anterior, em que ramo judicial/ressarcimento
  // sobrescrevia o status operacional.
  if (row.tem_reporto) return "reporto";
  if (row.todos_encerrados) return "encerrado";
  // `prevista` e `sem_operacao` viram uma pendência explícita de qualidade.
  return "sem_operacao";
}

export function buildRamoFlagsPorCliente(
  processos: ProcessoTipoRecuperacaoRow[],
): Map<string, ClienteRamoFlags> {
  const out = new Map<string, ClienteRamoFlags>();
  for (const processo of processos) {
    if (processo.status_contrato && processo.status_contrato !== "assinado") continue;
    if (processo.status_processo === "desistiu") continue;
    const atual = out.get(processo.cliente_id) ?? {};
    if (processo.tipo_recuperacao === "ressarcimento") {
      atual.tem_ramo_ressarcimento = true;
      if (processo.status_processo === STATUS_PROCESSO_CONCLUIDO) {
        atual.tem_ressarcimento_concluido = true;
      }
    }
    else if (processo.tipo_recuperacao === "recuperacao_judicial") atual.tem_ramo_judicial = true;
    else if (processo.tipo_recuperacao === "compensacao") atual.tem_ramo_compensacao = true;
    out.set(processo.cliente_id, atual);
  }
  return out;
}

/** Cliente entra numa opção extra do filtro de status? */
export function pertenceAoStatusExtra(
  flags: ClienteRamoFlags | undefined,
  status: StatusFiltroExtra,
): boolean {
  if (!flags) return false;
  if (status === "recuperacao_judicial") return !!flags.tem_ramo_judicial;
  return !!flags.tem_ressarcimento_concluido;
}

export function makeStatusFilterPredicate(
  selected: Set<StatusCompensacao>,
  statusMap: Map<string, StatusCompensacao>,
  ramosMap?: Map<string, ClienteRamoFlags>,
) {
  // Os 3 status principais cobrem a carteira inteira; os extras são
  // subconjuntos. Com os 3 marcados (ou nada marcado) não há recorte.
  const semFiltro =
    selected.size === 0 || STATUS_COMPENSACAO_VALUES.every((s) => selected.has(s));
  const algumPrincipal = STATUS_COMPENSACAO_VALUES.some((s) => selected.has(s));
  const extras = STATUS_FILTRO_EXTRAS.filter((s) => selected.has(s));
  return (clienteId: string | null | undefined) => {
    if (semFiltro) return true;
    if (!clienteId) return algumPrincipal;
    const flags = ramosMap?.get(clienteId);
    if (extras.some((s) => pertenceAoStatusExtra(flags, s))) return true;
    // Sem linha de status: fail-open só para os status principais.
    if (!statusMap.has(clienteId)) return algumPrincipal;
    return selected.has(statusMap.get(clienteId)!);
  };
}

export function makeRamoFilterPredicate(
  ramo: RamoGerencialFiltro,
  ramosMap: Map<string, ClienteRamoFlags>,
) {
  return (clienteId: string | null | undefined) => {
    if (ramo === "todas") return true;
    // Legado sem tipo permanece em Administrativo/Compensação, sem invadir
    // Ressarcimento ou Judicial (mesma regra protegida pelo PR 135).
    return pertenceAoRamoGerencial(
      (clienteId ? ramosMap.get(clienteId) : undefined) ?? {},
      ramo,
    );
  };
}

export function filtrarIdsRecorteGerencial(
  ids: string[],
  selectedStatuses: Set<StatusCompensacao>,
  ramo: RamoGerencialFiltro,
  statusMap: Map<string, StatusCompensacao>,
  ramosMap: Map<string, ClienteRamoFlags>,
): Set<string> {
  const porStatus = makeStatusFilterPredicate(selectedStatuses, statusMap, ramosMap);
  const porRamo = makeRamoFilterPredicate(ramo, ramosMap);
  return new Set(ids.filter((id) => porStatus(id) && porRamo(id)));
}

export function countByStatus(
  ids: string[],
  statusMap: Map<string, StatusCompensacao>,
  ramosMap?: Map<string, ClienteRamoFlags>,
): Record<StatusCompensacao, number> {
  const counts: Record<StatusCompensacao, number> = {
    compensando: 0,
    reporto: 0,
    encerrado: 0,
    recuperacao_judicial: 0,
    ressarcimento_concluido: 0,
    prevista: 0,
    sem_operacao: 0,
  };
  for (const id of ids) {
    counts[statusMap.get(id) ?? "sem_operacao"] += 1;
    const flags = ramosMap?.get(id);
    for (const extra of STATUS_FILTRO_EXTRAS) {
      if (pertenceAoStatusExtra(flags, extra)) counts[extra] += 1;
    }
  }
  return counts;
}

export function countByRamo(
  ids: string[],
  ramosMap: Map<string, ClienteRamoFlags>,
): Record<RamoGerencialFiltro, number> {
  const counts = Object.fromEntries(
    RAMO_GERENCIAL_FILTROS.map(({ value }) => [value, 0]),
  ) as Record<RamoGerencialFiltro, number>;
  counts.todas = ids.length;
  for (const id of ids) {
    const flags = ramosMap.get(id) ?? {};
    for (const { value } of RAMO_GERENCIAL_FILTROS) {
      if (value !== "todas" && pertenceAoRamoGerencial(flags, value)) counts[value] += 1;
    }
  }
  return counts;
}

/**
 * Ressarcimento, judicial e os status extras não têm compensação mensal.
 * Nesses recortes o filtro de período não pode definir a população — senão
 * o cliente conta no badge e some da lista (bug "Ressarcimento = 2, lista
 * vazia", AGF set/2026).
 */
export function recorteSemMovimentoMensal(
  ramo: RamoGerencialFiltro,
  selectedStatuses: Set<StatusCompensacao>,
): boolean {
  if (ramo === "ressarcimento" || ramo === "recuperacao_judicial") return true;
  if (selectedStatuses.size === 0) return false;
  return !STATUS_COMPENSACAO_VALUES.some((s) => selectedStatuses.has(s));
}
