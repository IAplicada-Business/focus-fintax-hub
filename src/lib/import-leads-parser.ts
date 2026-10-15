/**
 * Parser da importação de leads por planilha (xlsx/csv) — Lote 2 Comercial.
 *
 * As listas da comercial vêm de fontes variadas (até 20k contatos), com
 * cabeçalhos em português e sem padrão: "Razão Social" ou "Empresa",
 * "Telefone" ou "WhatsApp", "Regime" ou "Regime Tributário"... Este módulo
 * detecta o cabeçalho, sugere o mapeamento por sinônimos (o usuário pode
 * corrigir na tela), normaliza CNPJ/telefone/faturamento/regime para os
 * valores que o LeadFormModal já usa e deduplica por CNPJ → telefone →
 * e-mail.
 *
 * Este arquivo é PURO (sem React, sem Supabase). Facilita testar.
 */

import type * as XLSX from "xlsx";
import { FATURAMENTO_FAIXAS, REGIMES, SEGMENTOS } from "@/lib/lead-constants";
import { normalizarProdutoLead, type ProdutoLead } from "@/lib/produto-lead";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export const CAMPOS_LEAD = [
  "nome",
  "empresa",
  "cnpj",
  "email",
  "telefone",
  "faturamento",
  "regime",
  "segmento",
  "cidade",
  "uf",
  "origem",
  "produto",
] as const;

export type CampoLead = (typeof CAMPOS_LEAD)[number];

export const CAMPO_LEAD_LABEL: Record<CampoLead, string> = {
  nome: "Nome do contato",
  empresa: "Empresa",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone / WhatsApp",
  faturamento: "Faturamento",
  regime: "Regime tributário",
  segmento: "Segmento",
  cidade: "Cidade",
  uf: "UF",
  origem: "Origem",
  produto: "Produto",
};

/** Campo → índice da coluna na planilha (ausente = não mapeado). */
export type MapeamentoColunas = Partial<Record<CampoLead, number>>;

export type LinhaPlanilha = unknown[];

export interface LeadImportado {
  linha_planilha: number; // 1-indexed, já contando o cabeçalho
  nome: string;
  empresa: string;
  cnpj: string; // 14 dígitos ou ""
  email: string;
  whatsapp: string; // dígitos (DDD + número, sem 55) ou ""
  faturamento_faixa: string; // valor de FATURAMENTO_FAIXAS ou ""
  regime_tributario: string; // valor de REGIMES ou ""
  segmento: string; // valor de SEGMENTOS (default "outros")
  observacoes: string;
  origem: string;
  produto: ProdutoLead;
  sdr_id: string | null;
  closer_id: string | null;
}

export interface LinhaInvalida {
  linha_planilha: number;
  motivo: string;
}

export interface ConfigLote {
  produto: ProdutoLead;
  origem: string;
  sdrId?: string | null;
  closerId?: string | null;
}

export interface ResultadoLinhas {
  leads: LeadImportado[];
  invalidos: LinhaInvalida[];
}

export interface ChaveDedupe {
  cnpj?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export interface ResultadoDedupe {
  novos: LeadImportado[];
  /** Repetidos dentro do próprio arquivo (fica o primeiro). */
  duplicadosArquivo: LeadImportado[];
  /** Já cadastrados no sistema. */
  jaExistentes: LeadImportado[];
}

// -----------------------------------------------------------------------------
// Normalizações
// -----------------------------------------------------------------------------

const semAcento = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const texto = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\s+/g, " ").trim();
};

/** 14 dígitos ou "". Aceita número do Excel (perde zeros à esquerda → completa). */
export function normalizarCnpj(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  let digits = typeof raw === "number" ? String(Math.round(raw)) : String(raw).replace(/\D/g, "");
  if (digits.length > 0 && digits.length < 14 && typeof raw === "number") digits = digits.padStart(14, "0");
  return digits.length === 14 ? digits : "";
}

