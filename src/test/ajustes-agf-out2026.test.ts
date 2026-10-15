import { describe, expect, it } from "vitest";
import { resumirFinanceiroPorCliente } from "@/lib/operacional-analytics";

const TESES = [
  { id: "t-insumos", codigo: "INSUMOS", label: "Insumos" },
  { id: "t-jud", codigo: "PIS_COFINS_JUD", label: "PIS/COFINS da Base — Via Judicial" },
  { id: "t-reporto", codigo: "REPORTO", label: "Reporto" },
];

const base = { cliente_id: "a", status_contrato: "assinado", status_processo: "compensando", criado_em: "2026-01-01" };
const PROCESSOS = [
  { ...base, id: "p-ins", tese: "INSUMOS", categoria: "compensacao", tipo_recuperacao: "compensacao", valor_credito: 1_000 },
  { ...base, id: "p-rep", tese: "REPORTO", categoria: "reporto", tipo_recuperacao: "compensacao", valor_credito: 7_000 },
  { ...base, id: "p-jud", tese: "PIS_COFINS_JUD", categoria: "recuperacao_judicial", tipo_recuperacao: "recuperacao_judicial", valor_credito: 4_000 },
];
const CREDITOS = [
  { cliente_id: "a", tese_id: "t-insumos", valor_apurado_inicial: 1_000, incluir_no_calculo: true },
  { cliente_id: "a", tese_id: "t-jud", valor_apurado_inicial: 4_000, incluir_no_calculo: false },
];
const COMPS = [
  { cliente_id: "a", mes_referencia: "2026-09-01", valor_compensado: 300, tese_origem_id: "t-insumos", processo_tese_id: "p-ins", tributo_enum: "PIS" },
];

describe("AGF 09/10 · empresa com 3 teses e um só status", () => {
  it("saldo segue só a tese de compensação; Reporto e judicial somam à parte", () => {
    const [total] = resumirFinanceiroPorCliente(["a"], COMPS, CREDITOS, TESES, PROCESSOS);
    expect(total).toMatchObject({
      credito_apurado: 1_000,
      total_compensado: 300,
      saldo_restante: 700,
      possiveis_recebimentos: 7_000,
      recuperacao_judicial: 4_000,
    });
  });

  it("filtro de tese restringe os cards fora do saldo à tese escolhida", () => {
    const [soInsumos] = resumirFinanceiroPorCliente(["a"], COMPS, CREDITOS, TESES, PROCESSOS, ["INSUMOS"]);
    expect(soInsumos).toMatchObject({ possiveis_recebimentos: 0, recuperacao_judicial: 0 });
    const [soReporto] = resumirFinanceiroPorCliente(["a"], COMPS, CREDITOS, TESES, PROCESSOS, ["REPORTO"]);
    expect(soReporto.possiveis_recebimentos).toBe(7_000);
  });

  it("recorte só por tese (AGF 15/10): levantado, utilizado e saldo da própria tese, com os lançamentos dela", () => {
    const comps = [
      ...COMPS,
      { cliente_id: "a", mes_referencia: "2026-08-01", valor_compensado: 1_500, processo_tese_id: "p-rep", tributo_enum: "PIS" },
      { cliente_id: "a", mes_referencia: "2026-09-01", valor_compensado: 1_000, processo_tese_id: "p-jud", tributo_enum: "COFINS" },
    ];
    const [reporto] = resumirFinanceiroPorCliente(["a"], comps, CREDITOS, TESES, PROCESSOS, ["REPORTO"]);
    expect(reporto).toMatchObject({ credito_apurado: 7_000, total_compensado: 1_500, saldo_restante: 5_500 });
    const [judicial] = resumirFinanceiroPorCliente(["a"], comps, CREDITOS, TESES, PROCESSOS, ["PIS_COFINS_JUD"]);
    expect(judicial).toMatchObject({ credito_apurado: 4_000, total_compensado: 1_000, saldo_restante: 3_000 });
    // Os lançamentos de Reporto / judicial continuam fora do Total Compensado padrão.
    const [padrao] = resumirFinanceiroPorCliente(["a"], comps, CREDITOS, TESES, PROCESSOS);
    expect(padrao).toMatchObject({ credito_apurado: 1_000, total_compensado: 300 });
  });
});

