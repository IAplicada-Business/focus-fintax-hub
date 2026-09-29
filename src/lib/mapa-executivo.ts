/**
 * Dados do novo Mapa Tributário — "Relatório Executivo · Compensações"
 * (modelo AGF set/2026). Tudo vem do banco via `calcularSaldosCliente`,
 * então o saldo da tese do mapa é o mesmo do card "Saldo restante"
 * filtrado por tese e da aba Compensações.
 */
import {
  formatPercentualHonorarios,
  teseOficialLabel,
} from "@/lib/clientes-constants";
import {
  calcularSaldosCliente,
  type SaldoCompRow,
  type SaldosClienteInput,
} from "@/lib/saldos-cliente";

export type MapaCompRow = SaldoCompRow & {
  processo_tese_id?: string | null;
  honorario_percentual?: number | null;
};

export interface MapaProcessoRow {
  id: string;
  tese?: string | null;
  nome_exibicao?: string | null;
  categoria?: string | null;
  valor_credito?: number | string | null;
  percentual_honorario?: number | string | null;
  situacao_fiscal?: string | null;
  credito_tributario_status?: string | null;
  obrigacoes_retificadas?: string | null;
}

export interface MapaTeseFiscal {
  codigo?: string | null;
  base_legal?: string | null;
  obrigacoes_retificadas?: string | null;
}

export interface MapaExecutivoInput extends Omit<SaldosClienteInput<MapaCompRow>, "processos" | "mesInicio" | "mesFim"> {
  processos: MapaProcessoRow[];
  /** Código oficial da tese principal do mapa. */
  codigo: string;
  /** Competência `YYYY-MM`. */
  mes: string;
  /** Campos fiscais do catálogo (opcional — cai no padrão da tese). */
  tesesFiscal?: MapaTeseFiscal[];
}

export interface MapaTributoLinha {
  tributo: string;
  valor: number;
  pct: number;
}

export interface MapaCarteiraLinha {
  codigo: string;
  label: string;
  saldo: number;
  atual: boolean;
}

export interface MapaExecutivoData {
  codigo: string;
  teseLabel: string;
  mes: string;
  credito: {
    total: number;
    utilizado: number;
    saldo: number;
    pctUtilizado: number;
    pctSaldo: number;
    /** Meses de saldo no ritmo médio mensal; null sem histórico. */
    folegoMeses: number | null;
    mediaMensal: number;
  };
  tributos: MapaTributoLinha[];
  tributosTotal: number;
  honorarios: number;
  honorariosPctLabel: string;
  economiaLiquida: number;
  fiscal: {
    situacaoFiscal: string;
    obrigacoesRetificadas: string;
    creditoTributario: string;
    baseLegal: string;
  };
  carteira: MapaCarteiraLinha[];
  saldoTotalDisponivel: number;
}

/** Padrões por tese (espelham o seed da migração 20260929120000). */
const FISCAL_PADRAO: Record<string, { baseLegal: string; obrigacoes: string }> = {
  INSUMOS: {
    baseLegal:
      "Créditos de PIS/COFINS sobre insumos · Leis nº 10.637/2002 e 10.833/2003 · REsp 1.221.170/PR (STJ)",
    obrigacoes: "EFD-Contribuições e DCTF",
  },
  SUBVENCAO: {
    baseLegal:
      "Subvenção para investimento · Lei nº 12.973/2014 e LC 160/2017 · Exclusão da base de cálculo do IRPJ e da CSLL",
    obrigacoes: "ECF e DCTF",
  },
  PREVIDENCIARIO: {
    baseLegal: "Contribuições previdenciárias · Lei nº 8.212/1991 · Verbas indenizatórias e FAP/RAT",
    obrigacoes: "DCTFWeb e eSocial",
  },
  ICMS_ST: {
    baseLegal: "Exclusão do ICMS-ST da base do PIS/COFINS · Tema 1.125 (STJ)",
    obrigacoes: "EFD-Contribuições e DCTF",
  },
  PIS_COFINS_JUD: {
    baseLegal: "Exclusão do ICMS da base do PIS/COFINS · RE 574.706 · Tema 69 (STF)",
    obrigacoes: "EFD-Contribuições e DCTF",
  },
  REPORTO: {
    baseLegal: "REPORTO · Lei nº 11.033/2004 · Manutenção de créditos de PIS/COFINS",
    obrigacoes: "EFD-Contribuições e PER/DCOMP",
  },
};

const TRIBUTO_LABEL: Record<string, string> = {
  INSS_52: "INSS",
  INSS: "INSS",
  INSS_RETIDOS: "INSS retidos",
  PIS: "PIS",
  COFINS: "COFINS",
  ICMS: "ICMS",
  IRPJ_CSLL_AGREGADO: "IRPJ/CSLL",
  "IRPJ/CSLL": "IRPJ/CSLL",
  IRPJ: "IRPJ",
  CSLL: "CSLL",
  DCTWEB_TRIMESTRAL: "DCTFWeb",
  OUTROS: "Outros",
};

export function rotuloTributo(c: { tributo?: string | null; tributo_enum?: string | null }): string {
  const raw = String(c.tributo || c.tributo_enum || "").trim();
  if (!raw) return "Outros";
  return TRIBUTO_LABEL[raw.toUpperCase().replace(/\s+/g, "_")] ?? raw;
}

/**
 * `percentual_honorario` convive nas duas escalas no banco (12.50 e 0.13).
 * Tudo abaixo de 1 já é fração.
 */
