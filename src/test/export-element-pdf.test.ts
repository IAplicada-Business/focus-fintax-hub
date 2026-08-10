import { describe, it, expect } from "vitest";
import { sanitizePdfFileName } from "@/lib/export-element-pdf";

describe("sanitizePdfFileName", () => {
  it("remove acentos e caracteres especiais", () => {
    expect(sanitizePdfFileName("Pérola Supermercados S.A.")).toBe("Perola_Supermercados_S_A");
  });

  it("trunca nomes longos", () => {
    const long = "A".repeat(100);
    expect(sanitizePdfFileName(long).length).toBe(60);
  });

  it("fallback quando vazio", () => {
    expect(sanitizePdfFileName("")).toBe("cliente");
  });
});
