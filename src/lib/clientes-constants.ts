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
  // Honorários vivem na mesma linha em compensacoes_mensais. Sem declarar aqui,
  // CompensacoesTab acessava os três via erro de tipo silenciado pelo build.
  honorario_valor?: number | null;
  honorario_percentual?: number | null;
  valor_nf_servico?: number | null;
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

/** Códigos do enum `tese_tributaria` (catálogo financeiro / tese em uso). */
export const TESE_CATALOG_CODIGOS = [
  "INSUMOS",
  "SUBVENCAO",
  "ICMS_ST",
  "EXCLUSAO_ICMS_BC",
  "PIS_COFINS_JUD",
  "PREVIDENCIARIO",
  "REPORTO",
] as const;

export type TeseCatalogCodigo = (typeof TESE_CATALOG_CODIGOS)[number];

/**
 * Motor usa slugs livres (`pis_cofins_insumos`); o catálogo usa INSUMOS / SUBVENCAO.
 * Sem essa ponte, troca de tese e tese em uso não se enxergam.
 */
export function normalizeTeseCatalogCodigo(
  tese?: string | null,
  nomeExibicao = "",
): TeseCatalogCodigo | string | null {
  const raw = String(tese || "").trim();
  const blob = `${raw} ${nomeExibicao}`.toLowerCase().replace(/[\s-]+/g, "_");
  if (!blob.replace(/_/g, "")) return null;
  if (blob.includes("reporto")) return "REPORTO";
  if (blob.includes("insumo")) return "INSUMOS";
  if (blob.includes("subvenc")) return "SUBVENCAO";
  if (blob.includes("exclusao") && blob.includes("icms")) return "EXCLUSAO_ICMS_BC";
  if (blob.includes("icms_st") || blob.includes("icmsst")) return "ICMS_ST";
  if (blob.includes("pis_cofins_jud") || (blob.includes("jud") && blob.includes("pis"))) {
    return "PIS_COFINS_JUD";
  }
  if (blob.includes("previdenc")) return "PREVIDENCIARIO";
  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if ((TESE_CATALOG_CODIGOS as readonly string[]).includes(upper)) return upper;
  return upper || null;
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

/** Soma compensações no mesmo critério do card Total Compensado e da aba Compensações (sem Reporto / sem órfã duplicada). Não misturar com valor_compensado_manual da view. */
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
  /**
   * Teses com linha em creditos_apurados (no cálculo ou fora).
   * Sem isso, processo de tese sem crédito (GRANO: Subvenção) trava o
   * lançamento e ele some do Total Compensado.
   */
  tesesComCreditoCodigos?: Set<string>;
  /** Teses marcadas no cálculo. Processo dessas teses só conta nelas (Maravista). */
  tesesNoCalculoCodigos?: Set<string>;
};

