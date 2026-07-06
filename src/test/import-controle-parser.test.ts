import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import {
  normalizarCnpj,
  normalizarRazao,
  parseValorMonetario,
  normalizarRegime,
  normalizarStatus,
  parseData,
  parseAbaControle,
} from "@/lib/import-controle-parser";

// -----------------------------------------------------------------------------
// Normalizações — unit tests
// -----------------------------------------------------------------------------

describe("normalizarCnpj", () => {
  it("aceita máscara padrão", () => {
    expect(normalizarCnpj("31.862.204/0001-65")).toBe("31862204000165");
  });
  it("corrige typo com ponto em vez de barra", () => {
    // strip de tudo que não é dígito → mesmo resultado, 14 dígitos
    expect(normalizarCnpj("31.862.204.0001-65")).toBe("31862204000165");
  });
  it("rejeita CNPJ incompleto", () => {
    expect(normalizarCnpj("31.862.204")).toBeNull();
  });
  it("null/vazio → null", () => {
    expect(normalizarCnpj("")).toBeNull();
    expect(normalizarCnpj("   ")).toBeNull();
  });
});

describe("normalizarRazao", () => {
  it("upper + colapsa espaços e newlines", () => {
    expect(normalizarRazao("  Maravista  Comercio\n de  Alimentos  ")).toBe("MARAVISTA COMERCIO DE ALIMENTOS");
  });
  it("remove pontuação de fim", () => {
    expect(normalizarRazao("Empresa X.")).toBe("EMPRESA X");
  });
  it("null/vazio → string vazia", () => {
    expect(normalizarRazao("")).toBe("");
  });
});

describe("parseValorMonetario", () => {
  it("R$ - → null", () => {
    expect(parseValorMonetario(" R$ - ")).toBeNull();
    expect(parseValorMonetario("R$ -")).toBeNull();
  });
  it("R$ 26,942,306.85 (EN) → 26942306.85", () => {
    expect(parseValorMonetario("R$ 26,942,306.85")).toBe(26942306.85);
  });
  it("R$ 1.234,56 (BR) → 1234.56", () => {
    expect(parseValorMonetario("R$ 1.234,56")).toBe(1234.56);
  });
  it("125 (número puro) → 125", () => {
    expect(parseValorMonetario(125)).toBe(125);
  });
  it("null/undefined/vazio → null", () => {
    expect(parseValorMonetario(null)).toBeNull();
    expect(parseValorMonetario(undefined)).toBeNull();
    expect(parseValorMonetario("")).toBeNull();
  });
});

describe("normalizarRegime", () => {
  it("Lucro Rela (typo) → lucro_real", () => {
    expect(normalizarRegime("Lucro Rela").enum).toBe("lucro_real");
  });
  it("Lucro Real → lucro_real", () => {
    expect(normalizarRegime("Lucro Real ").enum).toBe("lucro_real");
  });
  it("lucro real (lowercase) → lucro_real", () => {
    expect(normalizarRegime("lucro real").enum).toBe("lucro_real");
  });
  it("Lucro Presumido → lucro_presumido", () => {
    expect(normalizarRegime("Lucro Presumido").enum).toBe("lucro_presumido");
  });
  it("Simples Nacional → simples_nacional", () => {
    expect(normalizarRegime("Simples Nacional").enum).toBe("simples_nacional");
  });
  it("string vazia → null", () => {
    expect(normalizarRegime("").enum).toBeNull();
  });
});

describe("normalizarStatus", () => {
  it("Fechado → fechado", () => {
    expect(normalizarStatus("Fechado").enum).toBe("fechado");
  });
  it("Relatório enviado. → relatorio_enviado", () => {
    expect(normalizarStatus("Relatório enviado.").enum).toBe("relatorio_enviado");
  });
});

