import { describe, expect, it } from "vitest";
import {
  compMatchesTese,
  filterCompensadoCanonical,
  inferTeseCodigoFromTributo,
  statusUtilizacaoFromSaldo,
  sumCompensadoCanonical,
  sumCompensadoForTese,
} from "@/lib/clientes-constants";

describe("inferTeseCodigoFromTributo", () => {
  it("mapeia PIS/COFINS/INSS → INSUMOS e IRPJ → SUBVENCAO", () => {
    expect(inferTeseCodigoFromTributo("PIS")).toBe("INSUMOS");
    expect(inferTeseCodigoFromTributo("COFINS")).toBe("INSUMOS");
    expect(inferTeseCodigoFromTributo("INSS_52")).toBe("INSUMOS");
    expect(inferTeseCodigoFromTributo("IRPJ_CSLL_agregado")).toBe("SUBVENCAO");
    expect(inferTeseCodigoFromTributo("ICMS")).toBe("ICMS_ST");
  });
});

describe("sumCompensadoCanonical — órfãs", () => {
  it("NÃO descarta órfã de outro tributo no mesmo mês (bug Maravista)", () => {
    const rows = [
      {
        mes_referencia: "2026-04-01",
        tese_origem_id: "tese-insumos",
        tributo_enum: "PIS",
        valor_compensado: 100,
      },
      {
        mes_referencia: "2026-04-01",
        tese_origem_id: null as string | null,
        tributo_enum: "COFINS",
        valor_compensado: 200,
      },
    ];
    expect(sumCompensadoCanonical(rows)).toBe(300);
  });

  it("descarta só órfã gêmea (mesmo mês+tributo+valor)", () => {
    const rows = [
      {
        mes_referencia: "2026-04-01",
        tese_origem_id: "tese-insumos",
        tributo_enum: "PIS",
        valor_compensado: 100,
      },
      {
        mes_referencia: "2026-04-01",
        tese_origem_id: null as string | null,
        tributo_enum: "PIS",
        valor_compensado: 100,
      },
      {
        mes_referencia: "2026-04-01",
        tese_origem_id: null as string | null,
        tributo_enum: "COFINS",
        valor_compensado: 50,
      },
    ];
    expect(sumCompensadoCanonical(rows)).toBe(150);
    expect(filterCompensadoCanonical(rows)).toHaveLength(2);
  });

  it("exclui Reporto por processo", () => {
    const rows = [
      {
        mes_referencia: "2026-04-01",
        tese_origem_id: null as string | null,
        processo_tese_id: "proc-rep",
        tributo_enum: "PIS",
        valor_compensado: 999,
        processos_teses: { tese: "REPORTO" },
      },
      {
        mes_referencia: "2026-04-01",
        tese_origem_id: "tese-insumos",
        tributo_enum: "PIS",
        valor_compensado: 10,
      },
    ];
    expect(sumCompensadoCanonical(rows, { reportoProcessoIds: new Set(["proc-rep"]) })).toBe(10);
  });
});

describe("compMatchesTese / sumCompensadoForTese", () => {
  it("inclui órfã PIS em Insumos e IRPJ em Subvenção", () => {
    const rows = [
      {
        mes_referencia: "2026-07-01",
        tese_origem_id: null as string | null,
        processo_tese_id: null as string | null,
        tributo_enum: "PIS",
        valor_compensado: 73524.93,
      },
      {
        mes_referencia: "2026-07-01",
        tese_origem_id: null as string | null,
        processo_tese_id: null as string | null,
        tributo_enum: "COFINS",
        valor_compensado: 68397.88,
      },
      {
        mes_referencia: "2026-03-01",
        tese_origem_id: null as string | null,
        processo_tese_id: null as string | null,
        tributo_enum: "IRPJ_CSLL_agregado",
        valor_compensado: 981876.55,
      },
    ];

    expect(
      compMatchesTese(rows[0], { teseCodigo: "INSUMOS", teseId: "ti", processoIds: new Set() }),
    ).toBe(true);
    expect(
      compMatchesTese(rows[2], { teseCodigo: "SUBVENCAO", teseId: "ts", processoIds: new Set() }),
    ).toBe(true);

    expect(
      sumCompensadoForTese(rows, { teseCodigo: "INSUMOS", teseId: "ti" }),
    ).toBeCloseTo(141922.81, 2);
    expect(
      sumCompensadoForTese(rows, { teseCodigo: "SUBVENCAO", teseId: "ts" }),
    ).toBeCloseTo(981876.55, 2);
  });

  it("bate processo_tese_id mesmo sem tese_origem", () => {
    const rows = [
      {
        mes_referencia: "2026-07-01",
        tese_origem_id: null as string | null,
        processo_tese_id: "proc-1",
        tributo_enum: "PIS",
        valor_compensado: 10,
      },
    ];
    expect(
      sumCompensadoForTese(rows, {
        teseCodigo: "INSUMOS",
        teseId: "ti",
        processoIds: new Set(["proc-1"]),
      }),
    ).toBe(10);
  });
});

describe("statusUtilizacaoFromSaldo", () => {
  it("deriva Compensado / Compensando / Não iniciado", () => {
    expect(statusUtilizacaoFromSaldo(100, 0)).toBe("a_utilizar");
    expect(statusUtilizacaoFromSaldo(100, 40)).toBe("em_uso");
    expect(statusUtilizacaoFromSaldo(100, 100)).toBe("utilizado");
  });
});
