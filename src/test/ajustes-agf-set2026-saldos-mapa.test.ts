import { describe, expect, it } from "vitest";
import { calcularSaldosCliente } from "@/lib/saldos-cliente";
import { buildMapaExecutivo, percentualComoFracao } from "@/lib/mapa-executivo";

/**
 * Fixture no formato do banco, com os números do Relatório Executivo de
 * referência (Supermercado Liberdade · set/2026): Subvenção com crédito de
 * R$ 647.083,86, já utilizado R$ 443.800,91; set/2026 com INSS, COFINS e PIS
 * a 15%. Insumos vem como slug do motor (`pis_cofins_insumos`) para cobrir o
 * bug antigo do Mapa (crédito não achado por `upper(tese)`).
 */
const TESES = [
  { id: "t-ins", codigo: "INSUMOS", label: "Créditos de PIS/COFINS sobre Insumos" },
  { id: "t-sub", codigo: "SUBVENCAO", label: "Subvenção ICMS (exclusão base IRPJ/CSLL)" },
  { id: "t-rep", codigo: "REPORTO", label: "REPORTO" },
];
const PROCESSOS = [
  { id: "p-sub", tese: "subvencao", nome_exibicao: "Subvenção de ICMS", valor_credito: 647_083.86, percentual_honorario: 15 },
  { id: "p-ins", tese: "pis_cofins_insumos", nome_exibicao: "PIS/COFINS Insumos", valor_credito: 999_999, percentual_honorario: 0.2 },
  { id: "p-rep", tese: "reporto", nome_exibicao: "REPORTO", categoria: "reporto", valor_credito: 5_000_000 },
];
const CREDITOS = [
  { tese_id: "t-sub", valor_apurado_inicial: 647_083.86, incluir_no_calculo: true },
  { tese_id: "t-ins", valor_apurado_inicial: 300_000, incluir_no_calculo: true },
  { tese_id: "t-rep", valor_apurado_inicial: 5_000_000, incluir_no_calculo: false },
];

const comp = (
  id: string,
  mes: string,
  valor: number,
  processo: string,
  tributo: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  cliente_id: "lib",
  mes_referencia: `${mes}-01`,
  valor_compensado: valor,
  processo_tese_id: processo,
  tese_origem_id: processo === "p-sub" ? "t-sub" : processo === "p-ins" ? "t-ins" : null,
  tributo,
  processos_teses: PROCESSOS.find((p) => p.id === processo) ?? null,
  ...extra,
});

const COMPS = [
  // Subvenção: 411.290,52 até agosto + 32.510,39 em setembro = 443.800,91
  comp("s1", "2026-06", 200_000, "p-sub", "INSS"),
  comp("s2", "2026-07", 111_290.52, "p-sub", "INSS"),
  comp("s3", "2026-08", 100_000, "p-sub", "COFINS"),
  comp("s4", "2026-09", 23_731.9, "p-sub", "INSS", { honorario_percentual: 0.15 }),
  comp("s5", "2026-09", 7_217.74, "p-sub", "COFINS", { honorario_percentual: 0.15 }),
  comp("s6", "2026-09", 1_560.75, "p-sub", "PIS", { honorario_percentual: 0.15 }),
  // Insumos: 146.583,69 utilizados → saldo 153.416,31
  comp("i1", "2026-08", 100_000, "p-ins", "PIS"),
  comp("i2", "2026-09", 46_583.69, "p-ins", "COFINS"),
  // Órfã sem processo: IRPJ cai em Subvenção pela inferência de tributo… em outubro
  comp("o1", "2026-10", 1_000, "", "IRPJ", { processo_tese_id: null, processos_teses: null }),
  // REPORTO nunca entra no saldo
  comp("r1", "2026-09", 9_999, "p-rep", "PIS"),
];

const BASE = { creditos: CREDITOS, comps: COMPS, processos: PROCESSOS, teses: TESES };

