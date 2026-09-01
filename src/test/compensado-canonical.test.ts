import { describe, expect, it } from "vitest";
import {
  breakdownPorTese,
  buildProcessoIdsByTese,
  compMatchesTese,
  filterCompensadoCanonical,
  filterCompsForTese,
  inferTeseCodigoFromTributo,
  isTeseNoCalculoDefault,
  mergeCreditosComProcessosFallback,
  normalizeTeseCatalogCodigo,
  splitCreditosCalculo,
  statusUtilizacaoFromSaldo,
  sumCompensadoCanonical,
  sumCompensadoForTese,
  sumCompensadoNoCalculo,
} from "@/lib/clientes-constants";

describe("normalizeTeseCatalogCodigo", () => {
  it("mapeia slugs do Motor para o enum do catálogo", () => {
    expect(normalizeTeseCatalogCodigo("pis_cofins_insumos")).toBe("INSUMOS");
    expect(normalizeTeseCatalogCodigo("subvencao_icms", "Subvenção ICMS (IRPJ/CSLL)")).toBe("SUBVENCAO");
    expect(normalizeTeseCatalogCodigo("icms_st")).toBe("ICMS_ST");
    expect(normalizeTeseCatalogCodigo("ICMS ST")).toBe("ICMS_ST");
    expect(normalizeTeseCatalogCodigo("reporto")).toBe("REPORTO");
    expect(normalizeTeseCatalogCodigo("INSUMOS")).toBe("INSUMOS");
    expect(normalizeTeseCatalogCodigo("")).toBeNull();
  });
});

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

  it("IRPJ linkado errado em Insumos vai para Subvenção (sem SQL)", () => {
    const rows = [
      {
        mes_referencia: "2026-03-01",
        tese_origem_id: "tese-insumos",
        processo_tese_id: null as string | null,
        tributo_enum: "IRPJ_CSLL_agregado",
        valor_compensado: 981876.55,
      },
    ];
    expect(
      compMatchesTese(rows[0], { teseCodigo: "INSUMOS", teseId: "tese-insumos" }),
    ).toBe(false);
    expect(
      compMatchesTese(rows[0], { teseCodigo: "SUBVENCAO", teseId: "tese-sub" }),
    ).toBe(true);
    expect(
      sumCompensadoForTese(rows, { teseCodigo: "INSUMOS", teseId: "tese-insumos" }),
    ).toBe(0);
    expect(
      sumCompensadoForTese(rows, { teseCodigo: "SUBVENCAO", teseId: "tese-sub" }),
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

  it("slug do Motor no processo casa com código do catálogo", () => {
    const row = {
      mes_referencia: "2026-07-01",
      tese_origem_id: null as string | null,
      processo_tese_id: "proc-1",
      tributo_enum: "PIS",
      valor_compensado: 10,
      processos_teses: { tese: "pis_cofins_insumos", nome_exibicao: "Insumos" },
    };
    expect(compMatchesTese(row, { teseCodigo: "INSUMOS" })).toBe(true);
    expect(compMatchesTese(row, { teseCodigo: "SUBVENCAO" })).toBe(false);
  });
});

describe("Mapa Tributário — geral do mês com mais de uma tese", () => {
  // Espelha compsForProcesso() da aba Compensações: uma seção por processo.
  const compsForProcesso = (rows: Parameters<typeof filterCompsForTese>[0], proc: { id: string; tese: string }) =>
    filterCompsForTese(rows, {
      teseCodigo: proc.tese,
      teseId: null,
      processoIds: new Set([proc.id]),
    });

  const procSubvencao = { id: "proc-subvencao", tese: "SUBVENCAO" };
  const procInsumos = { id: "proc-insumos", tese: "INSUMOS" };

  const julRows = [
    { tributo_enum: "INSS", valor_compensado: 152614.15 },
    { tributo_enum: "INSS_retidos", valor_compensado: 1304.29 },
    { tributo_enum: "PIS", valor_compensado: 18125.64 },
    { tributo_enum: "COFINS", valor_compensado: 84560.59 },
    { tributo_enum: "IRPJ/CSLL", valor_compensado: 973819.75 },
  ].map((r) => ({
    ...r,
    mes_referencia: "2026-07-01",
    tese_origem_id: null as string | null,
    processo_tese_id: "proc-subvencao" as string | null,
    processos_teses: { tese: "SUBVENCAO", nome_exibicao: "Subvenção de ICMS" },
  }));

  it("não repete PIS/COFINS/INSS da Subvenção na seção de Insumos", () => {
    expect(
      compsForProcesso(julRows, procSubvencao).reduce(
        (s, c) => s + Number(c.valor_compensado || 0),
        0,
      ),
    ).toBeCloseTo(1230424.42, 2);
    expect(compsForProcesso(julRows, procInsumos)).toHaveLength(0);
  });

  it("mantém órfã sem processo na tese inferida pelo tributo", () => {
    const orfa = {
      mes_referencia: "2026-07-01",
      tese_origem_id: null as string | null,
      processo_tese_id: null as string | null,
      tributo_enum: "INSS_52",
      valor_compensado: 1000,
    };
    expect(compsForProcesso([...julRows, orfa], procInsumos)).toHaveLength(1);
  });
});

describe("Mapa Tributário — honorários salvos e DCOMP", () => {
  const honorarioSalvo = (c: { honorario_valor?: number | null; valor_nf_servico?: number | null }) =>
    Number(c.honorario_valor ?? c.valor_nf_servico ?? 0);

  const formatDcomps = (c: { dcomps?: { numero_declaracao?: string }[] }) => {
    const nums = (c.dcomps ?? []).map((d) => d.numero_declaracao).filter(Boolean);
    return nums.length ? nums.join("\n") : "—";
  };

  it("soma só honorário gravado — não recalcula % nas linhas sem valor", () => {
    const procComps = [
      { valor_compensado: 1000, honorario_valor: 150, honorario_percentual: 0.15 },
      { valor_compensado: 2000, honorario_valor: null, honorario_percentual: 0.15 },
    ];
    const total = procComps.reduce((s, c) => s + honorarioSalvo(c), 0);
    expect(total).toBe(150);
  });

  it("usa valor_nf_servico quando honorario_valor está vazio", () => {
    expect(honorarioSalvo({ honorario_valor: null, valor_nf_servico: 80 })).toBe(80);
  });

  it("formata DCOMPs e reserva traço quando não há declaração", () => {
    expect(
      formatDcomps({
        dcomps: [
          { numero_declaracao: "12345.12345.123456.1.1.12-2026" },
          { numero_declaracao: "99999.99999.999999.9.9.99-2026" },
        ],
      }),
    ).toBe("12345.12345.123456.1.1.12-2026\n99999.99999.999999.9.9.99-2026");
    expect(formatDcomps({ dcomps: [] })).toBe("—");
  });
});

describe("statusUtilizacaoFromSaldo", () => {
  it("deriva Compensado / Compensando / Não iniciado", () => {
    expect(statusUtilizacaoFromSaldo(100, 0)).toBe("a_utilizar");
    expect(statusUtilizacaoFromSaldo(100, 40)).toBe("em_uso");
    expect(statusUtilizacaoFromSaldo(100, 100)).toBe("utilizado");
  });
});

describe("splitCreditosCalculo", () => {
  const reporto = new Set(["tese-reporto"]);

  it("soma só teses no cálculo e joga REPORTO para possíveis futuros", () => {
    const r = splitCreditosCalculo(
      [
        { tese_id: "insumos", valor_apurado_inicial: 2000000, incluir_no_calculo: true },
        { tese_id: "subvencao", valor_apurado_inicial: 1523005.14, incluir_no_calculo: true },
        { tese_id: "tese-reporto", valor_apurado_inicial: 755091, incluir_no_calculo: true },
        { tese_id: "icms", valor_apurado_inicial: 100, incluir_no_calculo: false },
      ],
      reporto,
    );
    expect(r.creditoApurado).toBeCloseTo(3523005.14, 2);
    expect(r.possiveisFuturos).toBeCloseTo(755191, 2);
    expect(r.tesesNoCalculo).toBe(2);
  });

  it("saldo restante = apurado − compensado da aba (não usa snapshot da view)", () => {
    const r = splitCreditosCalculo(
      [
        { tese_id: "insumos", valor_apurado_inicial: 3523005.14, incluir_no_calculo: true },
      ],
      reporto,
    );
    const compensadoAba = 1783942.04;
    const saldo = r.creditoApurado - compensadoAba;
    expect(saldo).toBeCloseTo(1739063.1, 2);
    expect(saldo).not.toBeCloseTo(1270297.3, 2);
  });
});

describe("isTeseNoCalculoDefault", () => {
  it("só INSUMOS e SUBVENCAO entram no cálculo por padrão", () => {
    expect(isTeseNoCalculoDefault("INSUMOS")).toBe(true);
    expect(isTeseNoCalculoDefault("SUBVENCAO")).toBe(true);
    expect(isTeseNoCalculoDefault("insumos")).toBe(true);
    expect(isTeseNoCalculoDefault("ICMS_ST")).toBe(false);
    expect(isTeseNoCalculoDefault("REPORTO")).toBe(false);
    expect(isTeseNoCalculoDefault("EXCLUSAO_ICMS_BC")).toBe(false);
    expect(isTeseNoCalculoDefault(null)).toBe(false);
  });
});

describe("mergeCreditosComProcessosFallback", () => {
  const teseIdByCodigo = new Map([
    ["INSUMOS", "t-insumos"],
    ["SUBVENCAO", "t-subvencao"],
    ["ICMS_ST", "t-icms"],
  ]);

  it("usa valor_credito do processo INSUMOS/SUBVENCAO quando não há linha de crédito", () => {
    const merged = mergeCreditosComProcessosFallback({
      creditos: [],
      processos: [
        { tese: "INSUMOS", nome_exibicao: "Insumos", valor_credito: 933537.79 },
        { tese: "ICMS_ST", nome_exibicao: "Exclusão ICMS ST", valor_credito: 100000 },
      ],
      teseIdByCodigo,
    });
    const split = splitCreditosCalculo(merged);
    expect(split.creditoApurado).toBeCloseTo(933537.79, 2);
    expect(split.tesesNoCalculo).toBe(1);
  });

  it("não duplica quando já existe linha em creditos_apurados", () => {
    const merged = mergeCreditosComProcessosFallback({
      creditos: [
        { tese_id: "t-insumos", valor_apurado_inicial: 500000, incluir_no_calculo: true },
      ],
      processos: [
        { tese: "pis_cofins_insumos", nome_exibicao: "Insumos", valor_credito: 933537.79 },
      ],
      teseIdByCodigo,
    });
    const split = splitCreditosCalculo(merged);
    expect(split.creditoApurado).toBe(500000);
    expect(merged).toHaveLength(1);
  });
});

describe("breakdownPorTese", () => {
  const teseInfo = new Map([
    ["t-insumos", { codigo: "INSUMOS", label: "Insumos" }],
    ["t-subvencao", { codigo: "SUBVENCAO", label: "Subvenção" }],
    ["t-reporto", { codigo: "REPORTO", label: "Reporto" }],
    ["t-icms", { codigo: "ICMS_ST", label: "Exclusão ICMS-ST" }],
  ]);

  it("separa apurado e compensado por tese em vez de somar (caso Maravista)", () => {
    const rows = breakdownPorTese({
      creditos: [
        { tese_id: "t-insumos", valor_apurado_inicial: 2400000, incluir_no_calculo: true },
        { tese_id: "t-subvencao", valor_apurado_inicial: 3000000, incluir_no_calculo: true },
      ],
      comps: [
        {
          mes_referencia: "2026-07-01",
          tese_origem_id: null,
          tributo_enum: "PIS",
          valor_compensado: 400000,
        },
        {
          mes_referencia: "2026-03-01",
          tese_origem_id: null,
          tributo_enum: "IRPJ_CSLL_agregado",
          valor_compensado: 1000000,
        },
      ],
      teseInfo,
    });

    expect(rows).toHaveLength(2);
    const subvencao = rows.find((r) => r.codigo === "SUBVENCAO")!;
    const insumos = rows.find((r) => r.codigo === "INSUMOS")!;
    expect(subvencao.apurado).toBe(3000000);
    expect(subvencao.compensado).toBe(1000000);
    expect(subvencao.saldo).toBe(2000000);
    expect(insumos.apurado).toBe(2400000);
    expect(insumos.compensado).toBe(400000);
    expect(insumos.saldo).toBe(2000000);
    // Consolidado continua batendo com a soma das partes.
    expect(rows.reduce((s, r) => s + r.apurado, 0)).toBe(5400000);
  });

  it("ignora teses fora do cálculo e Reporto", () => {
    const rows = breakdownPorTese({
      creditos: [
        { tese_id: "t-insumos", valor_apurado_inicial: 1000, incluir_no_calculo: true },
        { tese_id: "t-reporto", valor_apurado_inicial: 9999, incluir_no_calculo: true },
        { tese_id: "t-subvencao", valor_apurado_inicial: 500, incluir_no_calculo: false },
      ],
      comps: [],
      teseInfo,
      reportoTeseIds: new Set(["t-reporto"]),
    });
    expect(rows.map((r) => r.codigo)).toEqual(["INSUMOS"]);
  });

  it("não duplica linha linkada a processo cujo tributo aponta para outra tese (Maravista jul/2026)", () => {
    // Compensações de jul/2026 estão todas no processo Subvenção de ICMS,
    // inclusive PIS/COFINS/INSS. Não podem aparecer também em Insumos.
    const julSubvencao = [
      { tributo_enum: "INSS", valor_compensado: 152614.15 },
      { tributo_enum: "INSS_retidos", valor_compensado: 1304.29 },
      { tributo_enum: "PIS", valor_compensado: 18125.64 },
      { tributo_enum: "COFINS", valor_compensado: 84560.59 },
      { tributo_enum: "IRPJ/CSLL", valor_compensado: 973819.75 },
    ].map((r) => ({
      ...r,
      mes_referencia: "2026-07-01",
      tese_origem_id: null as string | null,
      processo_tese_id: "proc-subvencao" as string | null,
      processos_teses: { tese: "SUBVENCAO", nome_exibicao: "Subvenção de ICMS" },
    }));

    const rows = breakdownPorTese({
      creditos: [
        { tese_id: "t-insumos", valor_apurado_inicial: 2000000, incluir_no_calculo: true },
        { tese_id: "t-subvencao", valor_apurado_inicial: 3376449.69, incluir_no_calculo: true },
      ],
      comps: [
        ...julSubvencao,
        {
          mes_referencia: "2026-03-01",
          tese_origem_id: null,
          processo_tese_id: "proc-subvencao",
          tributo_enum: "IRPJ_CSLL_agregado",
          valor_compensado: 981876.55,
          processos_teses: { tese: "SUBVENCAO", nome_exibicao: "Subvenção de ICMS" },
        },
        {
          mes_referencia: "2026-05-01",
          tese_origem_id: null,
          processo_tese_id: "proc-insumos",
          tributo_enum: "INSS_52",
          valor_compensado: 142926.78,
          processos_teses: { tese: "INSUMOS", nome_exibicao: "Insumos" },
        },
      ],
      teseInfo,
      processoIdsByTese: new Map([
        ["SUBVENCAO", new Set(["proc-subvencao"])],
        ["INSUMOS", new Set(["proc-insumos"])],
      ]),
    });

    const subvencao = rows.find((r) => r.codigo === "SUBVENCAO")!;
    const insumos = rows.find((r) => r.codigo === "INSUMOS")!;
    expect(subvencao.compensado).toBeCloseTo(2212300.97, 2);
    expect(subvencao.saldo).toBeCloseTo(1164148.72, 2);
    expect(insumos.compensado).toBeCloseTo(142926.78, 2);
    // Soma das teses = total consolidado, sem contar as linhas de jul duas vezes.
    expect(rows.reduce((s, r) => s + r.compensado, 0)).toBeCloseTo(2355227.75, 2);
  });

  it("usa processo_tese_id da tese quando a compensação está linkada", () => {
    const rows = breakdownPorTese({
      creditos: [{ tese_id: "t-insumos", valor_apurado_inicial: 1000, incluir_no_calculo: true }],
      comps: [
        {
          mes_referencia: "2026-05-01",
          tese_origem_id: null,
          processo_tese_id: "proc-1",
          tributo_enum: "OUTROS_NAO_MAPEADO",
          valor_compensado: 250,
        },
      ],
      teseInfo,
      processoIdsByTese: new Map([["INSUMOS", new Set(["proc-1"])]]),
    });
    expect(rows[0].compensado).toBe(250);
    expect(rows[0].saldo).toBe(750);
  });

  it("consolidado ignora compensado de tese fora do cálculo (São Fernando)", () => {
    const rows = breakdownPorTese({
      creditos: [
        { tese_id: "t-insumos", valor_apurado_inicial: 1484315.43, incluir_no_calculo: true },
        { tese_id: "t-subvencao", valor_apurado_inicial: 661751.9, incluir_no_calculo: false },
      ],
      comps: [
        {
          mes_referencia: "2026-02-01",
          tese_origem_id: null as string | null,
          processo_tese_id: "proc-insumos",
          tributo_enum: "INSS_52",
          valor_compensado: 651437.83,
          processos_teses: { tese: "INSUMOS" },
        },
        {
          mes_referencia: "2026-02-01",
          tese_origem_id: null as string | null,
          processo_tese_id: "proc-subvencao",
          tributo_enum: "outros",
          valor_compensado: 104278.96,
          processos_teses: { tese: "SUBVENCAO" },
        },
        {
          mes_referencia: "2026-07-01",
          tese_origem_id: null as string | null,
          processo_tese_id: "proc-icms",
          tributo_enum: "IRPJ/CSLL",
          valor_compensado: 370124.46,
          processos_teses: { tese: "ICMS_ST" },
        },
      ],
      teseInfo,
      processoIdsByTese: new Map([
        ["INSUMOS", new Set(["proc-insumos"])],
        ["SUBVENCAO", new Set(["proc-subvencao"])],
        ["ICMS_ST", new Set(["proc-icms"])],
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].codigo).toBe("INSUMOS");
    expect(sumCompensadoNoCalculo(rows)).toBeCloseTo(651437.83, 2);
    expect(rows[0].saldo).toBeCloseTo(832877.6, 2);
    const abaInteira = 651437.83 + 104278.96 + 370124.46;
    expect(sumCompensadoNoCalculo(rows)).not.toBeCloseTo(abaInteira, 2);
  });

  it("GRANO: processo Subvenção sem crédito no cálculo entra em Insumos (origem/tributo)", () => {
    const rows = breakdownPorTese({
      creditos: [
        { tese_id: "t-insumos", valor_apurado_inicial: 642805.11, incluir_no_calculo: true },
      ],
      comps: [
        {
          mes_referencia: "2026-07-01",
          tese_origem_id: "t-insumos",
          processo_tese_id: "proc-insumos",
          tributo_enum: "INSS_52",
          valor_compensado: 243088.2,
          processos_teses: { tese: "INSUMOS", nome_exibicao: "PIS/COFINS Insumos" },
        },
        {
          mes_referencia: "2025-11-01",
          tese_origem_id: "t-insumos",
          processo_tese_id: "proc-subvencao",
          tributo_enum: "INSS_52",
          valor_compensado: 68201.38,
          processos_teses: { tese: "subvencao", nome_exibicao: "Subvenção de ICMS" },
        },
        {
          mes_referencia: "2025-11-01",
          tese_origem_id: "t-insumos",
          processo_tese_id: "proc-subvencao",
          tributo_enum: "PIS",
          valor_compensado: 2848.22,
          processos_teses: { tese: "subvencao", nome_exibicao: "Subvenção de ICMS" },
        },
      ],
      teseInfo,
      processoIdsByTese: buildProcessoIdsByTese([
        { id: "proc-insumos", tese: "INSUMOS", nome_exibicao: "PIS/COFINS Insumos" },
        { id: "proc-subvencao", tese: "subvencao", nome_exibicao: "Subvenção de ICMS" },
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].compensado).toBeCloseTo(314137.8, 2);
    const footer = sumCompensadoCanonical([
      { valor_compensado: 243088.2 },
      { valor_compensado: 68201.38 },
      { valor_compensado: 2848.22 },
    ]);
    expect(footer).toBeCloseTo(314137.8, 2);
    expect(rows[0].compensado).toBeCloseTo(footer, 2);
  });
});
