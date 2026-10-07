import { describe, expect, it } from "vitest";
import {
  isProcessoForaDoCalculo,
  isProcessoIncluirNoCalculo,
  isProcessoJudicialForaCalculo,
  isReportoProcesso,
  sumCompensadoCanonical,
} from "@/lib/clientes-constants";
import { calcularSaldosCliente } from "@/lib/saldos-cliente";
import { resumirFinanceiroPorCliente } from "@/lib/operacional-analytics";
import { totalProcessosACompensar } from "@/lib/client-operation";

const TESES = [
  { id: "t-insumos", codigo: "INSUMOS", label: "Insumos" },
  { id: "t-jud", codigo: "PIS_COFINS_JUD", label: "PIS/COFINS da Base — Via Judicial" },
  { id: "t-reporto", codigo: "REPORTO", label: "Reporto" },
];

const JUDICIAL = {
  id: "p-jud",
  cliente_id: "a",
  tese: "PIS_COFINS_JUD",
  nome_exibicao: "PIS/COFINS da Base — Via Judicial",
  categoria: "recuperacao_judicial",
  tipo_recuperacao: "recuperacao_judicial",
  valor_credito: 10_000,
  status_contrato: "assinado",
  status_processo: "a_compensar",
  criado_em: "2026-01-01",
};

const INSUMOS = {
  id: "p-insumos",
  cliente_id: "a",
  tese: "INSUMOS",
  nome_exibicao: "Insumos",
  categoria: "compensacao",
  tipo_recuperacao: "compensacao",
  valor_credito: 1_000,
  status_contrato: "assinado",
  status_processo: "a_compensar",
  criado_em: "2026-01-01",
};

const CREDITOS = [
  { cliente_id: "a", tese_id: "t-insumos", valor_apurado_inicial: 1_000, incluir_no_calculo: true },
  { cliente_id: "a", tese_id: "t-jud", valor_apurado_inicial: 10_000, incluir_no_calculo: false },
];

const COMPS = [
  { cliente_id: "a", mes_referencia: "2026-08-01", valor_compensado: 100, honorario_valor: 10, tese_origem_id: "t-insumos", processo_tese_id: "p-insumos", tributo_enum: "outros" },
  { cliente_id: "a", mes_referencia: "2026-09-01", valor_compensado: 5_000, honorario_valor: 500, tese_origem_id: "t-jud", processo_tese_id: "p-jud", tributo_enum: "outros" },
];

describe("tratamento financeiro Recuperação judicial", () => {
  it("é fora do cálculo sem virar Reporto", () => {
    expect(isProcessoJudicialForaCalculo(JUDICIAL)).toBe(true);
    expect(isProcessoForaDoCalculo(JUDICIAL)).toBe(true);
    expect(isReportoProcesso(JUDICIAL)).toBe(false);
    expect(isProcessoIncluirNoCalculo(JUDICIAL)).toBe(false);
    expect(isProcessoIncluirNoCalculo(INSUMOS)).toBe(true);
  });

  it("compensações do processo judicial não entram no Total Compensado", () => {
    const foraIds = new Set([JUDICIAL, INSUMOS].filter(isProcessoForaDoCalculo).map((p) => p.id));
    expect(sumCompensadoCanonical(COMPS, { reportoProcessoIds: foraIds })).toBe(100);
    // Com a tese embutida na linha, a exclusão vale mesmo sem o conjunto de ids.
    expect(
      sumCompensadoCanonical([
        { ...COMPS[1], processos_teses: { tese: JUDICIAL.tese, categoria: JUDICIAL.categoria } },
      ]),
    ).toBe(0);
  });

  it("ficha: saldo do cliente ignora crédito e compensação da tese judicial", () => {
    const saldos = calcularSaldosCliente({
      creditos: CREDITOS,
      comps: COMPS,
      processos: [JUDICIAL, INSUMOS],
      teses: TESES,
    });
    expect(saldos.apuradoTotal).toBe(1_000);
    expect(saldos.compensadoTotal).toBe(100);
    expect(saldos.saldoTotal).toBe(900);
  });

  it("dashboard chega ao mesmo número da ficha", () => {
    const [total] = resumirFinanceiroPorCliente(["a"], COMPS, CREDITOS, TESES, [JUDICIAL, INSUMOS]);
    expect(total).toMatchObject({ credito_apurado: 1_000, total_compensado: 100, saldo_restante: 900 });
  });

  it("valor a compensar da aba de teses também ignora a judicial", () => {
    expect(totalProcessosACompensar([JUDICIAL, INSUMOS])).toBe(1_000);
  });
});
