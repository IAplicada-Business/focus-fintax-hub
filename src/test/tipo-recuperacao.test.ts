import { describe, expect, it } from "vitest";
import {
  isTipoRecuperacao,
  ramosVisiveisNoKanban,
  resolveTipoRecuperacao,
  sugerirTipoRecuperacao,
  TIPO_RECUPERACAO_LABEL,
} from "@/lib/tipo-recuperacao";

describe("tipo-recuperacao", () => {
  it("valida valores do enum", () => {
    expect(isTipoRecuperacao("compensacao")).toBe(true);
    expect(isTipoRecuperacao("ressarcimento")).toBe(true);
    expect(isTipoRecuperacao("recuperacao_judicial")).toBe(true);
    expect(isTipoRecuperacao("reporto")).toBe(false);
  });

  it("sugere judicial por código/nome", () => {
    expect(sugerirTipoRecuperacao("PIS_COFINS_JUD", "PIS/COFINS judicial")).toBe(
      "recuperacao_judicial",
    );
    expect(sugerirTipoRecuperacao("INSS", "Recuperação Judicial")).toBe(
      "recuperacao_judicial",
    );
  });

  it("sugere ressarcimento pelo nome", () => {
    expect(sugerirTipoRecuperacao("PIS", "Ressarcimento PIS")).toBe("ressarcimento");
  });

  it("default compensacao", () => {
    expect(sugerirTipoRecuperacao("INSUMOS", "PIS/COFINS Insumos")).toBe("compensacao");
  });

  it("kanban só mostra ramos especiais", () => {
    expect(
      ramosVisiveisNoKanban({ tem_ramo_ressarcimento: false, tem_ramo_judicial: false }),
    ).toEqual([]);
    expect(
      ramosVisiveisNoKanban({ tem_ramo_ressarcimento: true, tem_ramo_judicial: true }),
    ).toEqual(["ressarcimento", "recuperacao_judicial"]);
  });

  it("labels estáveis", () => {
    expect(TIPO_RECUPERACAO_LABEL.recuperacao_judicial).toBe("Recuperação Judicial");
  });
});

describe("resolveTipoRecuperacao (motor_teses_config.tipo_recuperacao_padrao)", () => {
  it("prioriza o padrão configurado, mesmo indo contra a heurística de nome", () => {
    expect(resolveTipoRecuperacao("recuperacao_judicial", "INSUMOS", "PIS/COFINS Insumos")).toBe(
      "recuperacao_judicial",
    );
  });

  it("cai pra heurística quando não há padrão configurado", () => {
    expect(resolveTipoRecuperacao(null, "PIS_COFINS_JUD", "PIS/COFINS judicial")).toBe(
      "recuperacao_judicial",
    );
    expect(resolveTipoRecuperacao(undefined, "INSUMOS", "PIS/COFINS Insumos")).toBe("compensacao");
  });

  it("ignora valor configurado inválido e cai pra heurística", () => {
    expect(resolveTipoRecuperacao("valor_invalido", "INSS", "Recuperação Judicial")).toBe(
      "recuperacao_judicial",
    );
  });
});
