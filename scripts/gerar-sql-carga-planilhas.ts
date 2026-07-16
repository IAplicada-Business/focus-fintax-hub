/**
 * Gera SQL de carga direta das planilhas Focus FinTax (sem UI).
 * Roda de /workspace com: npx tsx /tmp/gerar-sql-carga.ts
 */
import XLSX from "xlsx";
import { writeFileSync } from "fs";
import { parseAbasFluxo as parseFluxo } from "../src/lib/import-fluxo-parser.ts";
import { parseAbaControle as parseControle } from "../src/lib/import-controle-parser.ts";

const FIN =
  process.argv[2] ||
  "/home/ubuntu/.cursor/projects/workspace/uploads/Financeiro_Fintax_-_Atualizado_Sistema_dafb.xlsx";
const CTRL =
  process.argv[3] ||
  "/home/ubuntu/.cursor/projects/workspace/uploads/Controle_creditos_FFinTax_-_Atualizado_Sistema_0cb2.xlsx";
const OUT = process.argv[4] || "/tmp/sql_carga_planilhas.sql";

function esc(s: string | null | undefined): string {
  if (s == null || s === "") return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return Number(n).toFixed(2);
}
function numOrNull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "NULL";
  return Number(n).toFixed(2);
}
/** honorario_percentual é numeric(4,4) → exige |v| < 1 (ex.: 0.20 = 20%). */
function normalizePct(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  let v = Number(p);
  if (Math.abs(v) > 1) v = v / 100;
  if (Math.abs(v) >= 1) v = Math.sign(v) * 0.9999;
  return v;
}
function pctOrNull(n: number | null | undefined): string {
  const v = normalizePct(n);
  if (v == null) return "NULL";
  return v.toFixed(4);
}
function isoDate(d: Date | null | undefined): string {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return "NULL";
  return esc(d.toISOString().slice(0, 10)) + "::date";
}

const wbFin = XLSX.readFile(FIN);
const fluxo = parseFluxo(wbFin, XLSX);
const controle = parseControle(wbFin, XLSX);

// Detalhamento via xlsx (mesma estrutura do fox_review)
const wbCtrl = XLSX.readFile(CTRL);
const detalheSheet = wbCtrl.Sheets["Detalhamento por Cliente"];
const detalheRows: any[][] = XLSX.utils.sheet_to_json(detalheSheet, {
  header: 1,
  defval: null,
  raw: true,
});

const TESE_MAP: Record<string, string> = {
  insumos: "INSUMOS",
  subvenção: "SUBVENCAO",
  subvenca: "SUBVENCAO",
  "subvenção icms": "SUBVENCAO",
  "icms st": "ICMS_ST",
  "icms st da bc pis e cof": "ICMS_ST",
  "exclusao icms base pis e cof": "EXCLUSAO_ICMS_BC",
  "exclusão icms base pis e cof": "EXCLUSAO_ICMS_BC",
  "pis e cofins da base - judc": "PIS_COFINS_JUD",
  previdenciario: "PREVIDENCIARIO",
  previdenciário: "PREVIDENCIARIO",
  reporto: "REPORTO",
};

function mapTese(raw: string): string | null {
  const k = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // try with accents stripped keys
  const map2: Record<string, string> = {
    insumos: "INSUMOS",
    subvencao: "SUBVENCAO",
    "icms st": "ICMS_ST",
    "exclusao icms base pis e cof": "EXCLUSAO_ICMS_BC",
    "pis e cofins da base - judc": "PIS_COFINS_JUD",
    previdenciario: "PREVIDENCIARIO",
    reporto: "REPORTO",
  };
  if (map2[k]) return map2[k];
  if (k.includes("insumo")) return "INSUMOS";
  if (k.includes("subven")) return "SUBVENCAO";
  if (k.includes("icms") && k.includes("st")) return "ICMS_ST";
  if (k.includes("exclus")) return "EXCLUSAO_ICMS_BC";
  if (k.includes("jud")) return "PIS_COFINS_JUD";
  if (k.includes("previd")) return "PREVIDENCIARIO";
  if (k.includes("reporto")) return "REPORTO";
  return null;
}

