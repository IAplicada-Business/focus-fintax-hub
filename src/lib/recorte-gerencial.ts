import type { ClienteRamoFlags, RamoGerencialFiltro } from "@/lib/esteira-acompanhamento";
import { RAMO_GERENCIAL_FILTROS } from "@/lib/esteira-acompanhamento";
import {
  STATUS_FILTRO_VALUES,
  filtrarIdsRecorteGerencial,
  recorteSemMovimentoMensal,
  type StatusCompensacao,
} from "@/lib/gerencial-filters";
import { filtrarIdsPorTipoTese, type TipoTeseFiltro } from "@/lib/tese-filter";
import { filterClientIdsByDashboardPeriod, type DashboardPeriod } from "@/lib/dashboard-period";
import type { CompLike, CreditoLike, ProcessoLike, TeseLike } from "@/lib/operacional-analytics";

export interface RecorteGerencialInput {
  clienteIds: string[];
  statusMap: Map<string, StatusCompensacao>;
  ramosMap: Map<string, ClienteRamoFlags>;
  tipoTese: TipoTeseFiltro;
  periodo: DashboardPeriod;
  processos: ProcessoLike[];
  creditos: CreditoLike[];
  teses: TeseLike[];
  comps: CompLike[];
}

/**
 * População de clientes de um painel gerencial (status → ramo → tese →
 * período). A mesma função alimenta a lista e o número ao lado de cada
 * opção dos filtros, então badge e listagem não divergem.
 */
export function makeRecorteGerencial(input: RecorteGerencialInput) {
  const recortePara = (
    ramo: RamoGerencialFiltro,
    statuses: Set<StatusCompensacao>,
  ): Set<string> => {
    const idsGerenciais = filtrarIdsRecorteGerencial(
      input.clienteIds,
      statuses,
      ramo,
      input.statusMap,
      input.ramosMap,
    );
    const idsTese = filtrarIdsPorTipoTese(
      idsGerenciais,
      input.tipoTese,
      input.processos,
      input.creditos,
      input.teses,
    );
    if (recorteSemMovimentoMensal(ramo, statuses)) return idsTese;
    return filterClientIdsByDashboardPeriod(idsTese, input.periodo, input.comps, input.processos);
  };

  const contagens = (ramo: RamoGerencialFiltro, statuses: Set<StatusCompensacao>) => ({
    ramoCounts: Object.fromEntries(
      RAMO_GERENCIAL_FILTROS.map(({ value }) => [value, recortePara(value, statuses).size]),
    ) as Partial<Record<RamoGerencialFiltro, number>>,
    statusCounts: Object.fromEntries(
      STATUS_FILTRO_VALUES.map((status) => [status, recortePara(ramo, new Set([status])).size]),
    ) as Partial<Record<StatusCompensacao, number>>,
  });

  return { recortePara, contagens };
}
