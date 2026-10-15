import type { TipoRecuperacao } from "@/lib/tipo-recuperacao";
import {
  isProcessoJudicialForaCalculo,
  isReportoProcesso,
  normalizeTeseCatalogCodigo,
  processoTeseCatalogCodigo,
} from "@/lib/clientes-constants";
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

/**
 * O seletor tem duas naturezas (AGF 15/10/2026). "Status da empresa" recorta
 * pelo status geral do cadastro e mostra só as teses administrativas.
 * "Por tese" (Reporto, Recuperação Judicial) recorta por tese cadastrada —
 * toda empresa que tem a tese, qualquer que seja o status dela — e mostra só
 * os valores dessa tese. Antes as duas eram status da empresa, e a mesma
 * empresa mudava de valor conforme a opção marcada.
 */
export const STATUS_FILTRO_EMPRESA = [
  "compensando",
  "encerrado",
  "ressarcimento_concluido",
] as const;

export const STATUS_FILTRO_TESE = ["reporto", "recuperacao_judicial"] as const;

export type StatusFiltroTese = (typeof STATUS_FILTRO_TESE)[number];

/** Código oficial da tese que cada opção "por tese" representa. */
export const TESE_DO_STATUS_FILTRO: Record<StatusFiltroTese, string> = {
  reporto: "REPORTO",
  recuperacao_judicial: "PIS_COFINS_JUD",
};

export function isStatusFiltroTese(
  value: string | null | undefined,
): value is StatusFiltroTese {
  return STATUS_FILTRO_TESE.some((item) => item === value);
}

export interface ClienteTeseFlags {
  tem_reporto?: boolean;
  tem_judicial?: boolean;
}

export interface ProcessoTeseFlagsRow {
  cliente_id: string;
  tese?: string | null;
  nome_exibicao?: string | null;
  categoria?: string | null;
  tipo_recuperacao?: TipoRecuperacao | string | null;
  status_processo?: string | null;
}

export interface CreditoTeseFlagsRow {
  cliente_id: string;
  tese_id: string;
}

/**
 * Quais empresas têm Reporto / via judicial cadastrados. Lê processo e crédito
 * apurado: o Reporto legado às vezes só existe como crédito. Processo
 * desistido não conta.
 */
export function buildTeseFlagsPorCliente(
  processos: ProcessoTeseFlagsRow[],
  creditos: CreditoTeseFlagsRow[] = [],
  teses: Array<{ id: string; codigo?: string | null }> = [],
): Map<string, ClienteTeseFlags> {
  const out = new Map<string, ClienteTeseFlags>();
  const marcar = (clienteId: string, flag: keyof ClienteTeseFlags) => {
    const atual = out.get(clienteId) ?? {};
    atual[flag] = true;
    out.set(clienteId, atual);
  };
  for (const p of processos) {
    if (p.status_processo === "desistiu") continue;
    if (isReportoProcesso(p)) marcar(p.cliente_id, "tem_reporto");
    else if (
      isProcessoJudicialForaCalculo(p) ||
      p.tipo_recuperacao === "recuperacao_judicial" ||
      processoTeseCatalogCodigo(p) === TESE_DO_STATUS_FILTRO.recuperacao_judicial
    ) {
      marcar(p.cliente_id, "tem_judicial");
    }
  }
  const codigoPorTeseId = new Map(
    teses.map((t) => [t.id, String(normalizeTeseCatalogCodigo(t.codigo) ?? "").toUpperCase()]),
  );
  for (const c of creditos) {
    const codigo = codigoPorTeseId.get(c.tese_id);
    if (codigo === TESE_DO_STATUS_FILTRO.reporto) marcar(c.cliente_id, "tem_reporto");
    else if (codigo === TESE_DO_STATUS_FILTRO.recuperacao_judicial) marcar(c.cliente_id, "tem_judicial");
  }
  return out;
}

export function pertenceAoStatusTese(
  status: StatusFiltroTese,
  flags?: ClienteTeseFlags,
  statusCliente?: StatusCompensacao,
): boolean {
  // Status gravado no cadastro continua valendo como fallback (empresa só
  // com Reporto, ou marcada como Recuperação Judicial sem processo).
  if (statusCliente === status) return true;
  return status === "reporto" ? !!flags?.tem_reporto : !!flags?.tem_judicial;
}

/** Separa a seleção do filtro nas duas naturezas. Vazio = tudo marcado. */
export function modoFiltroStatus(selected: Set<StatusCompensacao>) {
  const tudo = selected.size === 0 || STATUS_FILTRO_VALUES.every((s) => selected.has(s));
  const empresa = STATUS_FILTRO_EMPRESA.filter((s) => selected.has(s));
  const teses = STATUS_FILTRO_TESE.filter((s) => selected.has(s));
  return {
    tudo,
    empresa,
    teses,
    /** Só opções "por tese" marcadas: os cards passam a mostrar essas teses. */
    soTese: !tudo && empresa.length === 0 && teses.length > 0,
    codigosTese: teses.map((s) => TESE_DO_STATUS_FILTRO[s]),
  };
}

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
  tese?: string | null;
  nome_exibicao?: string | null;
  categoria?: string | null;
}