describe("AGF 15/10 · população do recorte por tese no painel", () => {
  it("Reporto marcado sozinho traz toda empresa com Reporto, mesmo Total Compensados, sem recorte de período", async () => {
    const { makeRecorteGerencial } = await import("@/lib/recorte-gerencial");
    const processos = [
      { id: "p1", cliente_id: "comp", tese: "INSUMOS", categoria: "compensacao", criado_em: "2026-01-01", status_contrato: "assinado" },
      { id: "p2", cliente_id: "comp-rep", tese: "INSUMOS", categoria: "compensacao", criado_em: "2026-01-01", status_contrato: "assinado" },
      { id: "p3", cliente_id: "comp-rep", tese: "REPORTO", categoria: "reporto", criado_em: "2026-01-01", status_contrato: "assinado" },
      { id: "p4", cliente_id: "so-rep", tese: "REPORTO", categoria: "reporto", criado_em: "2026-01-01", status_contrato: "assinado" },
    ];
    const recorte = makeRecorteGerencial({
      clienteIds: ["comp", "comp-rep", "so-rep"],
      statusMap: new Map([["comp", "compensando"], ["comp-rep", "compensando"], ["so-rep", "reporto"]]),
      ramosMap: new Map(),
      tipoTese: [],
      periodo: { mode: "month", month: "2026-09" },
      processos,
      creditos: [],
      teses: [],
      comps: [{ cliente_id: "comp", mes_referencia: "2026-09-01", valor_compensado: 100, processo_tese_id: "p1" }],
    });
    expect([...recorte.recortePara("todas", new Set(["reporto"]))].sort()).toEqual(["comp-rep", "so-rep"]);
    // Total Compensados segue o período: só quem movimentou em set/2026.
    expect([...recorte.recortePara("todas", new Set(["compensando"]))]).toEqual(["comp"]);
    // Junto: união dos dois lados.
    expect([...recorte.recortePara("todas", new Set(["compensando", "reporto"]))].sort()).toEqual(["comp", "comp-rep", "so-rep"]);
    expect(recorte.contagens("todas", new Set(["reporto"])).statusCounts).toMatchObject({ reporto: 2, compensando: 1 });
  });
});

describe("AGF 14/10 · rodapé do Mapa com todas as teses", () => {
  const teses = [
    { id: "t-ins", codigo: "INSUMOS", label: "Insumos" },
    { id: "t-sub", codigo: "SUBVENCAO", label: "Subvenção" },
    { id: "t-st", codigo: "ICMS_ST", label: "ICMS-ST" },
    { id: "t-jud", codigo: "PIS_COFINS_JUD", label: "Judicial" },
    { id: "t-rep", codigo: "REPORTO", label: "Reporto" },
  ];
  const p = (id: string, tese: string, categoria = "compensacao") => ({ id, tese, categoria, valor_credito: 0 });
  const processos = [p("p-sub", "SUBVENCAO"), p("p-ins", "INSUMOS"), p("p-st", "ICMS_ST"), p("p-jud", "PIS_COFINS_JUD", "recuperacao_judicial"), p("p-rep", "REPORTO", "reporto")];
  const creditos = [
    { tese_id: "t-sub", valor_apurado_inicial: 1_000, incluir_no_calculo: true },
    { tese_id: "t-ins", valor_apurado_inicial: 500, incluir_no_calculo: true },
    { tese_id: "t-st", valor_apurado_inicial: 200, incluir_no_calculo: true },
    { tese_id: "t-jud", valor_apurado_inicial: 9_000, incluir_no_calculo: false },
    { tese_id: "t-rep", valor_apurado_inicial: 7_000, incluir_no_calculo: false },
  ];
  const c = (id: string, processo: string, valor: number, tributo = "PIS") => ({
    id, cliente_id: "a", mes_referencia: "2026-09-01", valor_compensado: valor, processo_tese_id: processo, tributo,
  });
  const comps = [c("1", "p-sub", 400, "IRPJ"), c("2", "p-ins", 500), c("3", "p-st", 50), c("4", "p-jud", 3_000)];

  it("lista as outras teses ativas, a esgotada como zerada com o valor utilizado", async () => {
    const { buildMapaExecutivo } = await import("@/lib/mapa-executivo");
    const mapa = buildMapaExecutivo({ creditos, comps, processos, teses, codigo: "SUBVENCAO", mes: "2026-09" });
    expect(mapa.carteira.map((r) => [r.codigo, r.saldo, r.zerado, r.atual])).toEqual([
      ["SUBVENCAO", 600, false, true],
      ["ICMS_ST", 150, false, false],
      ["INSUMOS", 0, true, false],
    ]);
    expect(mapa.carteira.find((r) => r.codigo === "INSUMOS")?.utilizado).toBe(500);
    // Via judicial e Reporto nunca entram na soma do mapa.
    expect(mapa.carteira.some((r) => r.codigo === "PIS_COFINS_JUD" || r.codigo === "REPORTO")).toBe(false);
    expect(mapa.saldoTotalDisponivel).toBe(750);
  });
});