describe("itens 6 e 7 · saldo único", () => {
  it("'Todas as teses' = card Saldo restante e soma das teses", () => {
    const s = calcularSaldosCliente({ ...BASE, mesFim: "2026-09" });
    expect(s.apuradoTotal).toBeCloseTo(947_083.86, 2);
    expect(s.saldoTotal).toBeCloseTo(356_699.26, 2);
    const somaTeses = s.porTese.reduce((acc, t) => acc + t.saldo, 0);
    expect(somaTeses).toBeCloseTo(s.saldoTotal, 2);
  });

  it("tese específica = crédito − utilizado acumulado (inclui órfã inferida)", () => {
    const s = calcularSaldosCliente(BASE);
    expect(s.saldoDaTese("SUBVENCAO").saldo).toBeCloseTo(647_083.86 - 443_800.91 - 1_000, 2);
    expect(s.saldoDaTese("INSUMOS").saldo).toBeCloseTo(153_416.31, 2);
  });

  it("não depende do join processos_teses vir na linha", () => {
    const semJoin = COMPS.map(({ processos_teses: _join, ...resto }) => resto);
    const s = calcularSaldosCliente({ ...BASE, comps: semJoin, mesFim: "2026-09" });
    expect(s.saldoDaTese("INSUMOS").saldo).toBeCloseTo(153_416.31, 2);
    expect(s.saldoDaTese("SUBVENCAO").saldo).toBeCloseTo(203_282.95, 2);
  });
});

describe("itens 5 e 8 · novo Mapa Tributário", () => {
  const mapa = buildMapaExecutivo({ ...BASE, codigo: "SUBVENCAO", mes: "2026-09" });

  it("bloco 01 bate com o saldo da tese filtrada no mesmo mês", () => {
    const s = calcularSaldosCliente({ ...BASE, mesFim: "2026-09" });
    expect(mapa.teseLabel).toBe("Subvenção IRPJ/CSLL");
    expect(mapa.credito.total).toBeCloseTo(647_083.86, 2);
    expect(mapa.credito.utilizado).toBeCloseTo(443_800.91, 2);
    expect(mapa.credito.saldo).toBeCloseTo(203_282.95, 2);
    expect(mapa.credito.saldo).toBeCloseTo(s.saldoDaTese("SUBVENCAO").saldo, 2);
    expect(mapa.credito.pctUtilizado).toBeCloseTo(68.6, 1);
    // média mensal = 443.800,91 / 4 meses → ≈ 2 meses de fôlego
    expect(mapa.credito.folegoMeses).toBe(Math.round(203_282.95 / (443_800.91 / 4)));
  });

  it("bloco 02 e economia líquida do mês", () => {
    expect(mapa.tributos.map((t) => t.tributo)).toEqual(["INSS", "COFINS", "PIS"]);
    expect(mapa.tributosTotal).toBeCloseTo(32_510.39, 2);
    expect(mapa.tributos[0].pct).toBeCloseTo(73.0, 1);
    expect(mapa.honorarios).toBeCloseTo(4_876.56, 2);
    expect(mapa.honorariosPctLabel).toBe("15%");
    expect(mapa.economiaLiquida).toBeCloseTo(27_633.83, 2);
  });

  it("bloco 03 usa o padrão da tese quando o banco não tem o campo", () => {
    expect(mapa.fiscal.obrigacoesRetificadas).toBe("ECF e DCTF");
    expect(mapa.fiscal.baseLegal).toContain("Lei nº 12.973/2014");
    const comBanco = buildMapaExecutivo({
      ...BASE,
      codigo: "SUBVENCAO",
      mes: "2026-09",
      tesesFiscal: [{ codigo: "SUBVENCAO", base_legal: "Base do banco", obrigacoes_retificadas: "ECF" }],
    });
    expect(comBanco.fiscal.baseLegal).toBe("Base do banco");
    expect(comBanco.fiscal.obrigacoesRetificadas).toBe("ECF");
  });

  it("bloco 04 lista as outras teses com saldo e marca a do mapa", () => {
    expect(mapa.carteira.map((c) => [c.label, c.atual])).toEqual([
      ["Subvenção IRPJ/CSLL", true],
      ["Insumos de PIS/COFINS", false],
    ]);
    expect(mapa.carteira[1].saldo).toBeCloseTo(153_416.31, 2);
    expect(mapa.saldoTotalDisponivel).toBeCloseTo(356_699.26, 2);

    const mapaInsumos = buildMapaExecutivo({ ...BASE, codigo: "INSUMOS", mes: "2026-09" });
    expect(mapaInsumos.carteira[0]).toMatchObject({ codigo: "INSUMOS", atual: true });
    expect(mapaInsumos.carteira.find((c) => c.codigo === "SUBVENCAO")?.saldo).toBeCloseTo(203_282.95, 2);
    // Crédito vem do creditos_apurados, não do valor_credito do processo slug.
    expect(mapaInsumos.credito.total).toBe(300_000);
  });

  it("percentual de honorário aceita as duas escalas do banco", () => {
    expect(percentualComoFracao(15)).toBe(0.15);
    expect(percentualComoFracao(0.15)).toBe(0.15);
    expect(percentualComoFracao(null)).toBe(0);
  });
});