/** Compensação pertence à tese/processo (link direto, tese_origem ou inferência por tributo). */
export function compMatchesTese(c: CompensacaoSumRow, opts: TeseMatchOpts): boolean {
  const codigo = (opts.teseCodigo || "").toUpperCase();
  if (!codigo || codigo === "REPORTO") return false;

  // Processo explícito manda (usuário escolheu a tese na UI)
  if (c.processo_tese_id && opts.processoIds?.has(c.processo_tese_id)) return true;

  // Linha vinculada a processo: a tese do processo decide nos DOIS sentidos
  // quando essa tese está no recorte ou tem crédito cadastrado (Maravista /
  // São Fernando). Sem crédito (GRANO Subvenção órfã), cai em origem/tributo
  // — senão o lançamento some do card e sobra só no rodapé.
  const procTese = normalizeTeseCatalogCodigo(
    c.processos_teses?.tese,
    c.processos_teses?.nome_exibicao || "",
  );
  if (procTese) {
    const p = String(procTese).toUpperCase();
    if (p === codigo) return true;
    const processoNoCalculo = opts.tesesNoCalculoCodigos?.has(p);
    const processoTemCredito = opts.tesesComCreditoCodigos?.has(p);
    if (processoNoCalculo || processoTemCredito || opts.tesesComCreditoCodigos == null) {
      return false;
    }
  }

  // Tributo com mapeamento claro (IRPJ→Subvenção, PIS→Insumos) corrige tese_origem
  // errada do FIFO/tese_ativa — funciona sem rodar SQL no Lovable.
  const inferred =
    opts.inferOrphans === false
      ? null
      : inferTeseCodigoFromTributo(c.tributo_enum || c.tributo);
  if (inferred) return inferred === codigo;

  if (c.tese_origem_id && opts.teseId && c.tese_origem_id === opts.teseId) return true;
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

export type CreditoApuradoRow = {
  tese_id: string;
  valor_apurado_inicial?: number | null;
  incluir_no_calculo?: boolean | null;
};

/** Padrão Fox / Import Controle: só Insumos e Subvenção entram no Crédito Apurado. */
export function isTeseNoCalculoDefault(codigo: string | null | undefined): boolean {
  const c = String(codigo || "").toUpperCase();
  return c === "INSUMOS" || c === "SUBVENCAO";
}

export type ProcessoCreditoFallback = {
  tese?: string | null;
  nome_exibicao?: string | null;
  valor_credito?: number | null;
};

/**
 * Se o processo INSUMOS/SUBVENCAO ainda não tem linha em creditos_apurados,
 * usa valor_credito no apurado. Linha existente manda — não soma os dois.
 */
export function mergeCreditosComProcessosFallback(params: {
  creditos: CreditoApuradoRow[];
  processos: ProcessoCreditoFallback[];
  teseIdByCodigo: Map<string, string>;
}): CreditoApuradoRow[] {
  const existingTeseIds = new Set(params.creditos.map((c) => c.tese_id));
  const hasFlag = params.creditos.some(
    (c) => c.incluir_no_calculo === true || c.incluir_no_calculo === false,
  );
  const extras: CreditoApuradoRow[] = [];
  const seen = new Set<string>();

  for (const p of params.processos) {
    const codigo = normalizeTeseCatalogCodigo(p.tese, p.nome_exibicao || "");
    if (!codigo || !isTeseNoCalculoDefault(String(codigo))) continue;
    const key = String(codigo).toUpperCase();
    if (seen.has(key)) continue;
    const teseId = params.teseIdByCodigo.get(key);
    if (!teseId || existingTeseIds.has(teseId)) continue;
    seen.add(key);
    extras.push({
      tese_id: teseId,
      valor_apurado_inicial: Number(p.valor_credito || 0),
      incluir_no_calculo: hasFlag ? true : null,
    });
  }

  return extras.length === 0 ? params.creditos : [...params.creditos, ...extras];
}

/**
 * Crédito Apurado / possíveis futuros a partir de creditos_apurados (ao vivo).
 * Não usa v_cliente_totais_calculo (essa view mistura GREATEST com snapshot legado).
 * REPORTO fica em possíveis futuros. Teses marcadas no cálculo entram no apurado.
 */
export function splitCreditosCalculo(
  rows: CreditoApuradoRow[],
  reportoTeseIds?: Set<string>,
): {
  creditoApurado: number;
  possiveisFuturos: number;
  tesesNoCalculo: number;
  teseIdsNoCalculo: Set<string>;
} {
  const hasFlag = rows.some((c) => c.incluir_no_calculo === true || c.incluir_no_calculo === false);
  const inCalculo: CreditoApuradoRow[] = [];
  const foraCalculo: CreditoApuradoRow[] = [];
  for (const c of rows) {
    const isReporto = !!c.tese_id && !!reportoTeseIds?.has(c.tese_id);
    const incluido = !hasFlag || c.incluir_no_calculo === true;
    if (!isReporto && incluido) inCalculo.push(c);
    else foraCalculo.push(c);
  }
  const sum = (list: CreditoApuradoRow[]) =>
    list.reduce((s, c) => s + Number(c.valor_apurado_inicial || 0), 0);
  return {
    creditoApurado: sum(inCalculo),
    possiveisFuturos: sum(foraCalculo),
    tesesNoCalculo: inCalculo.length,
    teseIdsNoCalculo: new Set(inCalculo.map((c) => c.tese_id)),
  };
}

export type TeseBreakdownRow = {
  teseId: string;
  codigo: string;
  label: string;
  apurado: number;
  compensado: number;
  saldo: number;
};

/**
 * Apurado / compensado / saldo por tese, no mesmo recorte dos cards.
 *
 * Sem isso os KPIs somam Insumos + Subvenção num número só, o que cruza
 * apurado de uma tese com compensado de outra em cliente multi-tese
 * (Maravista, São Fernando).
 */
export function breakdownPorTese(params: {
  creditos: CreditoApuradoRow[];
  comps: CompensacaoSumRow[];
  teseInfo: Map<string, { codigo?: string | null; label?: string | null }>;
  processoIdsByTese?: Map<string, Set<string>>;
  reportoTeseIds?: Set<string>;
  reportoProcessoIds?: Set<string>;
}): TeseBreakdownRow[] {
  const { creditos, comps, teseInfo, processoIdsByTese, reportoTeseIds, reportoProcessoIds } =
    params;
  const split = splitCreditosCalculo(creditos, reportoTeseIds);

  const tesesComCreditoCodigos = new Set(
    creditos
      .map((c) => String(teseInfo.get(c.tese_id)?.codigo || "").toUpperCase())
      .filter(Boolean),
  );
  const tesesNoCalculoCodigos = new Set(
    [...split.teseIdsNoCalculo]
      .map((id) => String(teseInfo.get(id)?.codigo || "").toUpperCase())
      .filter(Boolean),
  );

  const apuradoByTese = new Map<string, number>();
  for (const c of creditos) {
    if (!split.teseIdsNoCalculo.has(c.tese_id)) continue;
    apuradoByTese.set(
      c.tese_id,
      (apuradoByTese.get(c.tese_id) ?? 0) + Number(c.valor_apurado_inicial || 0),
    );
  }

  return Array.from(apuradoByTese.entries())
    .map(([teseId, apurado]) => {
      const info = teseInfo.get(teseId);
      const codigo = String(info?.codigo || "").toUpperCase();
      const compensado = sumCompensadoForTese(comps, {
        teseCodigo: codigo,
        teseId,
        processoIds: processoIdsByTese?.get(codigo),
        tesesComCreditoCodigos,
        tesesNoCalculoCodigos,
        reportoTeseIds,
        reportoProcessoIds,
      });
      return {
        teseId,
        codigo,
        label: info?.label || codigo || "Tese",
        apurado,
        compensado,
        saldo: apurado - compensado,
      };
    })
    .sort((a, b) => b.apurado - a.apurado);
}

/** Card consolidado: só teses no cálculo. Não mistura ICMS-ST / Subvenção fora da flag. */
export function sumCompensadoNoCalculo(rows: TeseBreakdownRow[]): number {
  return rows.reduce((s, r) => s + r.compensado, 0);
}

/** Agrupa processos pelo código do catálogo (slug do Motor → INSUMOS / SUBVENCAO). */
export function buildProcessoIdsByTese(
  processos: { id: string; tese?: string | null; nome_exibicao?: string | null }[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of processos) {
    const cod = normalizeTeseCatalogCodigo(p.tese, p.nome_exibicao || "");
    if (!cod) continue;
    const key = String(cod).toUpperCase();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(p.id);
  }
  return map;
}

/** Formata um percentual decimal (0.15) como rótulo ("15%"), com uma casa só quando precisa. */
function percentualLabel(perc: number): string {
  const pct = perc * 100;
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
}

/**
 * Rótulo de honorários de um GRUPO de compensações (um processo, um mês).
 *
 * Existe porque um mesmo mês pode ter percentuais diferentes por tributo — a
 * MARAVISTA em AGO/2026 tinha INSS a 15% e PIS/COFINS a 20%. Antes o Mapa
 * mostrava só o percentual da primeira linha, e quem multiplicasse a base pelo
 * percentual exibido encontrava uma diferença que não existia (bug reportado
 * pelo Focus em 26/08/2026).
 *
 * Para UMA compensação isolada continue usando o percentual da própria linha —
 * aqui o plural é o ponto.
 */
export function formatPercentualHonorarios(
  comps: { honorario_percentual?: number | null }[],
  fallbackPercentual?: number | null,
): string {
  const distintos = Array.from(
    new Set(
      (comps || [])
        .map((c) => Number(c?.honorario_percentual ?? 0))
        .filter((p) => Number.isFinite(p) && p > 0),
    ),
  ).sort((a, b) => a - b);

  if (distintos.length === 0) {
    return percentualLabel(Number(fallbackPercentual ?? 0));
  }
  if (distintos.length === 1) {
    return percentualLabel(distintos[0]);
  }

  const labels = distintos.map(percentualLabel);
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}