export function percentualComoFracao(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

function honorarioDaLinha(c: MapaCompRow, processo?: MapaProcessoRow): number {
  if (c.honorario_valor != null && Number(c.honorario_valor) > 0) return Number(c.honorario_valor);
  if (c.valor_nf_servico != null && Number(c.valor_nf_servico) > 0) return Number(c.valor_nf_servico);
  const perc = percentualComoFracao(c.honorario_percentual ?? processo?.percentual_honorario);
  return Math.round(Number(c.valor_compensado || 0) * perc * 100) / 100;
}

const arred = (n: number) => Math.round(n * 100) / 100;
const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);

export function buildMapaExecutivo(input: MapaExecutivoInput): MapaExecutivoData {
  const codigo = String(input.codigo || "").toUpperCase();
  const saldos = calcularSaldosCliente({ ...input, mesFim: input.mes });
  const tese = saldos.saldoDaTese(codigo);
  const compsTese = saldos.compsDaTese(codigo);
  const compsMes = compsTese.filter((c) => String(c.mes_referencia || "").startsWith(input.mes));
  const processoPorId = new Map(input.processos.map((p) => [p.id, p]));
  const processosDaTese = input.processos.filter((p) =>
    saldos.processoIdsByTese.get(codigo)?.has(p.id),
  );
  const processoPrincipal =
    processosDaTese.find((p) => compsMes.some((c) => c.processo_tese_id === p.id)) ??
    processosDaTese[0];

  // Bloco 02 — tributos compensados no mês
  const porTributo = new Map<string, number>();
  for (const c of compsMes) {
    const t = rotuloTributo(c);
    porTributo.set(t, (porTributo.get(t) ?? 0) + Number(c.valor_compensado || 0));
  }
  const tributosTotal = arred([...porTributo.values()].reduce((s, v) => s + v, 0));
  const tributos = [...porTributo.entries()]
    .filter(([, valor]) => valor > 0)
    .map(([tributo, valor]) => ({ tributo, valor: arred(valor), pct: pct(valor, tributosTotal) }))
    .sort((a, b) => b.valor - a.valor);

  // Economia líquida
  const honorarios = arred(
    compsMes.reduce(
      (s, c) => s + honorarioDaLinha(c, processoPorId.get(c.processo_tese_id ?? "") ?? processoPrincipal),
      0,
    ),
  );
  const honorariosPctLabel = formatPercentualHonorarios(
    compsMes.map((c) => ({ honorario_percentual: percentualComoFracao(c.honorario_percentual) })),
    percentualComoFracao(processoPrincipal?.percentual_honorario),
  );

  // Bloco 01 — crédito da tese, fôlego pela média mensal compensada
  const porMes = new Map<string, number>();
  for (const c of compsTese) {
    const mes = String(c.mes_referencia || "").slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + Number(c.valor_compensado || 0));
  }
  const mesesComCompensacao = [...porMes.values()].filter((v) => v > 0);
  const mediaMensal =
    mesesComCompensacao.length > 0
      ? mesesComCompensacao.reduce((s, v) => s + v, 0) / mesesComCompensacao.length
      : 0;
  const saldo = arred(tese.saldo);
  const folegoMeses = mediaMensal > 0 && saldo > 0 ? Math.round(saldo / mediaMensal) : null;

  // Bloco 03 — situação fiscal
  const fiscalCatalogo = input.tesesFiscal?.find(
    (t) => String(t.codigo || "").toUpperCase() === codigo,
  );
  const padrao = FISCAL_PADRAO[codigo] ?? { baseLegal: "Legislação tributária vigente", obrigacoes: "—" };

  // Bloco 04 — carteira de créditos (todas as teses do cliente com crédito)
  const carteiraBase = saldos.porTese.some((row) => row.codigo === codigo)
    ? saldos.porTese
    : [...saldos.porTese, tese];
  const carteira = carteiraBase
    .map((row) => ({
      codigo: row.codigo,
      label: teseOficialLabel(row.codigo) ?? row.label,
      saldo: arred(row.saldo),
      atual: row.codigo === codigo,
    }))
    .sort((a, b) => Number(b.atual) - Number(a.atual) || b.saldo - a.saldo);

  return {
    codigo,
    teseLabel: teseOficialLabel(codigo) ?? tese.label,
    mes: input.mes,
    credito: {
      total: arred(tese.apurado),
      utilizado: arred(tese.compensado),
      saldo,
      pctUtilizado: pct(tese.compensado, tese.apurado),
      pctSaldo: pct(tese.saldo, tese.apurado),
      folegoMeses,
      mediaMensal: arred(mediaMensal),
    },
    tributos,
    tributosTotal,
    honorarios,
    honorariosPctLabel,
    economiaLiquida: arred(tributosTotal - honorarios),
    fiscal: {
      situacaoFiscal: processoPrincipal?.situacao_fiscal || "Regular e em conformidade",
      obrigacoesRetificadas:
        processoPrincipal?.obrigacoes_retificadas ||
        fiscalCatalogo?.obrigacoes_retificadas ||
        padrao.obrigacoes,
      creditoTributario: processoPrincipal?.credito_tributario_status || "Formalmente constituído",
      baseLegal: fiscalCatalogo?.base_legal || padrao.baseLegal,
    },
    carteira,
    saldoTotalDisponivel: arred(carteira.reduce((s, row) => s + row.saldo, 0)),
  };
}
