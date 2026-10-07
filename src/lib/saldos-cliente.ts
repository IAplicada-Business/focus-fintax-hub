/**
 * Saldo do cliente — uma conta só para o card "Saldo restante", o filtro de
 * tese da aba Compensações e o Mapa Tributário (AGF set/2026, itens 5–7).
 *
 * Antes cada tela somava de um jeito: o card usava créditos apurados e a
 * atribuição por tese de `breakdownPorTese`; o filtro da aba casava só por
 * `processo_tese_id` (órfãs sumiam); o Mapa buscava o crédito por
 * `upper(tese)` (slug `pis_cofins_insumos` nunca achava INSUMOS) e caía no
 * `valor_credito` do processo. Os três números divergiam.
 *
 * Regra única:
 *   saldo da tese = Valor Total do Benefício (crédito apurado da tese)
 *                 − Σ Valor Utilizado na Compensação (todas as competências
 *                   até o mês de referência)
 *   saldo total   = crédito apurado no cálculo − total compensado (card)
 */
import {
  breakdownPorTese,
  buildProcessoIdsByTese,
  filterCompsForTese,
  isReportoCompensacao,
  isProcessoForaDoCalculo,
  isReportoProcesso,
  mergeCreditosComProcessosFallback,
  normalizeTeseCatalogCodigo,
  splitCreditosCalculo,
  sumCompensadoCanonical,
  teseMatchContext,
  teseOficialLabel,
  type CompensacaoSumRow,
  type CreditoApuradoRow,
  type TeseBreakdownRow,
} from "@/lib/clientes-constants";

export type SaldoCompRow = CompensacaoSumRow & { mes_referencia?: string | null };

export interface SaldoProcessoRow {
  id: string;
  tese?: string | null;
  nome_exibicao?: string | null;
  categoria?: string | null;
  valor_credito?: number | string | null;
}

export interface SaldoTeseCatalogo {
  id: string;
  codigo?: string | null;
  label?: string | null;
}

export interface SaldosClienteInput<C extends SaldoCompRow = SaldoCompRow> {
  creditos: CreditoApuradoRow[];
  comps: C[];
  processos: SaldoProcessoRow[];
  teses: SaldoTeseCatalogo[];
  /** `YYYY-MM` inclusive. Vazio = desde o início. */
  mesInicio?: string;
  /** `YYYY-MM` inclusive. Vazio = até hoje. */
  mesFim?: string;
}

export interface SaldoTese extends TeseBreakdownRow {
  /** Tese marcada no cálculo do cliente (entra no card consolidado). */
  noCalculo: boolean;
}

const mesDe = (value: string | null | undefined) => String(value || "").slice(0, 7);

/** Código oficial de uma linha do catálogo (legado EXCLUSAO_ICMS_BC → PIS_COFINS_JUD). */
export function codigoOficialCatalogo(codigo: string | null | undefined): string {
  return String(normalizeTeseCatalogCodigo(codigo) ?? "").toUpperCase();
}

