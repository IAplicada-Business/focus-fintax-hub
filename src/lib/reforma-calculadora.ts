/**
 * Helpers puros da Calculadora da Reforma (tela + PDF).
 * O motor de cálculo em si vive em supabase/functions/_shared/calc-motor.ts;
 * aqui ficam só derivações de apresentação, testáveis sem Supabase.
 */

export interface EsferaSplit {
  /** Fatia da CBS (federal) no saldo líquido IBS+CBS. */
  cbs: number;
  /** Fatia do IBS (estadual/municipal). */
  ibs: number;
}

/** Espelha CONFIG_DEFAULT.cbs_net_split / ibs_net_split (8,8% / 19,2% de 28%). */
export const SPLIT_ESFERAS_DEFAULT: EsferaSplit = { cbs: 0.3142857, ibs: 0.6857143 };

export const ALIQUOTA_IBS_CBS_TOTAL_DEFAULT = 0.28;

/**
 * Texto padrão do bloco "Sobre a Reforma" (tela e PDF). Fonte de verdade em
 * runtime: `reforma_config.texto_explicativo_pdf` — o Alcir edita lá sem
 * deploy. Este é só o fallback quando a chave não existe.
 */
export const TEXTO_EXPLICATIVO_REFORMA_DEFAULT = [
  "A Reforma Tributária (EC 132/2023 e LC 214/2025) substitui PIS, COFINS, ICMS, ISS e IPI por dois tributos sobre o consumo: a CBS, federal, e o IBS, estadual e municipal. A alíquota de referência somada fica em torno de 28%, com reduções para itens da cesta básica e alguns setores.",
  "Diferente do modelo atual, o crédito passa a ser amplo: quase toda compra de bens e serviços usada na operação gera crédito, inclusive despesas administrativas, benefícios da folha e serviços financeiros. Por isso o resultado depende muito do cadastro tributário e da qualidade das notas de entrada.",
  "IRPJ e CSLL não fazem parte da Reforma do consumo: continuam existindo e por isso ficam fora deste comparativo. A transição começa em 2026, com alíquotas de teste, e termina em 2033, quando ICMS e ISS deixam de existir.",
].join("\n\n");

export interface ReformaConfigPublica {
  split: EsferaSplit;
  aliquotaTotal: number;
  textoExplicativo: string;
  /** true quando o texto veio do banco (e não do fallback). */
  textoDoBanco: boolean;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asText(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  return null;
}

export interface ReformaConfigRow {
  chave: string;
  /** Numérico no banco (`numeric`); chaves de texto guardam 0 aqui. */
  valor: unknown;
  /** Texto livre — só chaves textuais (ex.: texto_explicativo_pdf). */
  valor_texto?: unknown;
}

/**
 * Converte linhas de `reforma_config` no que a tela precisa.
 * Qualquer chave ausente ou inválida cai no default — nunca quebra a página.
 */
export function parseReformaConfigPublica(
  rows: ReformaConfigRow[] | null | undefined,
): ReformaConfigPublica {
  const map = new Map((rows ?? []).map((r) => [r.chave, r] as const));
  const cbs = asNumber(map.get("cbs_net_split")?.valor);
  const ibs = asNumber(map.get("ibs_net_split")?.valor);
  const aliq = asNumber(map.get("aliquota_ibs_cbs_total")?.valor);
  const textoRow = map.get("texto_explicativo_pdf");
  const texto = asText(textoRow?.valor_texto) ?? asText(textoRow?.valor);

  const splitValido = cbs != null && ibs != null && cbs > 0 && ibs > 0 && Math.abs(cbs + ibs - 1) < 0.01;

  return {
    split: splitValido ? { cbs, ibs } : SPLIT_ESFERAS_DEFAULT,
    aliquotaTotal: aliq != null && aliq > 0 && aliq < 1 ? aliq : ALIQUOTA_IBS_CBS_TOTAL_DEFAULT,
    textoExplicativo: texto ?? TEXTO_EXPLICATIVO_REFORMA_DEFAULT,
    textoDoBanco: texto != null,
  };
}

export interface LinhaEsfera {
  cbs: number;
  ibs: number;
  total: number;
}

export interface DetalheEsferas {
  debito: LinhaEsfera;
  creditoBruto: LinhaEsfera;
  exclusao: LinhaEsfera;
  /** Convenção do motor: negativo = a pagar, positivo = a recuperar. */
  saldo: LinhaEsfera;
  aliquota: { cbs: number; ibs: number; total: number };
}

/**
 * Abre débito, crédito, exclusão e saldo por esfera. As alíquotas de todas as
 * faixas (cheia, reduzida, seletivo) são proporcionais ao total, então o split
 * líquido vale para cada componente — mesma regra que o motor usa pro saldo.
 */
export function detalharPorEsfera(
  reforma: {
    debito: { total: number };
    credito_bruto: { total: number };
    exclusao: { total: number };
    saldo: number;
  },
  split: EsferaSplit = SPLIT_ESFERAS_DEFAULT,
  aliquotaTotal: number = ALIQUOTA_IBS_CBS_TOTAL_DEFAULT,
): DetalheEsferas {
  const linha = (total: number): LinhaEsfera => ({
    cbs: total * split.cbs,
    ibs: total * split.ibs,
    total,
  });
  return {
    debito: linha(reforma.debito.total),
    creditoBruto: linha(reforma.credito_bruto.total),
    exclusao: linha(reforma.exclusao.total),
    saldo: linha(reforma.saldo),
    aliquota: {
      cbs: aliquotaTotal * split.cbs,
      ibs: aliquotaTotal * split.ibs,
      total: aliquotaTotal,
    },
  };
}

export interface MarcoTransicao {
  ano: number;
  titulo: string;
  detalhe: string;
  /** Percentual das alíquotas de ICMS/ISS ainda em vigor naquele ano. */
  icmsPct: number;
  fase: "teste" | "cbs" | "transicao" | "fim";
}

/**
 * Cronograma legal da transição (EC 132/2023, art. 125-133 do ADCT; LC 214/2025).
 * ICMS/ISS caem 10 p.p. ao ano entre 2029 e 2032 e são extintos em 2033.
 */
export const CRONOGRAMA_TRANSICAO: readonly MarcoTransicao[] = [
  { ano: 2026, titulo: "Ano-teste", detalhe: "CBS 0,9% + IBS 0,1%, compensáveis com PIS/COFINS", icmsPct: 100, fase: "teste" },
  { ano: 2027, titulo: "CBS integral", detalhe: "PIS e COFINS extintos · IPI zerado · IBS 0,1%", icmsPct: 100, fase: "cbs" },
  { ano: 2028, titulo: "IBS 0,1%", detalhe: "ICMS e ISS ainda com alíquotas integrais", icmsPct: 100, fase: "cbs" },
  { ano: 2029, titulo: "ICMS/ISS a 90%", detalhe: "IBS sobe na mesma proporção", icmsPct: 90, fase: "transicao" },
  { ano: 2030, titulo: "ICMS/ISS a 80%", detalhe: "Dois regimes em paralelo", icmsPct: 80, fase: "transicao" },
  { ano: 2031, titulo: "ICMS/ISS a 70%", detalhe: "Dois regimes em paralelo", icmsPct: 70, fase: "transicao" },
  { ano: 2032, titulo: "ICMS/ISS a 60%", detalhe: "Último ano de convivência", icmsPct: 60, fase: "transicao" },
  { ano: 2033, titulo: "ICMS/ISS extintos", detalhe: "Só IBS + CBS", icmsPct: 0, fase: "fim" },
];
