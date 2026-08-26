import { describe, expect, it } from "vitest";
import { formatPercentualHonorarios } from "@/lib/clientes-constants";

/**
 * Regressão do bug reportado pelo Focus em 26/08/2026.
 *
 * O Mapa da MARAVISTA (Subvenção de ICMS, AGO/2026) exibia "Honorários: 15%"
 * sobre uma base de R$ 263.956,62, mas o honorário do mês era R$ 43.398,23 —
 * porque as 4 compensações tinham DOIS percentuais (INSS a 15%, PIS/COFINS a
 * 20%). O valor estava certo; o rótulo é que mostrava só o percentual da
 * primeira linha, e quem conferisse a conta acharia uma diferença de R$ 3.804,74
 * que não existe.
 */
describe("formatPercentualHonorarios", () => {
  it("mostra um único percentual como antes", () => {
    expect(formatPercentualHonorarios([{ honorario_percentual: 0.15 }])).toBe("15%");
  });

  it("mostra os dois percentuais quando o mês é misto (caso MARAVISTA)", () => {
    const comps = [
      { honorario_percentual: 0.15 }, // INSS
      { honorario_percentual: 0.15 }, // INSS_retidos
      { honorario_percentual: 0.2 }, // COFINS
      { honorario_percentual: 0.2 }, // PIS
    ];
    expect(formatPercentualHonorarios(comps)).toBe("15% e 20%");
  });

  it("ordena crescente, independente da ordem das linhas", () => {
    expect(
      formatPercentualHonorarios([{ honorario_percentual: 0.2 }, { honorario_percentual: 0.15 }]),
    ).toBe("15% e 20%");
  });

  it("usa vírgula e 'e' com três ou mais percentuais", () => {
    const comps = [
      { honorario_percentual: 0.25 },
      { honorario_percentual: 0.15 },
      { honorario_percentual: 0.2 },
    ];
    expect(formatPercentualHonorarios(comps)).toBe("15%, 20% e 25%");
  });

  it("ignora percentual nulo, zero e ausente", () => {
    const comps = [
      { honorario_percentual: null },
      { honorario_percentual: 0 },
      {},
      { honorario_percentual: 0.2 },
    ];
    expect(formatPercentualHonorarios(comps)).toBe("20%");
  });

  it("cai no percentual do processo quando nenhuma linha tem percentual", () => {
    expect(formatPercentualHonorarios([{ honorario_percentual: null }], 0.18)).toBe("18%");
  });

  it("mantém uma casa decimal quando o percentual não é inteiro", () => {
    expect(formatPercentualHonorarios([{ honorario_percentual: 0.125 }])).toBe("12.5%");
  });

  it("devolve 0% quando não há percentual nem fallback", () => {
    expect(formatPercentualHonorarios([])).toBe("0%");
  });
});