function mapStatus(legenda: string | null, inicial: number, compensado: number, saldo: number): string {
  const l = String(legenda ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // Ordem importa: "ainda sera utilizado" contém a substring "utilizado"
  if (l.includes("ja utilizado")) return "utilizado";
  if (l.includes("ainda") || l.includes("sera utilizado") || l.includes("a utilizar")) return "a_utilizar";
  if (l.includes("em uso") || l.includes("parcial")) return "em_uso";
  if (l.includes("utilizado")) return "utilizado";
  if (saldo <= 0.011 || (inicial > 0 && compensado >= inicial - 0.011)) return "utilizado";
  if (compensado > 0.011) return "em_uso";
  return "a_utilizar";
}

function digitosCnpj(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d;
  if (typeof v === "number" && isFinite(v)) {
    const s = Math.round(v).toString().padStart(14, "0");
    if (s.length === 14) return s;
  }
  return null;
}

type Detalhe = {
  cnpj: string;
  empresa: string;
  tese: string;
  inicial: number;
  compensado: number;
  saldo: number;
  status: string;
  incluir: boolean;
};

// Consolida duplicatas do Detalhamento (ex.: Rocinha ICMS_ST em 2 linhas)
const detalheAgg = new Map<string, Detalhe & { legenda: string | null }>();
for (let i = 0; i < detalheRows.length; i++) {
  const row = detalheRows[i] || [];
  const empresa = row[0];
  const cnpj = digitosCnpj(row[1]);
  const tese = mapTese(String(row[2] ?? ""));
  if (!cnpj || !tese || !empresa || String(empresa).toLowerCase().includes("razão")) continue;
  const inicial = typeof row[3] === "number" ? row[3] : Number(row[3]) || 0;
  const compensado = typeof row[4] === "number" ? row[4] : Number(row[4]) || 0;
  const legenda = row[8] != null ? String(row[8]) : null;
  const key = `${cnpj}|${tese}`;
  const prev = detalheAgg.get(key);
  if (prev) {
    prev.inicial += inicial;
    prev.compensado += compensado;
    prev.saldo = prev.inicial - prev.compensado;
    if (legenda) prev.legenda = legenda;
  } else {
    detalheAgg.set(key, {
      cnpj,
      empresa: String(empresa).trim(),
      tese,
      inicial,
      compensado,
      saldo: inicial - compensado,
      status: "a_utilizar",
      incluir: tese === "INSUMOS" || tese === "SUBVENCAO",
      legenda,
    });
  }
}
const detalhes: Detalhe[] = [...detalheAgg.values()].map((d) => {
  const status = mapStatus(d.legenda, d.inicial, d.compensado, d.saldo);
  return {
    cnpj: d.cnpj,
    empresa: d.empresa,
    tese: d.tese,
    inicial: d.inicial,
    compensado: d.compensado,
    saldo: d.saldo,
    status,
    incluir: d.incluir,
  };
});

// Clientes: Controle (Financeiro) + Detalhamento + Fluxo
const clientes = new Map<
  string,
  {
    empresa: string;
    regime: string | null;
    status: string | null;
    regiao: string | null;
    data_apuracao: string | null;
  }
>();

for (const l of controle.linhas) {
  if (!l.cnpj_norm) continue;
  clientes.set(l.cnpj_norm, {
    empresa: l.razao_social_raw.trim(),
    regime: l.regime,
    status: l.status_operacional,
    regiao: l.regiao,
    data_apuracao: l.data_apuracao ? l.data_apuracao.toISOString().slice(0, 10) : null,
  });
}
for (const d of detalhes) {
  if (!clientes.has(d.cnpj)) {
    clientes.set(d.cnpj, {
      empresa: d.empresa,
      regime: null,
      status: null,
      regiao: null,
      data_apuracao: null,
    });
  }
}
for (const c of fluxo.compensacoes) {
  if (!c.cnpj_norm) continue;
  if (!clientes.has(c.cnpj_norm)) {
    clientes.set(c.cnpj_norm, {
      empresa: c.razao_social_raw.trim() || c.razao_social_norm,
      regime: null,
      status: null,
      regiao: null,
      data_apuracao: null,
    });
  }
}

const parts: string[] = [];
parts.push(`-- =============================================================================
-- Focus FinTax — carga direta das planilhas (sem importação pela UI)
-- Gerado em: ${new Date().toISOString()}
-- Fontes:
--   Controle_creditos_FFinTax - Atualizado Sistema.xlsx
--     abas: Detalhamento por Cliente (+ Resumo ignorado)
--   Financeiro Fintax - Atualizado Sistema.xlsx
--     abas processadas (fluxo): ${fluxo.compensacoes.length} linhas de compensação
--     aba Controle (cadastro + créditos iniciais)
--     abas ignoradas: ${fluxo.abasIgnoradas.map((a) => a.aba).join(", ") || "(nenhuma)"}
--
-- O que faz:
--   1) Upsert clientes por CNPJ
--   2) Upsert créditos (Controle Financeiro + Detalhamento: inicial, compensado manual, status)
--   3) Upsert compensações mensais (todas abas fluxo válidas) + DCOMPs
--   4) Relaxa processo_tese_id NOT NULL (espelha import da UI)
--
-- Como rodar: Lovable Cloud → SQL Editor → colar tudo → Run
-- Idempotente nas chaves naturais (CNPJ / cliente+tese / cliente+mês+tributo).
-- =============================================================================

BEGIN;

ALTER TABLE public.compensacoes_mensais
  ALTER COLUMN processo_tese_id DROP NOT NULL;

`);

// 1) Clientes
parts.push("-- ---------------------------------------------------------------------------");
parts.push("-- 1) Clientes (CNPJ)");
parts.push("-- ---------------------------------------------------------------------------");
for (const [cnpj, c] of [...clientes.entries()].sort((a, b) => a[1].empresa.localeCompare(b[1].empresa, "pt-BR"))) {
  const statusOp = c.status ? `${esc(c.status)}::public.status_cliente` : "NULL";
  const dataAp = c.data_apuracao ? `${esc(c.data_apuracao)}::date` : "NULL";
  parts.push(`INSERT INTO public.clientes (empresa, cnpj, regime_tributario, status_operacional, regiao, data_apuracao, status)
SELECT ${esc(c.empresa)}, ${esc(cnpj)}, ${esc(c.regime)}, ${statusOp}, ${esc(c.regiao)}, ${dataAp}, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes x
  WHERE regexp_replace(x.cnpj, '\\D', '', 'g') = ${esc(cnpj)}
);

UPDATE public.clientes
SET
  empresa = COALESCE(NULLIF(${esc(c.empresa)}, ''), empresa),
  regime_tributario = COALESCE(${esc(c.regime)}, regime_tributario),
  status_operacional = COALESCE(${statusOp}, status_operacional),
  regiao = COALESCE(${esc(c.regiao)}, regiao),
  data_apuracao = COALESCE(${dataAp}, data_apuracao),
  status = COALESCE(status, 'ativo')
WHERE regexp_replace(cnpj, '\\D', '', 'g') = ${esc(cnpj)};
`);
}

// 2) Créditos do Controle (Financeiro) — valores iniciais por tese
parts.push(`
-- ---------------------------------------------------------------------------
-- 2a) Créditos iniciais — aba Controle (Financeiro)
-- ---------------------------------------------------------------------------
`);

type CredRow = { cnpj: string; tese: string; valor: number; data: string | null; incluir: boolean };
const credControle: CredRow[] = [];
for (const l of controle.linhas) {
  if (!l.cnpj_norm) continue;
  const data = l.data_apuracao ? l.data_apuracao.toISOString().slice(0, 10) : null;
  for (const c of l.creditos) {
    if (!(c.valor > 0)) continue;
    credControle.push({
      cnpj: l.cnpj_norm,
      tese: c.tese,
      valor: c.valor,
      data,
      incluir: c.tese === "INSUMOS" || c.tese === "SUBVENCAO",
    });
  }
}

function chunkValues(rows: string[], size = 60): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// Dedupa créditos Controle por (cnpj, tese) — soma valores se repetir
const credCtrlMap = new Map<string, CredRow>();
for (const r of credControle) {
  const k = `${r.cnpj}|${r.tese}`;
  const prev = credCtrlMap.get(k);
  if (prev) {
    prev.valor += r.valor;
    if (!prev.data && r.data) prev.data = r.data;
  } else {
    credCtrlMap.set(k, { ...r });
  }
}
const credCtrlVals = [...credCtrlMap.values()].map(
  (r) =>
    `(${esc(r.cnpj)}, ${esc(r.tese)}, ${num(r.valor)}::numeric, ${
      r.data ? `${esc(r.data)}::date` : "NULL"
    }, ${r.incluir}::boolean)`,
);

for (const chunk of chunkValues(credCtrlVals)) {
  parts.push(`WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo::text AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
)
, incoming(cnpj, tese_codigo, valor_inicial, data_apuracao, incluir_no_calculo) AS (VALUES
${chunk.join(",\n")}
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, data_apuracao, incluir_no_calculo)
SELECT l.cliente_id, l.tese_id, i.valor_inicial, i.data_apuracao, i.incluir_no_calculo
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
ON CONFLICT (cliente_id, tese_id) DO UPDATE
SET valor_apurado_inicial = EXCLUDED.valor_apurado_inicial,
    data_apuracao = COALESCE(EXCLUDED.data_apuracao, public.creditos_apurados.data_apuracao),
    incluir_no_calculo = EXCLUDED.incluir_no_calculo,
    atualizado_em = now();
`);
}

// 2b) Detalhamento — sobrescreve inicial + compensado manual + status
parts.push(`
-- ---------------------------------------------------------------------------
-- 2b) Detalhamento por Cliente — inicial + compensado manual + status
-- ---------------------------------------------------------------------------
`);

const detInit = detalhes.map(
  (d) => `(${esc(d.cnpj)}, ${esc(d.tese)}, ${num(d.inicial)}::numeric, ${d.incluir}::boolean)`,
);
for (const chunk of chunkValues(detInit)) {
  parts.push(`WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo::text AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
)
, incoming(cnpj, tese_codigo, valor_inicial, incluir_no_calculo) AS (VALUES
${chunk.join(",\n")}
)
INSERT INTO public.creditos_apurados (cliente_id, tese_id, valor_apurado_inicial, data_apuracao, incluir_no_calculo)
SELECT l.cliente_id, l.tese_id, i.valor_inicial, DATE '2026-05-01', i.incluir_no_calculo
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
ON CONFLICT (cliente_id, tese_id) DO UPDATE
SET valor_apurado_inicial = EXCLUDED.valor_apurado_inicial,
    incluir_no_calculo = EXCLUDED.incluir_no_calculo,
    atualizado_em = now();
`);
}

const detComp = detalhes.map(
  (d) =>
    // REPORTO nunca vira compensado (possíveis futuros) — evita saldo negativo no mapa
    `(${esc(d.cnpj)}, ${esc(d.tese)}, ${num(d.tese === "REPORTO" ? 0 : d.compensado)}::numeric, ${esc(d.status)}, ${d.incluir}::boolean)`,
);
for (const chunk of chunkValues(detComp)) {
  parts.push(`WITH lookup AS (
  SELECT c.id AS cliente_id, regexp_replace(c.cnpj, '\\D', '', 'g') AS cnpj_digits,
         t.id AS tese_id, t.codigo::text AS tese_codigo
  FROM public.clientes c
  CROSS JOIN public.teses_tributarias t
)
, incoming(cnpj, tese_codigo, valor_compensado, status_utilizacao, incluir_no_calculo) AS (VALUES
${chunk.join(",\n")}
)
UPDATE public.creditos_apurados ca
SET valor_compensado_manual = i.valor_compensado,
    status_utilizacao = i.status_utilizacao,
    incluir_no_calculo = i.incluir_no_calculo,
    atualizado_em = now()
FROM incoming i
JOIN lookup l ON l.cnpj_digits = i.cnpj AND l.tese_codigo = i.tese_codigo
WHERE ca.cliente_id = l.cliente_id AND ca.tese_id = l.tese_id;
`);
}

parts.push(`
-- REPORTO sempre fora do cálculo
UPDATE public.creditos_apurados ca
SET incluir_no_calculo = false, atualizado_em = now()
FROM public.teses_tributarias t
WHERE ca.tese_id = t.id AND t.codigo = 'REPORTO';
`);

// 3) Compensações + DCOMPs
parts.push(`
-- ---------------------------------------------------------------------------
-- 3) Compensações mensais (fluxo) + DCOMPs
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_comp_carga (
  cnpj text NOT NULL,
  mes_referencia date NOT NULL,
  tributo_enum text NOT NULL,
  valor_compensado numeric NOT NULL DEFAULT 0,
  honorario_valor numeric,
  honorario_percentual numeric,
  lancado_mapa boolean NOT NULL DEFAULT false,
  vencimento_debito date,
  nfse_valor numeric,
  observacao text,
  dcomps text[] NOT NULL DEFAULT '{}',
  UNIQUE (cnpj, mes_referencia, tributo_enum)
) ON COMMIT DROP;
`);

type CompRow = {
  cnpj: string;
  mes: string;
  tributo: string;
  valor: number;
  honorario: number | null;
  pct: number | null;
  mapa: boolean;
  venc: string | null;
  nfse: number | null;
  obs: string;
  dcomps: string[];
};

const compMap = new Map<string, CompRow>();
let skippedSemCnpj = 0;

for (const c of fluxo.compensacoes) {
  if (!c.cnpj_norm) {
    skippedSemCnpj++;
    continue;
  }
  let honorarioAplicado = false;
  for (const t of c.tributos) {
    const key = `${c.cnpj_norm}|${c.competencia}|${t.tributo}`;
    const obsParts = [
      t.observacao_agregacao,
      `Importado via SQL fluxo (${c.aba.trim()}, variante ${c.variante})`,
    ].filter(Boolean);
    let honorario: number | null = null;
    let pct: number | null = null;
    if (!honorarioAplicado && c.honorario_valor != null && c.honorario_valor > 0) {
      honorario = c.honorario_valor;
      pct = normalizePct(c.honorario_percentual);
      honorarioAplicado = true;
    }
    const existing = compMap.get(key);
    if (existing) {
      existing.valor += t.valor;
      if (honorario != null) existing.honorario = (existing.honorario || 0) + honorario;
      if (c.lancado_mapa) existing.mapa = true;
      for (const d of c.dcomps) if (!existing.dcomps.includes(d)) existing.dcomps.push(d);
    } else {
      compMap.set(key, {
        cnpj: c.cnpj_norm,
        mes: c.competencia,
        tributo: t.tributo,
        valor: t.valor,
        honorario,
        pct: honorario != null ? pct : null,
        mapa: c.lancado_mapa,
        venc: c.vencimento_debito ? c.vencimento_debito.toISOString().slice(0, 10) : null,
        nfse: honorarioAplicado ? c.nfse_valor : c.nfse_valor,
        obs: obsParts.join(" | "),
        dcomps: [...c.dcomps],
      });
    }
  }
}

const compVals = [...compMap.values()].map((r) => {
  const dcompsSql =
    r.dcomps.length === 0
      ? "'{}'::text[]"
      : `ARRAY[${r.dcomps.map((d) => esc(d)).join(",")}]::text[]`;
  return `(${esc(r.cnpj)}, ${esc(r.mes)}::date, ${esc(r.tributo)}, ${num(r.valor)}, ${numOrNull(
    r.honorario,
  )}, ${pctOrNull(r.pct)}, ${r.mapa ? "true" : "false"}, ${
    r.venc ? `${esc(r.venc)}::date` : "NULL"
  }, ${numOrNull(r.nfse)}, ${esc(r.obs)}, ${dcompsSql})`;
});

for (const chunk of chunkValues(compVals, 40)) {
  parts.push(`INSERT INTO tmp_comp_carga (
  cnpj, mes_referencia, tributo_enum, valor_compensado, honorario_valor, honorario_percentual,
  lancado_mapa, vencimento_debito, nfse_valor, observacao, dcomps
) VALUES
${chunk.join(",\n")}
ON CONFLICT (cnpj, mes_referencia, tributo_enum) DO UPDATE SET
  valor_compensado = EXCLUDED.valor_compensado,
  honorario_valor = COALESCE(EXCLUDED.honorario_valor, tmp_comp_carga.honorario_valor),
  honorario_percentual = COALESCE(EXCLUDED.honorario_percentual, tmp_comp_carga.honorario_percentual),
  lancado_mapa = EXCLUDED.lancado_mapa OR tmp_comp_carga.lancado_mapa,
  vencimento_debito = COALESCE(EXCLUDED.vencimento_debito, tmp_comp_carga.vencimento_debito),
  nfse_valor = COALESCE(EXCLUDED.nfse_valor, tmp_comp_carga.nfse_valor),
  observacao = EXCLUDED.observacao,
  dcomps = (
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(tmp_comp_carga.dcomps || EXCLUDED.dcomps) AS u)
  );
`);
}

parts.push(`
-- Atualiza linhas existentes (tese_origem_id IS NULL — mesmo critério do import UI)
UPDATE public.compensacoes_mensais cm
SET
  valor_compensado = t.valor_compensado,
  tributo = t.tributo_enum,
  honorario_valor = COALESCE(t.honorario_valor, cm.honorario_valor),
  honorario_percentual = COALESCE(t.honorario_percentual, cm.honorario_percentual),
  lancado_mapa = t.lancado_mapa,
  vencimento_debito = COALESCE(t.vencimento_debito, cm.vencimento_debito),
  nfse_valor = COALESCE(t.nfse_valor, cm.nfse_valor),
  observacao = COALESCE(t.observacao, cm.observacao)
FROM tmp_comp_carga t
JOIN public.clientes c ON regexp_replace(c.cnpj, '\\D', '', 'g') = t.cnpj
WHERE cm.cliente_id = c.id
  AND cm.mes_referencia = t.mes_referencia
  AND cm.tributo_enum::text = t.tributo_enum
  AND cm.tese_origem_id IS NULL;

-- Insere novas
INSERT INTO public.compensacoes_mensais (
  cliente_id, mes_referencia, tributo_enum, tributo, valor_compensado,
  honorario_valor, honorario_percentual, lancado_mapa, vencimento_debito,
  nfse_valor, observacao, processo_tese_id, tese_origem_id
)
SELECT
  c.id, t.mes_referencia, t.tributo_enum::public.tributo, t.tributo_enum, t.valor_compensado,
  t.honorario_valor, t.honorario_percentual, t.lancado_mapa, t.vencimento_debito,
  t.nfse_valor, t.observacao, NULL, NULL
FROM tmp_comp_carga t
JOIN public.clientes c ON regexp_replace(c.cnpj, '\\D', '', 'g') = t.cnpj
WHERE NOT EXISTS (
  SELECT 1 FROM public.compensacoes_mensais cm
  WHERE cm.cliente_id = c.id
    AND cm.mes_referencia = t.mes_referencia
    AND cm.tributo_enum::text = t.tributo_enum
    AND cm.tese_origem_id IS NULL
);

-- DCOMPs vinculadas às compensações carregadas (DISTINCT evita 21000)
INSERT INTO public.dcomps (compensacao_id, numero_declaracao)
SELECT DISTINCT cm.id, d.numero
FROM tmp_comp_carga t
JOIN public.clientes c ON regexp_replace(c.cnpj, '\\D', '', 'g') = t.cnpj
JOIN public.compensacoes_mensais cm
  ON cm.cliente_id = c.id
 AND cm.mes_referencia = t.mes_referencia
 AND cm.tributo_enum::text = t.tributo_enum
 AND cm.tese_origem_id IS NULL
CROSS JOIN LATERAL unnest(t.dcomps) AS d(numero)
WHERE d.numero IS NOT NULL AND btrim(d.numero) <> ''
ON CONFLICT (compensacao_id, numero_declaracao) DO NOTHING;

COMMIT;

-- Resumo esperado (após o Run, rode se quiser validar):
-- SELECT COUNT(*) FROM compensacoes_mensais WHERE observacao ILIKE '%Importado via SQL fluxo%';
-- SELECT empresa, credito_apurado_calculo, total_compensado_calculo, saldo_calculo
-- FROM v_cliente_totais_calculo WHERE empresa ILIKE '%MARAVISTA%';
`);

writeFileSync(OUT, parts.join("\n"));
writeFileSync(
  "/tmp/meta_carga.json",
  JSON.stringify(
    {
      clientes: clientes.size,
      credControle: credControle.length,
      detalhes: detalhes.length,
      compensacoesParsed: fluxo.compensacoes.length,
      compensacoesSqlRows: compMap.size,
      skippedSemCnpj,
      abasIgnoradas: fluxo.abasIgnoradas,
      warnings: fluxo.warnings.slice(0, 30),
      rejeitadas: fluxo.rejeitadas.length,
      out: OUT,
      bytes: parts.join("\n").length,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      clientes: clientes.size,
      credControle: credControle.length,
      detalhes: detalhes.length,
      compensacoesParsed: fluxo.compensacoes.length,
      compensacoesSqlRows: compMap.size,
      skippedSemCnpj,
      abasIgnoradas: fluxo.abasIgnoradas,
      out: OUT,
    },
    null,
    2,
  ),
);
