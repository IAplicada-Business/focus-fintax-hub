/**
 * Parser Formato A — aba "Controle" da planilha "Importar Sistema - FinTax".
 *
 * Cadastro-mestre por cliente + crédito inicial por tese. Fonte de verdade
 * pra clientes e creditos_apurados.
 *
 * Colunas verbatim (linha 1):
 *   Data | RAZÃO SOCIAL | CNPJ | Regime Tributário | Status | Região |
 *   (vazio) | (vazio) | INSUMOS | SUBVENÇÃO | ICMS ST DA BC PIS E COF |
 *   Exclusao Icms base pis e cof | PIS E COFINS DA BASE - JUDC |
 *   PREVIDENCIARIO | REPORTO
 *
 * Este arquivo é PURO (sem React, sem Supabase). Facilita testar.
 */

import type * as XLSX from "xlsx";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export type TeseCodigoEnum =
  | "INSUMOS"
  | "SUBVENCAO"
  | "ICMS_ST"
  | "EXCLUSAO_ICMS_BC"
  | "PIS_COFINS_JUD"
  | "PREVIDENCIARIO"
  | "REPORTO";

export type RegimeEnum = "simples_nacional" | "lucro_presumido" | "lucro_real";

export type StatusOperacionalEnum = "fechado" | "relatorio_enviado" | "em_analise" | "ativo";

export interface CreditoParsed {
  tese: TeseCodigoEnum;
  valor: number;
}

export interface LinhaControleParsed {
  linha_planilha: number;               // 1-indexed
  data_apuracao: Date | null;
  razao_social_raw: string;
  razao_social_norm: string;
  cnpj_raw: string;
  cnpj_norm: string | null;             // 14 dígitos ou null
  regime: RegimeEnum | null;
  regime_raw: string;
  status_operacional: StatusOperacionalEnum | null;
  status_raw: string;
  regiao: string | null;
  creditos: CreditoParsed[];
}

export interface LinhaRejeitada {
  linha_planilha: number;
  motivo: string;
  raw: string[];
}

export interface ImportControleResultado {
  linhas: LinhaControleParsed[];
  rejeitadas: LinhaRejeitada[];
  totalCreditos: Record<TeseCodigoEnum, number>;
  warnings: string[];
}

// -----------------------------------------------------------------------------
// Normalizações (compartilhadas com o Formato B no futuro)
// -----------------------------------------------------------------------------

/** Só dígitos, tamanho 14 = CNPJ válido. Trata "31.862.204.0001-65" (typo com "." em vez de "/"). */
export function normalizarCnpj(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 14) return digits;
  return null;
}

/** Uppercase + strip + colapsar espaços/tabs/quebras — chave de match por razão social. */
export function normalizarRazao(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;]+$/g, "")
    .trim();
}

/** Parse valor monetário. "R$ 26,942,306.85" → 26942306.85. " R$ - " → null. */
export function parseValorMonetario(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  const s = String(raw).replace(/R\$/gi, "").replace(/\s/g, "");
  if (s === "" || s === "-") return null;
  // BR: "1.234.567,89" — dot thousand, comma decimal
  // EN: "1,234,567.89" — comma thousand, dot decimal
  // A planilha do João mistura formatos. Detecção heurística:
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let numStr = s;
  if (hasComma && hasDot) {
    // último separador = decimal
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // vírgula é decimal (BR)
      numStr = s.replace(/\./g, "").replace(",", ".");
    } else {
      // ponto é decimal (EN)
      numStr = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // só vírgula — assume decimal BR
    numStr = s.replace(",", ".");
  }
  const n = parseFloat(numStr);
  return isFinite(n) ? n : null;
}

/** "Lucro Real"/"Lucro Rela"/"lucro real" → 'lucro_real'. */
export function normalizarRegime(raw: string): { enum: RegimeEnum | null; raw: string } {
  const rawStr = String(raw ?? "").trim();
  const s = rawStr.toLowerCase();
  if (s.startsWith("lucro rel") || s.startsWith("lucro real")) return { enum: "lucro_real", raw: rawStr };
  if (s.startsWith("lucro pre") || s.startsWith("lucro presum")) return { enum: "lucro_presumido", raw: rawStr };
  if (s.startsWith("simples") || s.includes("nacional")) return { enum: "simples_nacional", raw: rawStr };
  return { enum: null, raw: rawStr };
}

