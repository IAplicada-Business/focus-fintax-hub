import { describe, it, expect } from "vitest";
import {
  PRODUTO_LABEL,
  estimarTese,
  filtrarTesesElegiveis,
  normalizeRegimeParaMotor,
  potencialCompensacao,
  sugerirProduto,
  temImpactoReforma,
  type TeseMotorInput,
} from "../../supabase/functions/_shared/sugestao-produto";

const TESES: TeseMotorInput[] = [
  {
    tese: "insumos",
    nome_exibicao: "PIS/COFINS Insumos",
    regimes_elegiveis: ["lucro_real", "lucro_presumido"],
    segmentos_elegiveis: ["supermercado"],
    percentual_min: 0.001,
    percentual_max: 0.002,
    ativo: true,
    ordem_exibicao: 1,
  },
  {
    tese: "subvencao",
    nome_exibicao: "Subvenção ICMS",
    regimes_elegiveis: ["lucro_real"],
    segmentos_elegiveis: ["supermercado", "farmacia"],
    percentual_min: 0.0005,
    percentual_max: 0.001,
    ativo: true,
    ordem_exibicao: 2,
  },
  {
    tese: "reporto",
    nome_exibicao: "Reporto",
    regimes_elegiveis: ["lucro_real"],
    segmentos_elegiveis: ["supermercado"],
    percentual_min: 0.01,
    percentual_max: 0.02,
    ativo: false,
    ordem_exibicao: 99,
  },
];

describe("normalizeRegimeParaMotor", () => {
  it("mapeia real/presumido/simples da calculadora", () => {
    expect(normalizeRegimeParaMotor("real")).toBe("lucro_real");
    expect(normalizeRegimeParaMotor("presumido")).toBe("lucro_presumido");
    expect(normalizeRegimeParaMotor("simples")).toBe("simples");
  });

  it("aceita labels já no vocabulário do motor", () => {
    expect(normalizeRegimeParaMotor("lucro_real")).toBe("lucro_real");
    expect(normalizeRegimeParaMotor("Lucro Presumido")).toBe("lucro_presumido");
  });

  it("retorna null pra regime desconhecido", () => {
    expect(normalizeRegimeParaMotor("mei")).toBeNull();
  });
});

describe("estimarTese / potencialCompensacao", () => {
  it("usa fat × 60 × % (janela 5 anos)", () => {
    // 1_000_000 × 60 × 0.002 = 120_000
    expect(estimarTese(1_000_000, 0.001, 0.002)).toEqual({ min: 60_000, max: 120_000 });
  });

  it("soma só teses elegíveis ativas", () => {
    const elegiveis = filtrarTesesElegiveis(TESES, "lucro_real", "supermercado");
    expect(elegiveis.map((t) => t.tese)).toEqual(["insumos", "subvencao"]);
    expect(elegiveis.find((t) => t.tese === "reporto")).toBeUndefined();

    const pot = potencialCompensacao(1_000_000, elegiveis);
    // insumos 60k–120k + subvencao 30k–60k
    expect(pot.min).toBe(90_000);
    expect(pot.max).toBe(180_000);
    expect(pot.teses).toHaveLength(2);
  });

  it("presumido não pega Subvenção (só lucro_real)", () => {
    const elegiveis = filtrarTesesElegiveis(TESES, "lucro_presumido", "supermercado");
    expect(elegiveis.map((t) => t.tese)).toEqual(["insumos"]);
  });

  it("simples sem tese elegível → lista vazia", () => {
    expect(filtrarTesesElegiveis(TESES, "simples", "supermercado")).toHaveLength(0);
  });
});

describe("temImpactoReforma", () => {
  it("exige |economia| ≥ 1000 ou IBS/CBS > 0", () => {
    expect(temImpactoReforma(999, 0)).toBe(false);
    expect(temImpactoReforma(1000, 0)).toBe(true);
    expect(temImpactoReforma(-5000, 0)).toBe(true);
    expect(temImpactoReforma(0, 100)).toBe(true);
  });
});

describe("sugerirProduto", () => {
  const base = {
    segmento: "supermercado",
    faturamento_mensal: 1_000_000,
    teses: TESES,
  };

  it("ambos quando tem teses + impacto RT", () => {
    const s = sugerirProduto({
      ...base,
      regime: "real",
      economia_potencial_anual: -50_000,
      ibs_cbs_estimado: 8_000,
      ja_faz_recuperacao: false,
    });
    expect(s.produto).toBe("ambos");
    expect(s.label).toBe(PRODUTO_LABEL.ambos);
    expect(s.draft).toBe(true);
    expect(s.potencial_compensacao_max).toBe(180_000);
    expect(s.motivos.some((m) => m.includes("Teses"))).toBe(true);
  });

  it("compensacao quando tem teses sem impacto RT material", () => {
    const s = sugerirProduto({
      ...base,
      regime: "presumido",
      economia_potencial_anual: 0,
      ibs_cbs_estimado: 0,
      ja_faz_recuperacao: false,
    });
    expect(s.produto).toBe("compensacao");
    expect(s.potencial_compensacao_max).toBe(120_000); // só insumos
  });

  it("reforma_tributaria no Simples com impacto RT (sem tese de Compensação)", () => {
    const s = sugerirProduto({
      ...base,
      regime: "simples",
      economia_potencial_anual: 20_000,
      ibs_cbs_estimado: 2_000,
      ja_faz_recuperacao: false,
    });
    expect(s.produto).toBe("reforma_tributaria");
  });

  it("reforma_tributaria em presumido sem tese elegível no segmento", () => {
    const s = sugerirProduto({
      ...base,
      segmento: "outros",
      regime: "presumido",
      economia_potencial_anual: 12_000,
      ibs_cbs_estimado: 1_000,
      ja_faz_recuperacao: false,
    });
    expect(s.produto).toBe("reforma_tributaria");
  });

  it("analise_personalizada em simples sem tese", () => {
    const s = sugerirProduto({
      ...base,
      regime: "simples",
      economia_potencial_anual: 0,
      ibs_cbs_estimado: 0,
      ja_faz_recuperacao: false,
    });
    expect(s.produto).toBe("analise_personalizada");
  });

  it("anota ja_faz_recuperacao no racional", () => {
    const s = sugerirProduto({
      ...base,
      regime: "real",
      economia_potencial_anual: 10_000,
      ibs_cbs_estimado: 500,
      ja_faz_recuperacao: true,
    });
    expect(s.ja_faz_recuperacao).toBe(true);
    expect(s.motivos.some((m) => /já faz recuperação/i.test(m))).toBe(true);
  });
});
