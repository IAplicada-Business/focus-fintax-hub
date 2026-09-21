import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthPicker } from "@/components/ui/month-picker";
import { LIMPAR, aoEscolherAno, aoEscolherMes, listarAnos } from "@/lib/competencia-select";

describe("aoEscolherMes", () => {
  it("usa o ano à vista", () => {
    expect(aoEscolherMes("07", 2024, 2026)).toBe("2024-07");
  });

  it("sem ano escolhido, completa com o ano corrente", () => {
    expect(aoEscolherMes("03", undefined, 2026)).toBe("2026-03");
  });

  it("limpar zera a competência", () => {
    expect(aoEscolherMes(LIMPAR, 2024, 2026)).toBe("");
  });
});

describe("aoEscolherAno", () => {
  it("com mês já escolhido, troca só o ano", () => {
    expect(aoEscolherAno("2023", "11")).toBe("2023-11");
  });

  it("sem mês, segura o ano em vez de emitir competência pela metade", () => {
    expect(aoEscolherAno("2023", "")).toBeNull();
  });

  it("limpar zera a competência", () => {
    expect(aoEscolherAno(LIMPAR, "11")).toBe("");
  });
});

describe("listarAnos", () => {
  it("lista do mais recente para o mais antigo, com folga de um ano à frente", () => {
    expect(listarAnos(undefined, 2026)).toEqual([2027, 2026, 2025, 2024, 2023, 2022, 2021]);
  });

  it("inclui um ano selecionado fora da janela padrão", () => {
    const anos = listarAnos(2015, 2026);
    expect(anos).toContain(2015);
    expect(anos[anos.length - 1]).toBe(2015);
  });
});

describe("MonthPicker", () => {
  it("renderiza mês e ano como dois campos separados", () => {
    render(<MonthPicker aria-label="Período de" value="2026-07" onChange={vi.fn()} />);

    const mes = screen.getByRole("combobox", { name: "Período de — mês" });
    const ano = screen.getByRole("combobox", { name: "Período de — ano" });

    expect(mes).toHaveTextContent("Jul");
    expect(ano).toHaveTextContent("2026");
  });

  it("sem valor, cada campo mostra o próprio placeholder", () => {
    render(<MonthPicker value="" onChange={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Mês" })).toHaveTextContent("Mês");
    expect(screen.getByRole("combobox", { name: "Ano" })).toHaveTextContent("Ano");
  });
});
