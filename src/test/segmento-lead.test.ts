import { describe, it, expect } from "vitest";
import { normalizarSegmento, rotuloSegmento, agruparPorSegmento } from "@/lib/segmento-lead";

describe("normalizarSegmento", () => {
  it("junta variações de caixa na mesma chave", () => {
    expect(normalizarSegmento("Supermercado")).toBe("supermercado");
    expect(normalizarSegmento("supermercado")).toBe("supermercado");
    expect(normalizarSegmento("SUPERMERCADO")).toBe("supermercado");
  });

  it("remove acentos e normaliza separadores", () => {
    expect(normalizarSegmento("Distribuidora de alimentos")).toBe("distribuidora_de_alimentos");
    expect(normalizarSegmento("  Farmácia  ")).toBe("farmacia");
  });

  it("trata singular e plural equivalentes como o mesmo segmento", () => {
    expect(normalizarSegmento("Outro")).toBe("outros");
    expect(normalizarSegmento("outros")).toBe("outros");
  });

  it("usa 'nao_informado' para vazio ou nulo", () => {
    expect(normalizarSegmento(null)).toBe("nao_informado");
    expect(normalizarSegmento("")).toBe("nao_informado");
    expect(normalizarSegmento("   ")).toBe("nao_informado");
  });
});

describe("rotuloSegmento", () => {
  it("prefere o rótulo conhecido do pipeline", () => {
    expect(rotuloSegmento("farmacia")).toBe("Farmácia");
    expect(rotuloSegmento("materiais_construcao")).toBe("Mat. Construção");
  });

  it("reconstrói o texto de segmentos livres", () => {
    expect(rotuloSegmento("distribuidora_de_alimentos")).toBe("Distribuidora de alimentos");
    expect(rotuloSegmento("atacarejo")).toBe("Atacarejo");
  });
});

describe("agruparPorSegmento", () => {
  it("soma as duplicatas de caixa numa linha só, da maior para a menor", () => {
    const linhas = agruparPorSegmento([
      "Supermercado", "Supermercado", "supermercado",
      "Atacarejo",
      "Outro", "outros",
    ]);
    expect(linhas).toEqual([
      { segmento: "supermercado", label: "Supermercado", count: 3 },
      { segmento: "outros", label: "Outros", count: 2 },
      { segmento: "atacarejo", label: "Atacarejo", count: 1 },
    ]);
  });

  it("desempata por rótulo para a ordem não oscilar entre renders", () => {
    const linhas = agruparPorSegmento(["Atacarejo", "Supermercado"]);
    expect(linhas.map((l) => l.label)).toEqual(["Atacarejo", "Supermercado"]);
  });

  it("devolve lista vazia sem leads", () => {
    expect(agruparPorSegmento([])).toEqual([]);
  });
});
