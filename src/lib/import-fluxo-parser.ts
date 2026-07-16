/**
 * Parser Formato B — abas "fluxo caixa <mês> <ano>" da planilha "Importar
 * Sistema - FinTax".
 *
 * Detecta 3 variantes pelo cabeçalho da linha 3:
 *   - **antigo**    (dez/25 → mar/26): INSS | PIS COFINS | IRPJ CSLL | DCTWEb | TOTAL
 *   - **transicao** (abr/26 = MAR/26): DCTF WEB - INSS | PIS COFINS | IRPJ CSLL | TOTAL | MAPA
 *   - **novo**      (maio/26 = ABR/26): INSS(total) | INSS(base) | RETIDOS | PIS/COFINS(total) | PIS | COFINS | IRPJ CSLL | TOTAL | MAPA
 *
 * Ignora:
 *   - aba `Controle` (é Formato A)
 *   - abas `Fluxo de caixa` e `Planilha1` (consolidação por fórmula)
 *   - abas `* (2)` (versões obsoletas — o achado do diff da jan 2026 (2))
 *
 * PIS/COFINS agregado (antigo e transição) vira `tributo='outros'` com
 * observação `'PIS_COFINS agregado — importado do formato <variante>'`.
 *
 * DCOMPs (colunas repetidas DCOMPS DCOMPS DCOMPS...) validadas por regex.
 *
 * Cliente NÃO é criado automaticamente — tem que existir (via Formato A).
 * Linhas com cliente não encontrado caem em `rejeitadas` com motivo próprio.
 */

import type * as XLSX from "xlsx";
import {
  normalizarCnpj,
  normalizarRazao,
  parseValorMonetario,
  parseData,
} from "@/lib/import-controle-parser";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export type TributoEnum =
  | "INSS_52"
  | "INSS_retidos"
  | "PIS"
  | "COFINS"
  | "IRPJ_CSLL_agregado"
  | "DCTWEB_trimestral"
  | "outros";

export type VarianteFluxo = "antigo" | "transicao" | "novo" | "novo_icms";

export interface TributoLancado {
  tributo: TributoEnum;
  valor: number;
  /** Só preenchido pra 'outros' vindo de PIS/COFINS agregado */
  observacao_agregacao?: string;
}

export interface CompensacaoParsed {
  aba: string;
  linha_planilha: number;
  competencia: string; // ISO YYYY-MM-DD (primeiro dia do mês)
  cnpj_norm: string | null;
  razao_social_raw: string;
  razao_social_norm: string;
  variante: VarianteFluxo;

  tributos: TributoLancado[];
  valor_total: number | null;

  honorario_valor: number | null;
  honorario_percentual: number | null; // 0..1
  vencimento_debito: Date | null;
  nfse_valor: number | null;
  lancado_mapa: boolean;

  dcomps: string[];
}

export interface AbaIgnorada {
  aba: string;
  motivo: string;
}

export interface LinhaFluxoRejeitada {
  aba: string;
  linha_planilha: number;
  motivo: string;
  cnpj_raw?: string;
  razao_raw?: string;
}

