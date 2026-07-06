import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import { parseAbasFluxo } from "@/lib/import-fluxo-parser";

describe("parseAbasFluxo — fixture Importar Sistema - FinTax.xlsx", () => {
  const fx = path.resolve(__dirname, "fixtures/importar-sistema-fintax.xlsx");
  const buffer = fs.readFileSync(fx);
  const wb = XLSX.read(buffer);
  const resultado = parseAbasFluxo(wb, XLSX);

  it("ignora Controle, Fluxo de caixa, Planilha1 e abas obsoletas (2)", () => {
    const nomesIgnorados = resultado.abasIgnoradas.map((a) => a.aba);
    expect(nomesIgnorados).toContain("Controle");
    expect(nomesIgnorados).toContain("Fluxo de caixa");
    expect(nomesIgnorados).toContain("Planilha1");
    expect(nomesIgnorados).toContain("fluxo caixa jan 2026 (2)");
  });

  it("processa apenas as 6 abas legítimas de fluxo caixa", () => {
    const abasProcessadas = new Set(resultado.compensacoes.map((c) => c.aba));
    // dez/25 (NOV), jan/26 (DEZ), fev/26 (JAN), mar/26 (FEV), abr/26 (MAR), maio/26 (ABR)
    const esperadas = [
      "fluxo caixa dez 2025",
      "fluxo caixa jan 2026",
      "fluxo caixa fev 2026",
      "fluxo caixa mar 2026",
      "fluxo caixa abr 2026 ",
      "fluxo caixa maio 2026 ",
    ];
    for (const esperada of esperadas) {
      expect(abasProcessadas).toContain(esperada);
    }
  });

  it("detecta variante NOVO na aba maio 2026 (com RETIDOS)", () => {
    const linhasMaio = resultado.compensacoes.filter((c) => c.aba.trim() === "fluxo caixa maio 2026");
    expect(linhasMaio.length).toBeGreaterThan(0);
    for (const l of linhasMaio) expect(l.variante).toBe("novo");
  });

  it("detecta variante TRANSICAO nas abas mar 2026 e abr 2026 (DCTF WEB sem RETIDOS)", () => {
    // mar 2026: R1 vazio; competência inferida do nome (JOÃO deveria preencher).
    // abr 2026: R1 = "MARÇO - 2026" (competência MAR/26).
    for (const aba of ["fluxo caixa mar 2026", "fluxo caixa abr 2026 "]) {
      const linhas = resultado.compensacoes.filter((c) => c.aba === aba);
      expect(linhas.length).toBeGreaterThan(0);
      for (const l of linhas) expect(l.variante).toBe("transicao");
    }
  });

  it("detecta variante ANTIGO nas abas dez 2025 / jan 2026 / fev 2026", () => {
    for (const aba of ["fluxo caixa dez 2025", "fluxo caixa jan 2026", "fluxo caixa fev 2026"]) {
      const linhas = resultado.compensacoes.filter((c) => c.aba === aba);
      expect(linhas.length).toBeGreaterThan(0);
      for (const l of linhas) expect(l.variante).toBe("antigo");
    }
  });

  it("competência sai do TÍTULO R1 (não do nome da aba)", () => {
    // aba "fluxo caixa jan 2026" mas título R1 = "DEZEMBRO - 2025" → competência 2025-12-01
    const linhasJan = resultado.compensacoes.filter((c) => c.aba === "fluxo caixa jan 2026");
    expect(linhasJan.length).toBeGreaterThan(0);
    for (const l of linhasJan) expect(l.competencia).toBe("2025-12-01");
    // aba "fluxo caixa maio 2026" mas título R1 = "ABRIL - 2026" → competência 2026-04-01
    const linhasMaio = resultado.compensacoes.filter((c) => c.aba.trim() === "fluxo caixa maio 2026");
    for (const l of linhasMaio) expect(l.competencia).toBe("2026-04-01");
  });

  it("MARAVISTA maio/26 (variante NOVO): INSS_52 + INSS_retidos + TOTAL bate", () => {
    // guardrail do backlog
    const marav = resultado.compensacoes.find(
      (c) => c.aba.trim() === "fluxo caixa maio 2026" && c.cnpj_norm === "30140610000151"
    );
    expect(marav).toBeDefined();
    const tribs = Object.fromEntries(marav!.tributos.map((t) => [t.tributo, t.valor]));
    expect(tribs["INSS_52"]).toBeCloseTo(155723.03, 2);
    expect(tribs["INSS_retidos"]).toBeCloseTo(1366.58, 2);
    expect(marav!.valor_total).toBeCloseTo(240212.4, 2);
    // Valor total (240.212,40) = INSS(total 157.089,61) + PIS/COFINS(total 83.122,79) ≈ soma dos tributos individuais
    // Soma dos tributos discriminados = INSS_52 + INSS_retid + PIS + COFINS ≈ 240.212,40
    const soma = marav!.tributos.reduce((s, t) => s + t.valor, 0);
    expect(soma).toBeCloseTo(240212.4, 1); // tolerância R$ 0,10 pra arredondamento planilha
  });

  it("MARAVISTA jan/26 (variante ANTIGO, competência DEZ/25): tributos agregados", () => {
    const marav = resultado.compensacoes.find(
      (c) => c.aba === "fluxo caixa jan 2026" && c.cnpj_norm === "30140610000151"
    );
    expect(marav).toBeDefined();
    expect(marav!.competencia).toBe("2025-12-01");
    // Tem INSS_52, "outros" (PIS/COFINS agregado) e possivelmente DCTWEB
    const codigos = new Set(marav!.tributos.map((t) => t.tributo));
    expect(codigos).toContain("INSS_52");
    // PIS COFINS agregado vira "outros" com observação
    const outros = marav!.tributos.find((t) => t.tributo === "outros");
    if (outros) {
      expect(outros.observacao_agregacao).toContain("PIS_COFINS agregado");
      expect(outros.observacao_agregacao).toContain("antigo");
    }
  });

  it("MARAVISTA jan/26 extrai DCOMPs regex-válidas", () => {
    const marav = resultado.compensacoes.find(
      (c) => c.aba === "fluxo caixa jan 2026" && c.cnpj_norm === "30140610000151"
    );
    expect(marav).toBeDefined();
    // Backlog cita DCOMPs específicas da MARAVISTA DEZ/25
    expect(marav!.dcomps.length).toBeGreaterThan(0);
    for (const d of marav!.dcomps) {
      expect(d).toMatch(/^\d{5}\.\d{5}\.\d{6}\.\d\.\d\.\d{2}-\d{4}$/);
    }
  });

  it("Coluna MAPA 'OK'/'ok' vira lancado_mapa=true", () => {
    const comMapa = resultado.compensacoes.filter((c) => c.lancado_mapa);
    const semMapa = resultado.compensacoes.filter((c) => !c.lancado_mapa);
    // maio 2026 tem várias linhas com "OK"
    expect(comMapa.length).toBeGreaterThan(0);
    // No formato antigo (dez/jan/fev/mar) NÃO tem coluna MAPA → todas false
    const antigasSemMapa = semMapa.filter((c) => c.variante === "antigo");
    expect(antigasSemMapa.length).toBeGreaterThan(0);
  });

  it("Honorário % é parseado corretamente (15% → 0.15)", () => {
    const marav = resultado.compensacoes.find(
      (c) => c.aba.trim() === "fluxo caixa maio 2026" && c.cnpj_norm === "30140610000151"
    );
    expect(marav?.honorario_percentual).toBeCloseTo(0.15, 3);
  });

  it("Não cria linhas pra CNPJs inválidos (mas registra em rejeitadas ou skipa)", () => {
    for (const c of resultado.compensacoes) {
      if (c.cnpj_norm) expect(c.cnpj_norm).toMatch(/^\d{14}$/);
    }
  });

  it("Sem variantes duplicadas por aba", () => {
    const abaVariante = new Map<string, string>();
    for (const c of resultado.compensacoes) {
      const prev = abaVariante.get(c.aba);
      if (prev) expect(prev).toBe(c.variante);
      else abaVariante.set(c.aba, c.variante);
    }
  });
});
