export const STATUS_CONTRATO = [
  { value: "assinado", label: "Assinado", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "aguardando_assinatura", label: "Aguardando", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "nao_vai_fazer", label: "Não vai fazer", color: "bg-gray-100 text-gray-600 border-gray-200" },
] as const;

export const STATUS_PROCESSO = [
  { value: "compensando", label: "Compensando", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "pedido_feito_receita", label: "Pedido feito Receita", color: "bg-orange-100 text-orange-800 border-orange-200" },
  { value: "nao_protocolado", label: "Não protocolado", color: "bg-red-100 text-red-800 border-red-200" },
  { value: "a_iniciar", label: "A iniciar", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "compensado", label: "Compensado", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "a_compensar", label: "A compensar", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "protocolado", label: "Protocolado", color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "desistiu", label: "Desistiu", color: "bg-gray-200 text-gray-700 border-gray-300" },
] as const;

export const STATUS_PAGAMENTO = [
  { value: "pago", label: "Pago", color: "bg-green-100 text-green-800" },
  { value: "pendente", label: "Pendente", color: "bg-orange-100 text-orange-800" },
] as const;

export function getStatusContratoConfig(value: string) {
  return STATUS_CONTRATO.find((s) => s.value === value) ?? STATUS_CONTRATO[1];
}

export function getStatusProcessoConfig(value: string) {
  return STATUS_PROCESSO.find((s) => s.value === value) ?? STATUS_PROCESSO[3];
}

export function getStatusPagamentoConfig(value: string) {
  return STATUS_PAGAMENTO.find((s) => s.value === value) ?? STATUS_PAGAMENTO[1];
}

export function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const MESES_PT_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

/** Formata competência YYYY-MM ou YYYY-MM-DD sem shift de fuso (evita out/2025 p/ 2025-11-01). */
export function formatCompetenciaPT(mesRef: string | null | undefined): string {
  if (!mesRef) return "—";
  const m = String(mesRef).match(/^(\d{4})-(\d{2})/);
  if (!m) return String(mesRef);
  const mesIdx = parseInt(m[2], 10) - 1;
  if (mesIdx < 0 || mesIdx > 11) return String(mesRef);
  return `${MESES_PT_CURTO[mesIdx]}/${m[1]}`;
}

export type CompensacaoSumRow = {
  valor_compensado?: number | null;
  tese_origem_id?: string | null;
  processo_tese_id?: string | null;
  mes_referencia?: string | null;
  tributo?: string | null;
  tributo_enum?: string | null;
  processos_teses?: { tese?: string | null; categoria?: string | null; nome_exibicao?: string | null } | null;
};

/** REPORTO / possíveis futuros — fora do Total Compensado (mesmo com tese_origem_id nulo). */
export function isReportoCompensacao(
  c: CompensacaoSumRow,
  opts?: {
    reportoTeseIds?: Set<string>;
    reportoProcessoIds?: Set<string>;
  },
): boolean {
  const tese = (c.processos_teses?.tese || "").toUpperCase();
  const cat = (c.processos_teses?.categoria || "").toLowerCase();
  const nome = (c.processos_teses?.nome_exibicao || "").toUpperCase();
  if (tese === "REPORTO" || cat === "reporto" || nome.includes("REPORTO")) return true;
  if (c.tese_origem_id && opts?.reportoTeseIds?.has(c.tese_origem_id)) return true;
  if (c.processo_tese_id && opts?.reportoProcessoIds?.has(c.processo_tese_id)) return true;
  return false;
}

