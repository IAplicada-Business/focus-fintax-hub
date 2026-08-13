import { describe, expect, it } from "vitest";
import { formatMoneyBR, maskMoneyInput, parseMoneyBR } from "@/lib/money-mask";

describe("money-mask", () => {
  it("formata número em pt-BR", () => {
    expect(formatMoneyBR(343243243)).toBe("343.243.243,00");
    expect(formatMoneyBR(1783942.04)).toBe("1.783.942,04");
    expect(formatMoneyBR("")).toBe("");
  });

  it("interpreta dígitos como centavos ao digitar", () => {
    expect(maskMoneyInput("1")).toEqual({ display: "0,01", amount: 0.01 });
    expect(maskMoneyInput("123")).toEqual({ display: "1,23", amount: 1.23 });
    expect(maskMoneyInput("343243243")).toEqual({ display: "3.432.432,43", amount: 3432432.43 });
  });

  it("parseMoneyBR lê máscara ou número puro", () => {
    expect(parseMoneyBR("1.783.942,04")).toBeCloseTo(1783942.04, 2);
    expect(parseMoneyBR("1783942.04")).toBeCloseTo(1783942.04, 2);
    expect(parseMoneyBR(100.5)).toBeCloseTo(100.5, 2);
  });
});