/** "00000000000000" → "00.000.000/0000-00" (como o formulário grava). */
export function formatarCnpj(digits: string): string {
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Telefone BR: DDD + número (10 ou 11 dígitos), sem o 55. Aceita "+55 (11)
 * 91234-5678", "5511912345678", número do Excel. Inválido → "".
 */
export function normalizarTelefoneBR(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  let digits = typeof raw === "number" ? String(Math.round(raw)) : String(raw).replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  // Excel costuma comer o zero; "0" à esquerda de DDD é discagem antiga.
  if (digits.length === 12 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) return digits;
  return "";
}

/** "(11) 91234-5678" — formato do LeadFormModal. */
export function formatarTelefoneBR(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

export function normalizarEmail(raw: unknown): string {
  const s = texto(raw).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

/** "R$ 1.500.000", "1,5 mi", "2M", "800 mil", 1500000 → número (reais) ou null. */
export function parseFaturamentoNumero(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  const s = semAcento(raw).replace(/r\$/g, "").replace(/reais/g, "").trim();
  if (!s) return null;
  const m = s.match(/^([\d.,]+)\s*(milhoes|milhao|mil|mi|m|k)?\b/);
  if (!m) return null;
  let numStr = m[1];
  const hasComma = numStr.includes(",");
  const hasDot = numStr.includes(".");
  if (hasComma && hasDot) {
    numStr = numStr.lastIndexOf(",") > numStr.lastIndexOf(".") ? numStr.replace(/\./g, "").replace(",", ".") : numStr.replace(/,/g, "");
  } else if (hasComma) {
    // "1,5" é decimal; "1,500,000" é milhar.
    numStr = numStr.split(",").length > 2 ? numStr.replace(/,/g, "") : numStr.replace(",", ".");
  } else if (hasDot) {
    // "1.500.000" (milhar BR) vs "1.5" (decimal).
    const partes = numStr.split(".");
    numStr = partes.length > 2 || partes[partes.length - 1].length === 3 ? numStr.replace(/\./g, "") : numStr;
  }
  let n = parseFloat(numStr);
  if (!isFinite(n)) return null;
  const sufixo = m[2];
  if (sufixo === "mi" || sufixo === "milhoes" || sufixo === "milhao" || sufixo === "m") n *= 1_000_000;
  else if (sufixo === "mil" || sufixo === "k") n *= 1_000;
  return n;
}

/**
 * Texto livre → faixa de faturamento MENSAL usada no formulário
 * (ate_500k | 500k_2m | 2m_5m | 5m_15m | acima_15m). Aceita o próprio
 * valor da faixa, trechos do rótulo ("até 500", "2 a 5 milhões") ou um
 * número. Não reconhecido → "".
 */
export function normalizarFaturamentoFaixa(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const s = semAcento(raw);
  if (FATURAMENTO_FAIXAS.some((f) => f.value === s)) return s;

  // Faixa descrita em texto: pega os números e decide pelo limite superior.
  if (/ate|acima|mais de|entre|\ba\b|-|–/.test(s) && !/^[\d.,\s]+$/.test(s)) {
    const nums = [...s.matchAll(/([\d.,]+)\s*(milhoes|milhao|mil|mi|m|k)?\b/g)]
      .map((m) => parseFaturamentoNumero(`${m[1]} ${m[2] ?? ""}`))
      .filter((n): n is number => n != null && n > 0);
    if (/acima|mais de|\+/.test(s) && nums.length > 0) return faixaPorValor(nums[0] + 1);
    if (nums.length > 0) return faixaPorValor(Math.max(...nums));
    return "";
  }

  const n = parseFaturamentoNumero(raw);
  return n == null || n <= 0 ? "" : faixaPorValor(n);
}

function faixaPorValor(n: number): string {
  if (n <= 500_000) return "ate_500k";
  if (n <= 2_000_000) return "500k_2m";
  if (n <= 5_000_000) return "2m_5m";
  if (n <= 15_000_000) return "5m_15m";
  return "acima_15m";
}

/** "lucro real"/"LR"/"presumido"/"simples"/"SN"/"MEI" → valor de REGIMES ou "". */
export function normalizarRegime(raw: unknown): string {
  const s = semAcento(raw);
  if (!s) return "";
  if (/real|^lr$/.test(s)) return REGIMES[2]; // "Lucro Real"
  if (/presum|^lp$/.test(s)) return REGIMES[1]; // "Lucro Presumido"
  if (/simples|nacional|^sn$|mei/.test(s)) return REGIMES[0]; // "Simples Nacional"
  return "";
}

/** Segmento livre → valor de SEGMENTOS; desconhecido/vazio → "outros". */
export function normalizarSegmento(raw: unknown): string {
  const s = semAcento(raw);
  if (!s) return "outros";
  if (SEGMENTOS.some((seg) => seg.value === s)) return s;
  if (/super|mercad|atacad|varej|hortifrut/.test(s)) return "supermercado";
  if (/farm|drog/.test(s)) return "farmacia";
  if (/pet|veterin|agropet/.test(s)) return "pet";
  if (/constru|material|madeir|ferragem|home center/.test(s)) return "materiais_construcao";
  return "outros";
}

export function normalizarUf(raw: unknown): string {
  const s = texto(raw).toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : texto(raw);
}

// -----------------------------------------------------------------------------
// Cabeçalho e mapeamento
// -----------------------------------------------------------------------------

/** Sinônimos por campo (já sem acento/minúsculo). Ordem = prioridade. */
const SINONIMOS: Record<CampoLead, string[]> = {
  nome: ["nome do contato", "contato", "responsavel", "nome", "decisor", "socio", "proprietario", "dono"],
  empresa: ["razao social", "empresa", "nome fantasia", "fantasia", "razao", "companhia", "organizacao", "cliente"],
  cnpj: ["cnpj", "cnpj/cpf", "documento"],
  email: ["e-mail", "email", "e mail", "correio"],
  telefone: ["whatsapp", "celular", "telefone", "fone", "tel", "contato telefonico", "numero", "whats"],
  faturamento: ["faturamento", "faturamento mensal", "receita", "fat", "porte"],
  regime: ["regime tributario", "regime", "tributacao", "enquadramento"],
  segmento: ["segmento", "ramo", "atividade", "setor", "cnae", "nicho"],
  cidade: ["cidade", "municipio", "localidade"],
  uf: ["uf", "estado"],
  origem: ["origem", "fonte", "canal"],
  produto: ["produto", "solucao", "servico", "empresa do grupo"],
};

/** Campo exato primeiro; depois cabeçalho que contém o sinônimo. Cada coluna só entra uma vez. */
export function detectarMapeamento(headers: unknown[]): MapeamentoColunas {
  const norm = headers.map((h) => semAcento(h));
  const mapeamento: MapeamentoColunas = {};
  const usadas = new Set<number>();

  const tentar = (campo: CampoLead, teste: (h: string, sin: string) => boolean) => {
    if (mapeamento[campo] !== undefined) return;
    for (const sin of SINONIMOS[campo]) {
      const idx = norm.findIndex((h, i) => !usadas.has(i) && h && teste(h, sin));
      if (idx >= 0) {
        mapeamento[campo] = idx;
        usadas.add(idx);
        return;
      }
    }
  };

  // "email" também contém "mail"; "nome fantasia" contém "nome": por isso
  // duas passadas — igualdade exata para todos os campos, só depois "contém".
  for (const campo of CAMPOS_LEAD) tentar(campo, (h, sin) => h === sin);
  for (const campo of CAMPOS_LEAD) tentar(campo, (h, sin) => h.includes(sin));
  return mapeamento;
}

/**
 * Índice da linha de cabeçalho: a primeira (entre as 10 iniciais) cujos
 * textos casam com pelo menos dois campos conhecidos. Listas exportadas de
 * CRM costumam trazer título/filtros nas primeiras linhas.
 */
export function detectarLinhaCabecalho(linhas: LinhaPlanilha[]): number {
  const limite = Math.min(linhas.length, 10);
  let melhor = 0;
  let melhorQtd = 0;
  for (let i = 0; i < limite; i++) {
    const qtd = Object.keys(detectarMapeamento(linhas[i] ?? [])).length;
    if (qtd > melhorQtd) {
      melhor = i;
      melhorQtd = qtd;
    }
    if (melhorQtd >= 3) break;
  }
  return melhor;
}

// -----------------------------------------------------------------------------
// Leitura da planilha (SheetJS injetado — carregado sob demanda pela tela)
// -----------------------------------------------------------------------------

export interface PlanilhaLida {
  nomeAba: string;
  headers: string[];
  linhas: LinhaPlanilha[];
  /** Linha (1-indexed) da planilha onde está o cabeçalho. */
  linhaCabecalho: number;
}

export function lerPrimeiraAba(wb: XLSX.WorkBook, xlsx: typeof XLSX): PlanilhaLida {
  const nomeAba = wb.SheetNames[0];
  const ws = wb.Sheets[nomeAba];
  const matriz = ws ? (xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as LinhaPlanilha[]) : [];
  const idx = detectarLinhaCabecalho(matriz);
  const headers = (matriz[idx] ?? []).map((h) => texto(h));
  const linhas = matriz.slice(idx + 1).filter((l) => (l ?? []).some((c) => texto(c) !== ""));
  return { nomeAba, headers, linhas, linhaCabecalho: idx + 1 };
}

// -----------------------------------------------------------------------------
// Linhas → leads
// -----------------------------------------------------------------------------

/**
 * Converte cada linha num lead pronto para o insert. Linha sem nome E sem
 * empresa é inválida (não há como contatar nem identificar). Nome vazio vira
 * a empresa e vice-versa, porque o banco exige os dois. Cidade/UF não têm
 * coluna em `leads`: vão para observações.
 */
export function linhasParaLeads(linhas: LinhaPlanilha[], mapeamento: MapeamentoColunas, lote: ConfigLote, linhaCabecalho = 1): ResultadoLinhas {
  const leads: LeadImportado[] = [];
  const invalidos: LinhaInvalida[] = [];
  const celula = (linha: LinhaPlanilha, campo: CampoLead): unknown => {
    const idx = mapeamento[campo];
    return idx === undefined ? "" : linha[idx];
  };

  linhas.forEach((linha, i) => {
    const numero = linhaCabecalho + i + 1;
    const nomeRaw = texto(celula(linha, "nome"));
    const empresaRaw = texto(celula(linha, "empresa"));
    if (!nomeRaw && !empresaRaw) {
      invalidos.push({ linha_planilha: numero, motivo: "Sem nome e sem empresa" });
      return;
    }

    const cidade = texto(celula(linha, "cidade"));
    const uf = normalizarUf(celula(linha, "uf"));
    const observacoes: string[] = [];
    const local = [cidade, uf].filter(Boolean).join("/");
    if (local) observacoes.push(`Cidade/UF: ${local}`);
    const segmentoRaw = texto(celula(linha, "segmento"));
    const segmento = normalizarSegmento(segmentoRaw);
    if (segmentoRaw && segmento === "outros") observacoes.push(`Segmento informado: ${segmentoRaw}`);
    const faturamentoRaw = texto(celula(linha, "faturamento"));
    const faturamento_faixa = normalizarFaturamentoFaixa(celula(linha, "faturamento"));
    if (faturamentoRaw && !faturamento_faixa) observacoes.push(`Faturamento informado: ${faturamentoRaw}`);
    const regimeRaw = texto(celula(linha, "regime"));
    const regime_tributario = normalizarRegime(regimeRaw);
    if (regimeRaw && !regime_tributario) observacoes.push(`Regime informado: ${regimeRaw}`);

    const origemLinha = semAcento(celula(linha, "origem")).replace(/\s+/g, "_");
    const produtoLinha = normalizarProdutoLead(texto(celula(linha, "produto")));

    leads.push({
      linha_planilha: numero,
      nome: nomeRaw || empresaRaw,
      empresa: empresaRaw || nomeRaw,
      cnpj: normalizarCnpj(celula(linha, "cnpj")),
      email: normalizarEmail(celula(linha, "email")),
      whatsapp: normalizarTelefoneBR(celula(linha, "telefone")),
      faturamento_faixa,
      regime_tributario,
      segmento,
      observacoes: observacoes.join("\n"),
      origem: origemLinha || lote.origem,
      produto: produtoLinha ?? lote.produto,
      sdr_id: lote.sdrId || null,
      closer_id: lote.closerId || null,
    });
  });

  return { leads, invalidos };
}

// -----------------------------------------------------------------------------
// Deduplicação
// -----------------------------------------------------------------------------

/** Chave única: CNPJ (dígitos) > telefone (dígitos) > e-mail minúsculo; sem nada → null. */
export function chaveDedupe(l: ChaveDedupe): string | null {
  const cnpj = String(l.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length === 14) return `cnpj:${cnpj}`;
  const tel = normalizarTelefoneBR(l.whatsapp);
  if (tel) return `tel:${tel}`;
  const email = normalizarEmail(l.email);
  if (email) return `email:${email}`;
  return null;
}

/** Todas as chaves que identificam o registro (um lead já existente pode casar por qualquer uma). */
function chavesDoRegistro(l: ChaveDedupe): string[] {
  const chaves: string[] = [];
  const cnpj = String(l.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length === 14) chaves.push(`cnpj:${cnpj}`);
  const tel = normalizarTelefoneBR(l.whatsapp);
  if (tel) chaves.push(`tel:${tel}`);
  const email = normalizarEmail(l.email);
  if (email) chaves.push(`email:${email}`);
  return chaves;
}

/**
 * Separa novos, repetidos no arquivo e já existentes no sistema. Um lead do
 * arquivo é "já existente" se qualquer chave dele (CNPJ, telefone, e-mail)
 * bate com alguém do sistema; dentro do arquivo, vale a chave principal e o
 * primeiro fica. Sem chave nenhuma (só nome) sempre entra como novo.
 */
export function deduplicarLeads<T extends ChaveDedupe>(novos: T[], existentes: ChaveDedupe[]): {
  novos: T[];
  duplicadosArquivo: T[];
  jaExistentes: T[];
} {
  const chavesSistema = new Set<string>();
  for (const e of existentes) for (const c of chavesDoRegistro(e)) chavesSistema.add(c);

  const vistas = new Set<string>();
  const resultado = { novos: [] as T[], duplicadosArquivo: [] as T[], jaExistentes: [] as T[] };
  for (const l of novos) {
    const chaves = chavesDoRegistro(l);
    if (chaves.some((c) => chavesSistema.has(c))) {
      resultado.jaExistentes.push(l);
      continue;
    }
    const principal = chaveDedupe(l);
    if (principal && vistas.has(principal)) {
      resultado.duplicadosArquivo.push(l);
      continue;
    }
    if (principal) vistas.add(principal);
    resultado.novos.push(l);
  }
  return resultado;
}

/** Lead elegível ao diagnóstico automático: o motor precisa de faturamento e regime. */
export function elegivelDiagnostico(l: { faturamento_faixa?: string | null; regime_tributario?: string | null }): boolean {
  return Boolean(l.faturamento_faixa && l.regime_tributario);
}
