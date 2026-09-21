import { processoTeseCatalogCodigo } from "@/lib/clientes-constants";
import type {
  CompLike,
  CreditoLike,
  ProcessoLike,
  TeseLike,
} from "@/lib/operacional-analytics";

export type TipoTeseFiltro = string | null;

export interface TipoTeseOpcao {
  value: string;
  label: string;
  clientes: number;
}

const normalizar = (value: string | null | undefined) => String(value ?? "").trim();

export function codigoTipoTeseProcesso(
  processo: Pick<ProcessoLike, "categoria" | "tese" | "nome_exibicao">,
): string | null {
  return processoTeseCatalogCodigo(processo);
}

function catalogoTeses(teses: TeseLike[]) {
  return new Map(
    teses.map((tese) => [
      tese.id,
      {
        codigo: normalizar(tese.codigo).toUpperCase(),
        label: normalizar(tese.label || tese.codigo),
      },
    ]),
  );
}

export function idsClientesPorTipoTese(
  processos: ProcessoLike[],
  creditos: CreditoLike[],
  teses: TeseLike[],
): Map<string, Set<string>> {
  const catalogo = catalogoTeses(teses);
  const out = new Map<string, Set<string>>();
  const adicionar = (codigo: string | null, clienteId: string) => {
    if (!codigo) return;
    const ids = out.get(codigo) ?? new Set<string>();
    ids.add(clienteId);
    out.set(codigo, ids);
  };

  for (const processo of processos) {
    adicionar(codigoTipoTeseProcesso(processo), processo.cliente_id);
  }
  for (const credito of creditos) {
    adicionar(catalogo.get(credito.tese_id)?.codigo || null, credito.cliente_id);
  }
  return out;
}

/** Sem seleção mantém todos os clientes ativos; a exclusão de REPORTO é financeira. */
export function filtrarIdsPorTipoTese(
  ids: Iterable<string>,
  tipoTese: TipoTeseFiltro,
  processos: ProcessoLike[],
  creditos: CreditoLike[],
  teses: TeseLike[],
): Set<string> {
  const todos = new Set(ids);
  if (!tipoTese) return todos;
  const comTese = idsClientesPorTipoTese(processos, creditos, teses).get(tipoTese);
  return new Set([...todos].filter((id) => comTese?.has(id)));
}

export function listarTiposTese(
  processos: ProcessoLike[],
  creditos: CreditoLike[],
  teses: TeseLike[],
): TipoTeseOpcao[] {
  const catalogo = catalogoTeses(teses);
  const labels = new Map<string, string>();
  for (const tese of teses) {
    const info = catalogo.get(tese.id);
    if (info?.codigo) labels.set(info.codigo, info.label || info.codigo);
  }
  for (const processo of processos) {
    const codigo = codigoTipoTeseProcesso(processo);
    if (!codigo) continue;
    const label =
      codigo === "REPORTO"
        ? "REPORTO"
        : normalizar(processo.nome_exibicao) || codigo;
    if (!labels.has(codigo)) labels.set(codigo, label);
  }

  const clientes = idsClientesPorTipoTese(processos, creditos, teses);
  return [...clientes.entries()]
    .map(([value, ids]) => ({
      value,
      label: labels.get(value) || value,
      clientes: ids.size,
    }))
    .sort((a, b) => {
      if (a.value === "REPORTO") return 1;
      if (b.value === "REPORTO") return -1;
      return a.label.localeCompare(b.label, "pt-BR");
    });
}

export function filtrarProcessosPorTipoTese(
  processos: ProcessoLike[],
  tipoTese: TipoTeseFiltro,
): ProcessoLike[] {
  if (!tipoTese) return processos;
  return processos.filter((processo) => codigoTipoTeseProcesso(processo) === tipoTese);
}

export function filtrarCreditosPorTipoTese(
  creditos: CreditoLike[],
  teses: TeseLike[],
  tipoTese: TipoTeseFiltro,
): CreditoLike[] {
  if (!tipoTese) return creditos;
  const ids = new Set(
    teses
      .filter((tese) => normalizar(tese.codigo).toUpperCase() === tipoTese)
      .map((tese) => tese.id),
  );
  return creditos.filter((credito) => ids.has(credito.tese_id));
}

export function filtrarCompensacoesPorTipoTese(
  comps: CompLike[],
  processos: ProcessoLike[],
  teses: TeseLike[],
  tipoTese: TipoTeseFiltro,
): CompLike[] {
  if (!tipoTese) return comps;
  const teseIds = new Set(
    teses
      .filter((tese) => normalizar(tese.codigo).toUpperCase() === tipoTese)
      .map((tese) => tese.id),
  );
  const processoIds = new Set(
    processos
      .filter((processo) => codigoTipoTeseProcesso(processo) === tipoTese)
      .map((processo) => processo.id),
  );
  return comps.filter(
    (comp) =>
      (!!comp.tese_origem_id && teseIds.has(comp.tese_origem_id)) ||
      (!!comp.processo_tese_id && processoIds.has(comp.processo_tese_id)),
  );
}
