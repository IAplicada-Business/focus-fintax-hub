import { describe, it, expect } from "vitest";
import {
  ALIQUOTA_IBS_CBS_TOTAL_DEFAULT,
  CRONOGRAMA_TRANSICAO,
  SPLIT_ESFERAS_DEFAULT,
  TEXTO_EXPLICATIVO_REFORMA_DEFAULT,
  detalharPorEsfera,
  parseReformaConfigPublica,
} from "@/lib/reforma-calculadora";

describe("parseReformaConfigPublica", () => {
  it("usa defaults quando não há linhas", () => {
    const cfg = parseReformaConfigPublica([]);
    expect(cfg.split).toEqual(SPLIT_ESFERAS_DEFAULT);
    expect(cfg.aliquotaTotal).toBe(ALIQUOTA_IBS_CBS_TOTAL_DEFAULT);
    expect(cfg.textoExplicativo).toBe(TEXTO_EXPLICATIVO_REFORMA_DEFAULT);
    expect(cfg.textoDoBanco).toBe(false);
  });

  it("lê valores jsonb como número ou string", () => {
    const cfg = parseReformaConfigPublica([
      { chave: "cbs_net_split", valor: "0.3142857" },
      { chave: "ibs_net_split", valor: 0.6857143 },
      { chave: "aliquota_ibs_cbs_total", valor: "0.28" },
      { chave: "texto_explicativo_pdf", valor: 0, valor_texto: "  Texto do Alcir  " },
    ]);
    expect(cfg.split.cbs).toBeCloseTo(0.3142857, 6);
    expect(cfg.split.ibs).toBeCloseTo(0.6857143, 6);
    expect(cfg.aliquotaTotal).toBe(0.28);
    expect(cfg.textoExplicativo).toBe("Texto do Alcir");
    expect(cfg.textoDoBanco).toBe(true);
  });

  it("rejeita split inconsistente (não soma 1) e texto vazio", () => {
    const cfg = parseReformaConfigPublica([
      { chave: "cbs_net_split", valor: 0.5 },
      { chave: "ibs_net_split", valor: 0.9 },
      { chave: "texto_explicativo_pdf", valor: 0, valor_texto: "   " },
    ]);
    expect(cfg.split).toEqual(SPLIT_ESFERAS_DEFAULT);
    expect(cfg.textoDoBanco).toBe(false);
  });
});

describe("detalharPorEsfera", () => {
  const reforma = {
    debito: { total: 100_000 },
    credito_bruto: { total: 70_000 },
    exclusao: { total: 5_000 },
    saldo: 70_000 - 100_000 - 5_000, // -35.000 (a pagar)
  };

  it("abre cada componente pelo split e preserva o total", () => {
    const d = detalharPorEsfera(reforma);
    expect(d.debito.cbs + d.debito.ibs).toBeCloseTo(100_000, 6);
    expect(d.debito.cbs).toBeCloseTo(31_428.57, 1);
    expect(d.creditoBruto.ibs).toBeCloseTo(48_000, 0);
    expect(d.saldo.total).toBe(-35_000);
    expect(d.saldo.cbs + d.saldo.ibs).toBeCloseTo(-35_000, 6);
  });

  it("saldo por esfera = crédito − débito − exclusão da mesma esfera", () => {
    const d = detalharPorEsfera(reforma);
    expect(d.saldo.cbs).toBeCloseTo(d.creditoBruto.cbs - d.debito.cbs - d.exclusao.cbs, 6);
    expect(d.saldo.ibs).toBeCloseTo(d.creditoBruto.ibs - d.debito.ibs - d.exclusao.ibs, 6);
  });

  it("alíquotas por esfera batem com 8,8% CBS e 19,2% IBS de 28%", () => {
    const d = detalharPorEsfera(reforma);
    expect(d.aliquota.cbs).toBeCloseTo(0.088, 3);
    expect(d.aliquota.ibs).toBeCloseTo(0.192, 3);
    expect(d.aliquota.total).toBe(0.28);
  });
});

describe("CRONOGRAMA_TRANSICAO", () => {
  it("vai de 2026 a 2033 sem pular ano", () => {
    expect(CRONOGRAMA_TRANSICAO.map((m) => m.ano)).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033]);
  });

  it("ICMS/ISS ficam integrais até 2028, caem 10 p.p. ao ano de 2029 a 2032 e somem em 2033", () => {
    const pct = Object.fromEntries(CRONOGRAMA_TRANSICAO.map((m) => [m.ano, m.icmsPct]));
    expect(pct[2026]).toBe(100);
    expect(pct[2028]).toBe(100);
    expect(pct[2029]).toBe(90);
    expect(pct[2030]).toBe(80);
    expect(pct[2031]).toBe(70);
    expect(pct[2032]).toBe(60);
    expect(pct[2033]).toBe(0);
  });

  it("2026 é ano-teste e 2027 marca a CBS integral com fim de PIS/COFINS", () => {
    const m26 = CRONOGRAMA_TRANSICAO.find((m) => m.ano === 2026)!;
    const m27 = CRONOGRAMA_TRANSICAO.find((m) => m.ano === 2027)!;
    expect(m26.fase).toBe("teste");
    expect(m27.fase).toBe("cbs");
    expect(m27.detalhe).toMatch(/PIS e COFINS extintos/);
  });
});