export function calcularSaldosCliente<C extends SaldoCompRow>(input: SaldosClienteInput<C>) {
  const teseIdByCodigo = new Map<string, string>();
  for (const t of input.teses) {
    const codigo = String(t.codigo || "").toUpperCase();
    if (codigo && !teseIdByCodigo.has(codigo)) teseIdByCodigo.set(codigo, t.id);
  }
  const teseInfo = new Map(
    input.teses.map((t) => [
      t.id,
      {
        codigo: t.codigo,
        label: teseOficialLabel(codigoOficialCatalogo(t.codigo)) ?? t.label,
      },
    ]),
  );

  const creditos = mergeCreditosComProcessosFallback({
    creditos: input.creditos,
    processos: input.processos.map((p) => ({
      tese: p.tese,
      nome_exibicao: p.nome_exibicao,
      valor_credito: Number(p.valor_credito || 0),
      categoria: p.categoria,
    })),
    teseIdByCodigo,
  });

  const reportoTeseIds = new Set(
    input.teses
      .filter((t) => String(t.codigo || "").toUpperCase() === "REPORTO")
      .map((t) => t.id),
  );
  const reportoProcessoIds = new Set(
    input.processos.filter(isProcessoForaDoCalculo).map((p) => p.id),
  );
  const reportoOpts = { reportoTeseIds, reportoProcessoIds };

  // A atribuição por tese lê `processos_teses` embutido na linha; quando a
  // consulta não trouxe o join, completa pelo processo do próprio cliente.
  const processoPorId = new Map(input.processos.map((p) => [p.id, p]));
  const compsCompletas = input.comps.map((c) => {
    if (c.processos_teses || !c.processo_tese_id) return c;
    const p = processoPorId.get(c.processo_tese_id);
    return p
      ? { ...c, processos_teses: { tese: p.tese, nome_exibicao: p.nome_exibicao, categoria: p.categoria } }
      : c;
  });
  const comps = compsCompletas.filter((c) => !isReportoCompensacao(c, reportoOpts));
  const compsNoPeriodo = comps.filter((c) => {
    const mes = mesDe(c.mes_referencia);
    if (input.mesInicio && mes < input.mesInicio) return false;
    if (input.mesFim && mes > input.mesFim) return false;
    return true;
  });

  const split = splitCreditosCalculo(creditos, reportoTeseIds);
  const processoIdsByTese = buildProcessoIdsByTese(input.processos);
  const contexto = teseMatchContext(creditos, teseInfo, reportoTeseIds);

  const porTese: SaldoTese[] = breakdownPorTese({
    creditos,
    comps: compsNoPeriodo,
    teseInfo,
    processoIdsByTese,
    reportoTeseIds,
    reportoProcessoIds,
  }).map((row) => ({ ...row, noCalculo: true }));

  const apuradoTotal = split.creditoApurado;
  const compensadoTotal = sumCompensadoCanonical(compsNoPeriodo, reportoOpts);

  /** Opções de atribuição idênticas às do card, para uma tese. */
  const matchOpts = (codigo: string) => {
    const code = String(codigo || "").toUpperCase();
    return {
      teseCodigo: code,
      teseId: teseIdByCodigo.get(code) ?? null,
      processoIds: processoIdsByTese.get(code),
      ...contexto,
      ...reportoOpts,
    };
  };

  /** Lançamentos (canônicos, sem duplicata órfã) atribuídos à tese, no recorte de meses. */
  const compsDaTese = (codigo: string): C[] =>
    filterCompsForTese(compsNoPeriodo, matchOpts(codigo)) as C[];

  /**
   * Saldo de uma tese. Para tese no cálculo é a mesma linha do card; para
   * tese fora do cálculo (ex.: ICMS-ST sem flag) usa o crédito cadastrado
   * ou, na falta, o `valor_credito` dos processos da tese.
   */
  const saldoDaTese = (codigo: string): SaldoTese => {
    const code = String(codigo || "").toUpperCase();
    const doCard = porTese.find((row) => row.codigo === code);
    if (doCard) return doCard;
    const teseId = teseIdByCodigo.get(code) ?? "";
    const credito = creditos.find((c) => c.tese_id === teseId);
    const processosDaTese = input.processos.filter((p) =>
      processoIdsByTese.get(code)?.has(p.id),
    );
    const apurado = credito
      ? Number(credito.valor_apurado_inicial || 0)
      : processosDaTese.reduce((s, p) => Math.max(s, Number(p.valor_credito || 0)), 0);
    const compensado = compsDaTese(code).reduce(
      (s, c) => s + Number(c.valor_compensado || 0),
      0,
    );
    return {
      teseId,
      codigo: code,
      label: teseOficialLabel(code) ?? processosDaTese[0]?.nome_exibicao ?? code,
      apurado,
      compensado,
      saldo: apurado - compensado,
      noCalculo: false,
    };
  };

  return {
    creditos,
    comps,
    compsNoPeriodo,
    porTese,
    apuradoTotal,
    compensadoTotal,
    saldoTotal: apuradoTotal - compensadoTotal,
    reportoTeseIds,
    reportoProcessoIds,
    teseIdByCodigo,
    processoIdsByTese,
    matchOpts,
    compsDaTese,
    saldoDaTese,
  };
}

export type SaldosCliente = ReturnType<typeof calcularSaldosCliente>;