export function isStatusFiltroExtra(
  value: string | null | undefined,
): value is StatusFiltroExtra {
  return STATUS_FILTRO_EXTRAS.some((item) => item === value);
}

export function normalizarStatusCompensacao(row: StatusCompensacaoRow): StatusCompensacao {
  const status = row.status_principal;
  // Recuperação Judicial / Ressarcimento concluído marcados no cadastro são
  // classificação explícita da equipe: valem mesmo com compensação no mês.
  if (isStatusFiltroExtra(status)) return status;
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

/**
 * Ressarcimento concluído é status geral do cadastro: ter uma tese no ramo
 * de ressarcimento NÃO basta (o ramo tem filtro próprio, "Tipo de
 * recuperação"). Reporto e Recuperação Judicial são "por tese" — ver
 * `pertenceAoStatusTese`.
 */
export function pertenceAoStatusExtra(
  status: StatusFiltroExtra,
  statusCliente?: StatusCompensacao,
): boolean {
  return statusCliente === status;
}

const isStatusExtra = (status: StatusCompensacao | undefined): status is StatusFiltroExtra =>
  STATUS_FILTRO_EXTRAS.includes(status as StatusFiltroExtra);

/**
 * Predicado do filtro de status. A parte "status da empresa" e a parte "por
 * tese" somam (união): com Total Compensados + Reporto marcados, a empresa
 * que compensa e a que só tem Reporto aparecem; a que compensa E tem Reporto
 * aparece uma vez. Sem `teseFlags` (chamada legada) só o status gravado no
 * cadastro decide a parte "por tese".
 */
export function makeStatusFilterPredicate(
  selected: Set<StatusCompensacao>,
  statusMap: Map<string, StatusCompensacao>,
  teseFlags: Map<string, ClienteTeseFlags> = new Map(),
) {
  const modo = modoFiltroStatus(selected);
  const algumEmpresa = modo.empresa.length > 0;
  // Com Total Compensados e Encerrado marcados, o legado sem classificação
  // (`prevista` / `sem_operacao`) passa inteiro, como antes das opções novas.
  const legadoPassa = selected.has("compensando") && selected.has("encerrado");
  return (clienteId: string | null | undefined) => {
    if (modo.tudo) return true;
    if (!clienteId) return algumEmpresa;
    const status = statusMap.get(clienteId);
    if (modo.teses.some((s) => pertenceAoStatusTese(s, teseFlags.get(clienteId), status))) {
      return true;
    }
    // Empresa cujo status geral é "só Reporto" / "Recuperação Judicial" só
    // entra pelo lado "por tese", nunca como status de empresa.
    if (isStatusFiltroTese(status)) return false;
    if (status && selected.has(status)) return true;
    if (!algumEmpresa) return false;
    // Sem linha de status: fail-open só para os status de empresa.
    if (!status) return true;
    return legadoPassa && (status === "prevista" || status === "sem_operacao");
  };
}

/** Quantas empresas cada opção do seletor traria sozinha (badge = lista). */
export function contarPorFiltroStatus(
  ids: string[],
  statusMap: Map<string, StatusCompensacao>,
  teseFlags: Map<string, ClienteTeseFlags> = new Map(),
): Partial<Record<StatusCompensacao, number>> {
  return Object.fromEntries(
    STATUS_FILTRO_VALUES.map((status) => [
      status,
      ids.filter(makeStatusFilterPredicate(new Set([status]), statusMap, teseFlags)).length,
    ]),
  );
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
  teseFlags: Map<string, ClienteTeseFlags> = new Map(),
): Set<string> {
  const porStatus = makeStatusFilterPredicate(selectedStatuses, statusMap, teseFlags);
  const porRamo = makeRamoFilterPredicate(ramo, ramosMap);
  return new Set(ids.filter((id) => porStatus(id) && porRamo(id)));
}

export function countByStatus(
  ids: string[],
  statusMap: Map<string, StatusCompensacao>,
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
    const status = statusMap.get(id) ?? "sem_operacao";
    if (!isStatusExtra(status)) counts[status] += 1;
    if (isStatusExtra(status)) counts[status] += 1;
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
  // Reporto / judicial não têm compensação mensal: só o status de empresa
  // "Total Compensados" ou "Encerrado" segue o período.
  return !["compensando", "encerrado"].some((s) => selectedStatuses.has(s as StatusCompensacao));
}