export interface ImportFluxoResultado {
  compensacoes: CompensacaoParsed[];
  rejeitadas: LinhaFluxoRejeitada[];
  abasIgnoradas: AbaIgnorada[];
  warnings: string[];
  totaisPorTributo: Record<TributoEnum, number>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const MESES_PT: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  março: 3, marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

function nomeMesParaNumero(s: string): number | null {
  const key = s.toLowerCase().replace(/[^a-zçãéáíóú]/g, "").trim();
  return MESES_PT[key] ?? null;
}

/** DCOMP regex — mesmo do CHECK constraint no dcomps. */
const DCOMP_REGEX = /^\d{5}\.\d{5}\.\d{6}\.\d\.\d\.\d{2}-\d{4}$/;

function limpaCel(v: unknown): string {
  return String(v ?? "").trim();
}

function chaveHeader(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// -----------------------------------------------------------------------------
// Detecção de variante e parse dos headers
// -----------------------------------------------------------------------------

interface HeaderMap {
  variante: VarianteFluxo;
  // colunas de tributo (índice na row 3)
  cols_tributo: { tributo: TributoEnum; col: number; observacao_agregacao?: string }[];
  // colunas auxiliares
  col_empresa: number;
  col_cnpj: number;
  col_total: number;
  col_honorario: number;
  col_percentual: number;
  col_comp: number;
  col_nfse: number;
  col_boleto: number;
  col_mapa: number;
  col_status_pgto: number;
  cols_dcomps: number[];
}

function parseHeaders(rows: any[][]): HeaderMap | null {
  // Row 2 = spans (nome geral: EMPRESAS, CNPJ, VALORES COMPENSADOS, ...)
  // Row 3 = colunas específicas de tributo
  const row2 = (rows[1] || []).map((h) => chaveHeader(h));
  const row3 = (rows[2] || []).map((h) => chaveHeader(h));

  const empresas = row2.indexOf("empresas");
  const cnpj = row2.indexOf("cnpj");
  if (empresas < 0 || cnpj < 0) return null;

  // Detecta variante por presença de RETIDOS / DCTF WEB / INSS puro / ICMS
  const hasRetidos = row3.some((h) => h === "retidos");
  const hasDctfWeb = row3.some((h) => h.startsWith("dctf web"));
  const hasInss = row3.some((h) => h === "inss");
  const hasIcms = row3.some((h) => h === "icms");
  const inssCount = row3.filter((h) => h === "inss").length;

  let variante: VarianteFluxo;
  // jun/2026+: INSS | RETIDOS | PIS | COFINS | ICMS | TOTAL (um único INSS, sem subtotal)
  if (hasRetidos && (hasIcms || inssCount === 1)) variante = "novo_icms";
  else if (hasRetidos) variante = "novo";
  else if (hasDctfWeb) variante = "transicao";
  else if (hasInss) variante = "antigo";
  else return null;

  // Constrói mapping de colunas de tributo por variante
  const cols_tributo: HeaderMap["cols_tributo"] = [];
  if (variante === "novo_icms") {
    // Formato jun/26+: INSS | RETIDOS | PIS | COFINS | ICMS | TOTAL | MAPA
    for (let c = 0; c < row3.length; c++) {
      const h = row3[c];
      if (h === "inss") cols_tributo.push({ tributo: "INSS_52", col: c });
      else if (h === "retidos") cols_tributo.push({ tributo: "INSS_retidos", col: c });
      else if (h === "pis") cols_tributo.push({ tributo: "PIS", col: c });
      else if (h === "cofins") cols_tributo.push({ tributo: "COFINS", col: c });
      else if (h === "icms")
        cols_tributo.push({
          tributo: "outros",
          col: c,
          observacao_agregacao: "ICMS — importado do formato novo_icms (fluxo jun/26+)",
        });
      else if (h === "irpj csll") cols_tributo.push({ tributo: "IRPJ_CSLL_agregado", col: c });
    }
  } else if (variante === "novo") {
    // Formato novo: pula INSS(total) e PIS/COFINS(total) — são subtotals
    // R3: (empresa)(cnpj) INSS INSS RETIDOS PIS/COFINS PIS COFINS IRPJ CSLL TOTAL MAPA ...
    // Precisa distinguir "INSS(total)" da "INSS(base)": ambos são "inss".
    // Regra: a PRIMEIRA "inss" que aparece = total (pular); a SEGUNDA = base.
    // Mesma coisa pra "pis/cofins": primeira = total (pular).
    let inssSeen = 0;
    let pisCofinsSeen = 0;
    for (let c = 0; c < row3.length; c++) {
      const h = row3[c];
      if (h === "inss") {
        inssSeen++;
        if (inssSeen === 2) cols_tributo.push({ tributo: "INSS_52", col: c });
        // 1º INSS = total → skip
      } else if (h === "retidos") {
        cols_tributo.push({ tributo: "INSS_retidos", col: c });
      } else if (h === "pis/cofins") {
        pisCofinsSeen++;
        // 1º PIS/COFINS = total → skip; não existe 2º nesse formato
      } else if (h === "pis") {
        cols_tributo.push({ tributo: "PIS", col: c });
      } else if (h === "cofins") {
        cols_tributo.push({ tributo: "COFINS", col: c });
      } else if (h === "irpj csll") {
        cols_tributo.push({ tributo: "IRPJ_CSLL_agregado", col: c });
      }
    }
  } else if (variante === "transicao") {
    for (let c = 0; c < row3.length; c++) {
      const h = row3[c];
      if (h.startsWith("dctf web")) cols_tributo.push({ tributo: "INSS_52", col: c });
      else if (h === "pis cofins")
        cols_tributo.push({
          tributo: "outros",
          col: c,
          observacao_agregacao: "PIS_COFINS agregado — importado do formato transição",
        });
      else if (h === "irpj csll") cols_tributo.push({ tributo: "IRPJ_CSLL_agregado", col: c });
    }
  } else {
    // antigo
    for (let c = 0; c < row3.length; c++) {
      const h = row3[c];
      if (h === "inss") cols_tributo.push({ tributo: "INSS_52", col: c });
      else if (h === "pis cofins")
        cols_tributo.push({
          tributo: "outros",
          col: c,
          observacao_agregacao: "PIS_COFINS agregado — importado do formato antigo",
        });
      else if (h === "irpj csll") cols_tributo.push({ tributo: "IRPJ_CSLL_agregado", col: c });
      else if (h.startsWith("dctweb")) cols_tributo.push({ tributo: "DCTWEB_trimestral", col: c });
    }
  }

  // Colunas auxiliares — busca por nome nas 3 primeiras linhas (o layout varia
  // por aba: honorário fica no R1 em abr/maio, no R2 em dez/jan/fev, no R3 em mar).
  const row1 = ((rows[0] as any[]) || []).map((h) => chaveHeader(h));
  const findCol = (needle: string): number => {
    const nk = chaveHeader(needle);
    const maxLen = Math.max(row1.length, row2.length, row3.length);
    for (let c = 0; c < maxLen; c++) {
      if (row1[c] === nk || row2[c] === nk || row3[c] === nk) return c;
    }
    // fallback: startsWith
    for (let c = 0; c < maxLen; c++) {
      if ((row1[c] || "").startsWith(nk) || (row2[c] || "").startsWith(nk) || (row3[c] || "").startsWith(nk)) return c;
    }
    return -1;
  };

  const col_total = findCol("total");
  const col_honorario = findCol("honários");
  const col_percentual = findCol("%");
  const col_comp = findCol("comp.");
  const col_nfse = findCol("vl nfse- envio");
  const col_boleto = findCol("envio boleto");
  const col_mapa = findCol("mapa");
  const col_status_pgto = findCol("status pgtos");

  // DCOMPs = todas colunas com header "dcomps"
  const cols_dcomps: number[] = [];
  for (let c = 0; c < row3.length; c++) if (row3[c] === "dcomps") cols_dcomps.push(c);

  return {
    variante,
    cols_tributo,
    col_empresa: empresas,
    col_cnpj: cnpj,
    col_total,
    col_honorario,
    col_percentual,
    col_comp,
    col_nfse,
    col_boleto,
    col_mapa,
    col_status_pgto,
    cols_dcomps,
  };
}

// -----------------------------------------------------------------------------
// Título R1 → competência
// -----------------------------------------------------------------------------

function parseCompetenciaFromR1(rows: any[][]): { mes: number | null; ano: number | null } {
  const t = limpaCel(rows[0]?.[0]);
  // Formato tipo "DEZEMBRO - 2025", "MARÇO - 2026". Usa Unicode property
  // escape pra acentos maiúsculos e minúsculos (Ç, ã, etc.).
  const m = t.match(/^(\p{L}+)\s*-\s*(\d{4})$/u);
  if (m) {
    return { mes: nomeMesParaNumero(m[1]), ano: parseInt(m[2], 10) };
  }
  return { mes: null, ano: null };
}

/**
 * Fallback: infere competência do nome da aba "fluxo caixa <mes> <ano>".
 * Usado quando o R1 tá vazio (bug do João em `fluxo caixa mar 2026`).
 * ATENÇÃO: pega o mês NOME-DO-MÊS-DA-ABA, que na convenção do João é o mês
 * de FECHAMENTO, NÃO a competência real. Mas a coluna "Comp." per row já
 * sobrescreve isso — este fallback só entra pro AÑO e como default de mês.
 */
function parseCompetenciaFromNomeAba(nome: string): { mes: number | null; ano: number | null } {
  const m = nome.trim().toLowerCase().match(/fluxo caixa\s+(\p{L}+)\s+(\d{4})/u);
  if (m) {
    const mesAba = nomeMesParaNumero(m[1]);
    // Convenção: aba "mar 2026" → dados de FEVEREIRO 2026 (mês anterior).
    // Ajusta um mês pra trás. Se ficar mês 0, volta pro dez do ano anterior.
    let mes = mesAba ? mesAba - 1 : null;
    let ano = parseInt(m[2], 10);
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
    return { mes, ano };
  }
  return { mes: null, ano: null };
}

// -----------------------------------------------------------------------------
// parseMapa: "OK" / "ok" / "OK (SALDO)" → true
// -----------------------------------------------------------------------------

function parseMapa(raw: unknown): boolean {
  const s = limpaCel(raw).toUpperCase();
  return s === "OK" || s.startsWith("OK ");
}

// -----------------------------------------------------------------------------
// parseAbasFluxo — entry point
// -----------------------------------------------------------------------------

const ABAS_IGNORADAS_FIXAS = new Set(["Controle", "Fluxo de caixa", "Planilha1"]);

function ehAbaObsoleta(nome: string): boolean {
  return /\(\s*\d+\s*\)/.test(nome); // ex: "fluxo caixa jan 2026 (2)"
}

function ehAbaFluxo(nome: string): boolean {
  return /^fluxo caixa /i.test(nome);
}

export function parseAbasFluxo(
  wb: XLSX.WorkBook,
  xlsxModule: typeof XLSX
): ImportFluxoResultado {
  const compensacoes: CompensacaoParsed[] = [];
  const rejeitadas: LinhaFluxoRejeitada[] = [];
  const abasIgnoradas: AbaIgnorada[] = [];
  const warnings: string[] = [];
  const totais: Record<TributoEnum, number> = emptyTotal();

  for (const abaNome of wb.SheetNames) {
    if (ABAS_IGNORADAS_FIXAS.has(abaNome)) {
      abasIgnoradas.push({ aba: abaNome, motivo: "aba de consolidação/cadastro" });
      continue;
    }
    if (ehAbaObsoleta(abaNome)) {
      abasIgnoradas.push({ aba: abaNome, motivo: "aba obsoleta (nome com (n))" });
      continue;
    }
    if (!ehAbaFluxo(abaNome)) {
      abasIgnoradas.push({ aba: abaNome, motivo: "não é fluxo caixa" });
      continue;
    }

    const ws = wb.Sheets[abaNome];
    const rows = xlsxModule.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false });
    if (rows.length < 4) {
      abasIgnoradas.push({ aba: abaNome, motivo: "aba vazia" });
      continue;
    }

    const headerMap = parseHeaders(rows);
    if (!headerMap) {
      abasIgnoradas.push({ aba: abaNome, motivo: "não conseguiu detectar variante" });
      continue;
    }

    let { mes: mesDefault, ano } = parseCompetenciaFromR1(rows);
    if (!ano) {
      // Fallback: infere pela convenção do nome da aba (aba mar/26 = FEV/26 competência)
      const fb = parseCompetenciaFromNomeAba(abaNome);
      mesDefault = fb.mes;
      ano = fb.ano;
      if (ano) warnings.push(`${abaNome}: R1 sem título; competência inferida do nome da aba (${ano}-${String(mesDefault).padStart(2, "0")}). João deveria preencher R1.`);
    }
    if (!ano) {
      abasIgnoradas.push({ aba: abaNome, motivo: "não conseguiu ler ano no título R1 nem no nome da aba" });
      continue;
    }

    // Data rows começam na linha 4 (index 3)
    for (let r = 3; r < rows.length; r++) {
      const row = rows[r] || [];
      const linhaPlanilha = r + 1;

      const razaoRaw = limpaCel(row[headerMap.col_empresa]);
      const cnpjRaw = limpaCel(row[headerMap.col_cnpj]);
      if (!razaoRaw && !cnpjRaw) continue; // pula linhas em branco

      const cnpjNorm = normalizarCnpj(cnpjRaw);
      const razaoNorm = normalizarRazao(razaoRaw);

      // Determina competência: usa coluna "Comp." (mês) + ano do R1
      let mesComp: number | null = null;
      if (headerMap.col_comp >= 0) {
        const compRaw = limpaCel(row[headerMap.col_comp]);
        if (compRaw) mesComp = nomeMesParaNumero(compRaw);
      }
      mesComp = mesComp ?? mesDefault;
      if (!mesComp) {
        rejeitadas.push({
          aba: abaNome,
          linha_planilha: linhaPlanilha,
          motivo: "sem competência (nem Comp. nem R1 legíveis)",
          cnpj_raw: cnpjRaw,
          razao_raw: razaoRaw,
        });
        continue;
      }
      const competencia = `${ano}-${String(mesComp).padStart(2, "0")}-01`;

      // Extrai tributos
      const tributos: TributoLancado[] = [];
      for (const t of headerMap.cols_tributo) {
        const v = parseValorMonetario(row[t.col]);
        if (v !== null && v > 0) {
          tributos.push({
            tributo: t.tributo,
            valor: v,
            observacao_agregacao: t.observacao_agregacao,
          });
          totais[t.tributo] = (totais[t.tributo] || 0) + v;
        }
      }

      if (tributos.length === 0) continue; // linha sem valor de tributo (vazia)

      // Honorário e %
      const honorario_valor = headerMap.col_honorario >= 0
        ? parseValorMonetario(row[headerMap.col_honorario])
        : null;
      let honorario_percentual: number | null = null;
      if (headerMap.col_percentual >= 0) {
        const rawPct = limpaCel(row[headerMap.col_percentual]);
        if (rawPct) {
          // "15.0%" → 0.15; "0.15" → 0.15
          const cleaned = rawPct.replace("%", "").replace(",", ".").trim();
          const asNum = parseFloat(cleaned);
          if (isFinite(asNum)) honorario_percentual = rawPct.includes("%") ? asNum / 100 : asNum;
        }
      }

      // Vencimento (col_boleto) e NFSE
      const vencimento_debito = headerMap.col_boleto >= 0
        ? parseData(row[headerMap.col_boleto])
        : null;
      const nfse_valor = headerMap.col_nfse >= 0
        ? parseValorMonetario(row[headerMap.col_nfse])
        : null;
      const lancado_mapa = headerMap.col_mapa >= 0
        ? parseMapa(row[headerMap.col_mapa])
        : false;

      // Total → validação: se diverge de SUM(tributos) em > R$ 0,01, warning
      const valor_total = headerMap.col_total >= 0
        ? parseValorMonetario(row[headerMap.col_total])
        : null;
      if (valor_total !== null && valor_total > 0) {
        const soma = tributos.reduce((s, t) => s + t.valor, 0);
        if (Math.abs(soma - valor_total) > 0.011) {
          warnings.push(
            `${abaNome} R${linhaPlanilha}: TOTAL ${valor_total.toFixed(2)} não bate com soma dos tributos ${soma.toFixed(2)} (diff ${(soma - valor_total).toFixed(2)}).`
          );
        }
      }

      // DCOMPs
      const dcomps: string[] = [];
      for (const col of headerMap.cols_dcomps) {
        const cell = limpaCel(row[col]);
        if (cell && DCOMP_REGEX.test(cell)) dcomps.push(cell);
      }

      compensacoes.push({
        aba: abaNome,
        linha_planilha: linhaPlanilha,
        competencia,
        cnpj_norm: cnpjNorm,
        razao_social_raw: razaoRaw,
        razao_social_norm: razaoNorm,
        variante: headerMap.variante,
        tributos,
        valor_total,
        honorario_valor,
        honorario_percentual,
        vencimento_debito,
        nfse_valor,
        lancado_mapa,
        dcomps,
      });
    }
  }

  return { compensacoes, rejeitadas, abasIgnoradas, warnings, totaisPorTributo: totais };
}

function emptyTotal(): Record<TributoEnum, number> {
  return {
    INSS_52: 0,
    INSS_retidos: 0,
    PIS: 0,
    COFINS: 0,
    IRPJ_CSLL_agregado: 0,
    DCTWEB_trimestral: 0,
    outros: 0,
  };
}