/** Normaliza tributo para chave de dedupe (enum ou texto livre). */
export function tributoKey(c: { tributo?: string | null; tributo_enum?: string | null }): string {
  return String(c.tributo_enum || c.tributo || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/**
 * Inferência de tese pelo tributo quando a linha veio órfã (sem tese_origem / processo).
 * Alinha fluxo de caixa: PIS/COFINS/INSS → Insumos; IRPJ/CSLL → Subvenção; ICMS → ICMS ST.
 */
export function inferTeseCodigoFromTributo(tributo: string | null | undefined): string | null {
  const t = String(tributo || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!t) return null;
  if (t.includes("IRPJ") || t.includes("CSLL")) return "SUBVENCAO";
  if (t === "ICMS" || t.includes("ICMS_ST") || t === "ICMS-ST") return "ICMS_ST";
  if (
    t === "PIS" ||
    t === "COFINS" ||
    t.includes("PIS_COFINS") ||
    t.startsWith("INSS") ||
    t.includes("PREV") ||
    t === "OUTROS"
  ) {
    return "INSUMOS";
  }
  return null;
}

function mesKey(mes: string | null | undefined): string {
  return String(mes || "").slice(0, 7);
}

/** Órfã só é duplicata se existir gêmea linkada no mesmo mês+tributo+valor (±1,5 centavo). */
export function isOrphanDuplicateOfLinked(
  orphan: CompensacaoSumRow,
  linkedRows: CompensacaoSumRow[],
): boolean {
  if (orphan.tese_origem_id) return false;
  const mes = mesKey(orphan.mes_referencia);
  const trib = tributoKey(orphan);
  const valor = Number(orphan.valor_compensado || 0);
  return linkedRows.some((l) => {
    if (!l.tese_origem_id) return false;
    if (mesKey(l.mes_referencia) !== mes) return false;
    if (tributoKey(l) !== trib) return false;
    return Math.abs(Number(l.valor_compensado || 0) - valor) < 0.015;
  });
}

/**
 * Linhas que entram no Total Compensado:
 * sem Reporto; órfãs duplicadas (mesmo mês+tributo+valor de uma linkada) fora.
 * NÃO descarta órfãs só porque o mês já tem outra linha linkada (bug Maravista).
 */
export function filterCompensadoCanonical(
  rows: CompensacaoSumRow[],
  opts?: { reportoTeseIds?: Set<string>; reportoProcessoIds?: Set<string> },
): CompensacaoSumRow[] {
  const linked = rows.filter((c) => !!c.tese_origem_id);
  return rows.filter((c) => {
    if (isReportoCompensacao(c, opts)) return false;
    if (!c.tese_origem_id && isOrphanDuplicateOfLinked(c, linked)) return false;
    return true;
  });
}

/** Soma compensações no mesmo critério do card Total Compensado (sem Reporto / sem órfã duplicada). */
export function sumCompensadoCanonical(
  rows: CompensacaoSumRow[],
  opts?: { reportoTeseIds?: Set<string>; reportoProcessoIds?: Set<string> },
): number {
  return filterCompensadoCanonical(rows, opts).reduce(
    (s, c) => s + Number(c.valor_compensado || 0),
    0,
  );
}

export type TeseMatchOpts = {
  teseCodigo: string;
  teseId?: string | null;
  processoIds?: Set<string>;
  /** Quando true, órfãs sem tese caem na inferência por tributo. Default true. */
  inferOrphans?: boolean;
};

/** Compensação pertence à tese/processo (link direto, tese_origem ou inferência por tributo). */
export function compMatchesTese(c: CompensacaoSumRow, opts: TeseMatchOpts): boolean {
  const codigo = (opts.teseCodigo || "").toUpperCase();
  if (!codigo || codigo === "REPORTO") return false;

  if (c.processo_tese_id && opts.processoIds?.has(c.processo_tese_id)) return true;
  if (c.tese_origem_id && opts.teseId && c.tese_origem_id === opts.teseId) return true;

  const procTese = (c.processos_teses?.tese || "").toUpperCase();
  if (procTese && procTese === codigo) return true;

  if (opts.inferOrphans === false) return false;
  // Órfã pura: sem processo e sem tese_origem → inferir pelo tributo
  if (!c.processo_tese_id && !c.tese_origem_id) {
    const inferred = inferTeseCodigoFromTributo(c.tributo_enum || c.tributo);
    return inferred === codigo;
  }
  return false;
}

/** Filtra e dedupa linhas da tese para Mapa Tributário / saldo por tese. */
export function filterCompsForTese(
  rows: CompensacaoSumRow[],
  opts: TeseMatchOpts & { reportoTeseIds?: Set<string>; reportoProcessoIds?: Set<string> },
): CompensacaoSumRow[] {
  return filterCompensadoCanonical(rows, opts).filter((c) => compMatchesTese(c, opts));
}

export function sumCompensadoForTese(
  rows: CompensacaoSumRow[],
  opts: TeseMatchOpts & { reportoTeseIds?: Set<string>; reportoProcessoIds?: Set<string> },
): number {
  return filterCompsForTese(rows, opts).reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
}

/** Status de utilização derivado do saldo (não usa flag sticky do banco). */
export function statusUtilizacaoFromSaldo(
  apurado: number,
  compensado: number,
): "a_utilizar" | "em_uso" | "utilizado" {
  if (compensado <= 0.011) return "a_utilizar";
  if (apurado - compensado <= 0.011) return "utilizado";
  return "em_uso";
}