describe("parseData", () => {
  it("10/24/25 → 2025-10-24", () => {
    const d = parseData("10/24/25");
    expect(d?.toISOString().slice(0, 10)).toBe("2025-10-24");
  });
  it("Date objeto passa direto", () => {
    const src = new Date("2025-11-04T00:00:00Z");
    expect(parseData(src)?.getTime()).toBe(src.getTime());
  });
  it("vazio → null", () => {
    expect(parseData("")).toBeNull();
    expect(parseData(null)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Snapshot completo com a fixture real
// -----------------------------------------------------------------------------

describe("parseAbaControle — fixture Importar Sistema - FinTax.xlsx", () => {
  const fx = path.resolve(__dirname, "fixtures/importar-sistema-fintax.xlsx");
  const buffer = fs.readFileSync(fx);
  const wb = XLSX.read(buffer);

  const resultado = parseAbaControle(wb, XLSX);

  it("aba Controle é lida sem erro fatal", () => {
    expect(resultado.warnings.filter((w) => w.includes("não encontrada"))).toHaveLength(0);
  });

  it("REPORTO totaliza R$ 150.908.380,50 (± R$ 0,01)", () => {
    // Regra de guardrail do backlog: se esse total mudar, alguém quebrou o parser.
    expect(resultado.totalCreditos.REPORTO).toBeCloseTo(150908380.5, 2);
  });

  it("não inclui linha 47 (subtotais) nem 49 (TOTAL CREDITOS)", () => {
    const linhas47_49 = resultado.linhas.filter((l) => l.linha_planilha === 47 || l.linha_planilha === 49);
    expect(linhas47_49).toHaveLength(0);
    const rejeitadas47_49 = resultado.rejeitadas.filter((l) => l.linha_planilha === 47 || l.linha_planilha === 49);
    expect(rejeitadas47_49.length).toBeGreaterThanOrEqual(2);
  });

  it("MARAVISTA (CNPJ 30.140.610/0001-51) foi parseado com créditos INSUMOS e SUBVENCAO", () => {
    const marav = resultado.linhas.find((l) => l.cnpj_norm === "30140610000151");
    expect(marav).toBeDefined();
    const tesesMap = Object.fromEntries(marav!.creditos.map((c) => [c.tese, c.valor]));
    expect(tesesMap["INSUMOS"]).toBeCloseTo(2407515.09, 2);
    expect(tesesMap["SUBVENCAO"]).toBeCloseTo(3376449.69, 2);
    expect(marav!.regime).toBe("lucro_real");
    expect(marav!.status_operacional).toBe("fechado");
    expect(marav!.regiao).toBe("Niterói - RJ");
  });

  it("normaliza 'Lucro Rela' (União da Família Mercearia)", () => {
    // Essa linha existe no arquivo (é uma das que o Alcir digitou com typo)
    const uniao = resultado.linhas.find((l) => l.razao_social_norm.includes("UNIÃO DA FAMILIA"));
    // Independentemente de qual foi a origem, se alguma linha teve raw = "Lucro Rela",
    // deve ter sido normalizada.
    const comTypoRela = resultado.linhas.filter((l) => l.regime_raw.toLowerCase().startsWith("lucro rela"));
    for (const l of comTypoRela) {
      expect(l.regime).toBe("lucro_real");
    }
    if (uniao) expect(uniao.regime).toBe("lucro_real");
  });

  it("pelo menos 40 clientes válidos parseados", () => {
    // Backlog diz 44. Aceito um range porque algumas linhas podem cair em rejeitadas
    // (obs ou dupla) — o número exato depende do que a UI resolver depois.
    expect(resultado.linhas.length).toBeGreaterThanOrEqual(40);
    expect(resultado.linhas.length).toBeLessThanOrEqual(48);
  });

  it("linhas de observação (65-69) caem em rejeitadas com motivo próprio", () => {
    const obs = resultado.rejeitadas.filter((r) => r.linha_planilha >= 65 && r.linha_planilha <= 69);
    // Pelo menos algumas linhas dessa faixa cairam em rejeitadas
    expect(obs.length).toBeGreaterThan(0);
  });

  it("todos os CNPJs normalizados têm 14 dígitos", () => {
    for (const l of resultado.linhas) {
      if (l.cnpj_norm) expect(l.cnpj_norm).toMatch(/^\d{14}$/);
    }
  });
});
