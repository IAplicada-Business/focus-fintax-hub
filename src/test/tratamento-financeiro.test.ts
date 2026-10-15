import { describe, expect, it } from "vitest";
import {
  TRATAMENTOS_FINANCEIROS,
  isTratamentoFinanceiro,
  tratamentoPadraoDaTese,
} from "@/lib/tratamento-financeiro";

describe("tratamento financeiro padrão da tese (flag do catálogo)", () => {
  it("oferece as 3 opções usadas no processo", () => {
    expect(TRATAMENTOS_FINANCEIROS.map((t) => t.value)).toEqual([
      "compensacao",
      "reporto",
      "recuperacao_judicial",
    ]);
    expect(isTratamentoFinanceiro("reporto")).toBe(true);
    expect(isTratamentoFinanceiro("qualquer")).toBe(false);
  });

  it("a flag do catálogo manda sobre a dedução pelo nome/ramo", () => {
    // ICMS estadual cadastrado como fora do saldo sem mexer em código.
    expect(
      tratamentoPadraoDaTese({ tratamento_financeiro_padrao: "recuperacao_judicial", tese: "icms_estadual", tipo_recuperacao: "compensacao" }),
    ).toBe("recuperacao_judicial");
    // Reporto marcado explicitamente como "no cálculo" é respeitado.
    expect(
      tratamentoPadraoDaTese({ tratamento_financeiro_padrao: "compensacao", tese: "reporto", nome_exibicao: "REPORTO" }),
    ).toBe("compensacao");
  });

  it("sem flag mantém a dedução antiga", () => {
    expect(tratamentoPadraoDaTese({ tese: "reporto", nome_exibicao: "REPORTO" })).toBe("reporto");
    expect(tratamentoPadraoDaTese({ tese: "pis_cofins_bc", tipo_recuperacao: "recuperacao_judicial" })).toBe("recuperacao_judicial");
    expect(tratamentoPadraoDaTese({ tese: "pis_cofins_insumos", tipo_recuperacao: "compensacao" })).toBe("compensacao");
    expect(tratamentoPadraoDaTese({ tratamento_financeiro_padrao: "lixo", tese: "pis_cofins_insumos" })).toBe("compensacao");
  });
});