/** "Fechado"/"Relatório enviado."/"em análise"/"ativo" → enum. */
export function normalizarStatus(raw: string): { enum: StatusOperacionalEnum | null; raw: string } {
  const rawStr = String(raw ?? "").trim();
  const s = rawStr
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (s.startsWith("fechado")) return { enum: "fechado", raw: rawStr };
  if (s.startsWith("relatorio") || s.startsWith("relat")) return { enum: "relatorio_enviado", raw: rawStr };
  if (s.startsWith("em analise") || s === "analise") return { enum: "em_analise", raw: rawStr };
  if (s.startsWith("ativo")) return { enum: "ativo", raw: rawStr };
  return { enum: null, raw: rawStr };
}

/** Data: "10/24/25" ou Date direto do Excel. */
export function parseData(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  // MM/dd/yy (formato do João)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mo = parseInt(m[1], 10) - 1;
    const d = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, mo, d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

// -----------------------------------------------------------------------------
// Mapping colunas de tese → enum
// -----------------------------------------------------------------------------

const HEADER_TESE_MAP: Record<string, TeseCodigoEnum> = {
  "insumos": "INSUMOS",
  "subvencao": "SUBVENCAO",
  "subvenção": "SUBVENCAO",
  "icms st da bc pis e cof": "ICMS_ST",
  "exclusao icms base pis e cof": "EXCLUSAO_ICMS_BC",
  "exclusão icms base pis e cof": "EXCLUSAO_ICMS_BC",
  "pis e cofins da base - judc": "PIS_COFINS_JUD",
  "previdenciario": "PREVIDENCIARIO",
  "previdenciário": "PREVIDENCIARIO",
  "reporto": "REPORTO",
};

function chaveHeader(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// -----------------------------------------------------------------------------
// Parse principal
// -----------------------------------------------------------------------------

export function parseAbaControle(
  wb: XLSX.WorkBook,
  xlsxModule: typeof XLSX
): ImportControleResultado {
  const rejeitadas: LinhaRejeitada[] = [];
  const warnings: string[] = [];

  const ws = wb.Sheets["Controle"];
  if (!ws) {
    return {
      linhas: [],
      rejeitadas: [],
      totalCreditos: emptyTotal(),
      warnings: ['Aba "Controle" não encontrada na planilha.'],
    };
  }

  const rows = xlsxModule.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false });
  if (rows.length < 2) {
    return { linhas: [], rejeitadas: [], totalCreditos: emptyTotal(), warnings: ["Planilha vazia."] };
  }

  // Linha 1 é o header
  const header = (rows[0] || []).map((h) => chaveHeader(h));
  const idx = {
    data: header.indexOf("data"),
    razao: header.findIndex((h) => h.includes("razão social") || h.includes("razao social") || h === "razão" || h === "razao"),
    cnpj: header.indexOf("cnpj"),
    regime: header.findIndex((h) => h.includes("regime")),
    status: header.indexOf("status"),
    regiao: header.findIndex((h) => h === "região" || h === "regiao"),
  };
  const idxTese: Partial<Record<TeseCodigoEnum, number>> = {};
  for (let c = 0; c < header.length; c++) {
    const key = header[c];
    if (HEADER_TESE_MAP[key]) idxTese[HEADER_TESE_MAP[key]] = c;
  }

  if (idx.razao < 0 || idx.cnpj < 0) {
    return {
      linhas: [],
      rejeitadas: [],
      totalCreditos: emptyTotal(),
      warnings: ["Header não reconhecido — faltam colunas RAZÃO SOCIAL/CNPJ."],
    };
  }

  const linhas: LinhaControleParsed[] = [];
  const totais: Record<TeseCodigoEnum, number> = emptyTotal();
  let dentroAreaTeste = false; // vira true depois que encontramos "control saldo"

  // Data rows começam na linha 2 (index 1)
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const linhaPlanilha = r + 1;

    // Coluna A (col 0) muitas vezes tem o marcador. Verifica antes da razão.
    const primeiraCol = String(row[0] ?? "").trim().toUpperCase();
    const razaoRaw = String(row[idx.razao] ?? "").trim();
    const cnpjRaw = String(row[idx.cnpj] ?? "").trim();
    const dataRaw = idx.data >= 0 ? row[idx.data] : "";

    // Uma vez dentro da mini-tabela de teste (após "control saldo"),
    // tudo até o fim da planilha é ignorado.
    if (primeiraCol.startsWith("CONTROL SALDO") || razaoRaw.toUpperCase().startsWith("CONTROL SALDO")) {
      dentroAreaTeste = true;
      rejeitadas.push({ linha_planilha: linhaPlanilha, motivo: "início da mini-tabela de teste (control saldo)", raw: row.slice(0, 16).map(String) });
      continue;
    }
    if (dentroAreaTeste) {
      rejeitadas.push({ linha_planilha: linhaPlanilha, motivo: "linha da mini-tabela de teste", raw: row.slice(0, 16).map(String) });
      continue;
    }

    // Filtros — ignora subtotais/obs/testes
    const razaoUpper = razaoRaw.toUpperCase();
    if (razaoUpper.startsWith("TOTAL CREDITOS") || razaoUpper.startsWith("TOTAL")) {
      // linha 49 do arquivo do João
      rejeitadas.push({ linha_planilha: linhaPlanilha, motivo: "subtotal (TOTAL...)", raw: row.slice(0, 16).map(String) });
      continue;
    }
    if (!razaoRaw) {
      // linha só com valores nos tributos = row 47 (subtotal implícito). Já cai no filtro abaixo.
      const somaCol = Object.values(idxTese).reduce((s, c) => s + (parseValorMonetario(row[c!]) || 0), 0);
      if (somaCol > 0) {
        rejeitadas.push({ linha_planilha: linhaPlanilha, motivo: "subtotal implícito (sem razão social)", raw: row.slice(0, 16).map(String) });
      }
      continue;
    }

    // Linhas 65-69: observação textual (razão social preenchida mas SEM créditos e SEM CNPJ; texto na coluna C)
    // Heurística: se todos os créditos estão vazios E a coluna C (idx razao+1 = CNPJ) tem texto não-numérico
    // (ou razão social contém "obs em"), tratamos como observação.
    const somaCreditos = Object.values(idxTese).reduce((s, c) => s + (parseValorMonetario(row[c!]) || 0), 0);
    if (somaCreditos === 0 && !normalizarCnpj(cnpjRaw)) {
      // Provavelmente linha de observação. Registra como rejeitada com nota; UI pode oferecer
      // "criar observação no cliente X" se a razão social bater.
      rejeitadas.push({
        linha_planilha: linhaPlanilha,
        motivo: "linha de observação (sem CNPJ, sem créditos)",
        raw: row.slice(0, 16).map(String),
      });
      continue;
    }

    const cnpjNorm = normalizarCnpj(cnpjRaw);
    const razaoNorm = normalizarRazao(razaoRaw);
    if (!cnpjNorm && !razaoNorm) {
      rejeitadas.push({ linha_planilha: linhaPlanilha, motivo: "sem CNPJ e sem razão", raw: row.slice(0, 16).map(String) });
      continue;
    }
    if (!cnpjNorm) {
      warnings.push(`R${linhaPlanilha}: cliente sem CNPJ (será matched por razão social) — "${razaoRaw}".`);
    }

    // Extrai créditos
    const creditos: CreditoParsed[] = [];
    for (const [tese, col] of Object.entries(idxTese) as [TeseCodigoEnum, number][]) {
      const v = parseValorMonetario(row[col]);
      if (v !== null && v > 0) {
        creditos.push({ tese, valor: v });
        totais[tese] = (totais[tese] || 0) + v;
      }
    }

    const { enum: regimeEnum, raw: regimeRaw } = normalizarRegime(String(row[idx.regime] ?? ""));
    const { enum: statusEnum, raw: statusRaw } = normalizarStatus(String(row[idx.status] ?? ""));

    linhas.push({
      linha_planilha: linhaPlanilha,
      data_apuracao: parseData(dataRaw),
      razao_social_raw: razaoRaw,
      razao_social_norm: razaoNorm,
      cnpj_raw: cnpjRaw,
      cnpj_norm: cnpjNorm,
      regime: regimeEnum,
      regime_raw: regimeRaw,
      status_operacional: statusEnum,
      status_raw: statusRaw,
      regiao: idx.regiao >= 0 ? (String(row[idx.regiao] ?? "").trim() || null) : null,
      creditos,
    });
  }

  return { linhas, rejeitadas, totalCreditos: totais, warnings };
}

function emptyTotal(): Record<TeseCodigoEnum, number> {
  return {
    INSUMOS: 0,
    SUBVENCAO: 0,
    ICMS_ST: 0,
    EXCLUSAO_ICMS_BC: 0,
    PIS_COFINS_JUD: 0,
    PREVIDENCIARIO: 0,
    REPORTO: 0,
  };
}
