import { describe, it, expect } from "vitest";
import { agregarMixRegime, regimeSlug } from "@/lib/regime-mix";

describe("regimeSlug", () => {
  it("aceita rótulo humano, slug e variações", () => {
    expect(regimeSlug("Lucro Real")).toBe("lucro_real");
    expect(regimeSlug("lucro_real")).toBe("lucro_real");
    expect(regimeSlug("LUCRO PRESUMIDO")).toBe("lucro_presumido");
    expect(regimeSlug("Simples Nacional")).toBe("simples");
    expect(regimeSlug("simples_nacional")).toBe("simples");
    expect(regimeSlug("simples")).toBe("simples");
  });

  it("devolve null pra vazio ou desconhecido", () => {
    expect(regimeSlug("")).toBeNull();
    expect(regimeSlug(null)).toBeNull();
    expect(regimeSlug("MEI")).toBeNull();
  });
});

describe("agregarMixRegime", () => {
  const motor = [
    ["lucro_real"],
    ["lucro_real", "lucro_presumido"],
    ["lucro_real", "lucro_presumido"],
    null,
  ];

  it("agrega leads e potencial por regime na ordem fixa, com cobertura do motor", () => {
    const rows = agregarMixRegime(
      [
        { regime_tributario: "Lucro Presumido", potencial: 100 },
        { regime_tributario: "Lucro Real", potencial: 500 },
        { regime_tributario: "Lucro Real", potencial: 250 },
        { regime_tributario: "Simples Nacional", potencial: 0 },
        { regime_tributario: "", potencial: 10 },
      ],
      motor,
    );
    expect(rows.map((r) => r.key)).toEqual(["lucro_real", "lucro_presumido", "simples", "nao_informado"]);
    expect(rows[0]).toMatchObject({ leads: 2, potencial: 750, teses: 3 });
    expect(rows[1]).toMatchObject({ leads: 1, potencial: 100, teses: 2 });
    expect(rows[2]).toMatchObject({ leads: 1, potencial: 0, teses: 0 }); // Simples: sem tese no motor
    expect(rows[3]).toMatchObject({ leads: 1, teses: null });
  });

  it("omite regimes sem lead", () => {
    const rows = agregarMixRegime([{ regime_tributario: "Lucro Real", potencial: 1 }], motor);
    expect(rows.map((r) => r.key)).toEqual(["lucro_real"]);
  });

  it("lista vazia devolve vazio", () => {
    expect(agregarMixRegime([], motor)).toEqual([]);
  });
});
