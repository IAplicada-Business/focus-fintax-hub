import { describe, expect, it } from "vitest";
import {
  ORDEM_TESES,
  buildLinhasMapa,
  calcularTotais,
  type LinhaMapa,
  type MapaRawInput,
} from "@/lib/mapa-creditos";

const clienteId = "11111111-1111-1111-1111-111111111111";

/**
 * Testes de caracterização: travam o comportamento que MapaCreditos.tsx já tinha
 * antes da extração. Se um número aqui divergir do que /clientes/:id/mapa-creditos
 * mostra, o bug é da extração — não do teste.
 */
function linha(over: Partial<LinhaMapa> & { tese_codigo: string }): LinhaMapa {
  return {
    cliente_id: clienteId,
    tese_id: `id-${over.tese_codigo}`,
    tese_label: over.tese_codigo,
    visivel_cliente: true,
    valor_apurado_inicial: 0,
    total_compensado: 0,
    saldo_final: 0,
    ...over,
  };
}

const vazio: Omit<MapaRawInput, "mapa"> = { compensacoes: [], processos: [], creditos: [] };

describe("buildLinhasMapa", () => {
  it("retorna vazio quando não há linhas na view", () => {
    expect(buildLinhasMapa({ mapa: [], ...vazio })).toEqual([]);
  });

  it("ordena pela ordem canônica da planilha SISTEMA", () => {
    const linhas = buildLinhasMapa({
      mapa: [linha({ tese_codigo: "PREVIDENCIARIO" }), linha({ tese_codigo: "INSUMOS" })],
      ...vazio,
    });
    expect(linhas.map((l) => l.tese_codigo)).toEqual(["INSUMOS", "PREVIDENCIARIO"]);
    expect(ORDEM_TESES.INSUMOS).toBeLessThan(ORDEM_TESES.PREVIDENCIARIO);
  });

  it("joga tese desconhecida para o fim (ordem 99)", () => {
    const linhas = buildLinhasMapa({
      mapa: [linha({ tese_codigo: "TESE_NOVA" }), linha({ tese_codigo: "REPORTO" })],
      ...vazio,
    });
    expect(linhas.map((l) => l.tese_codigo)).toEqual(["REPORTO", "TESE_NOVA"]);
  });

  it("zera o compensado de REPORTO e devolve o apurado como saldo", () => {
    const [r] = buildLinhasMapa({
      mapa: [
        linha({
          tese_codigo: "REPORTO",
          valor_apurado_inicial: 5000,
          total_compensado: 1234,
          saldo_final: 0,
        }),
      ],
      ...vazio,
    });
    expect(r.total_compensado).toBe(0);
    expect(r.saldo_final).toBe(5000);
    expect(r.status_utilizacao).toBe("a_utilizar");
  });

  it("usa valor_compensado_manual quando ele é o maior dos três", () => {
    const [r] = buildLinhasMapa({
      mapa: [linha({ tese_codigo: "INSUMOS", valor_apurado_inicial: 1000 })],
      compensacoes: [],
      processos: [],
      creditos: [{ tese_id: "id-INSUMOS", valor_compensado_manual: 300 }],
    });
    expect(r.total_compensado).toBe(300);
    expect(r.saldo_final).toBe(700);
    expect(r.status_utilizacao).toBe("em_uso");
  });

  it("mantém total_compensado da view quando ele é maior que o manual", () => {
    const [r] = buildLinhasMapa({
      mapa: [
        linha({ tese_codigo: "INSUMOS", valor_apurado_inicial: 1000, total_compensado: 800 }),
      ],
      compensacoes: [],
      processos: [],
      creditos: [{ tese_id: "id-INSUMOS", valor_compensado_manual: 300 }],
    });
    expect(r.total_compensado).toBe(800);
    expect(r.saldo_final).toBe(200);
  });

  it("ignora valor_compensado_manual nulo", () => {
    const [r] = buildLinhasMapa({
      mapa: [linha({ tese_codigo: "INSUMOS", valor_apurado_inicial: 1000 })],
      compensacoes: [],
      processos: [],
      creditos: [{ tese_id: "id-INSUMOS", valor_compensado_manual: null }],
    });
    expect(r.total_compensado).toBe(0);
    expect(r.status_utilizacao).toBe("a_utilizar");
  });

  it("marca como utilizado quando o compensado cobre o apurado", () => {
    const [r] = buildLinhasMapa({
      mapa: [linha({ tese_codigo: "SUBVENCAO", valor_apurado_inicial: 1000 })],
      compensacoes: [],
      processos: [],
      creditos: [{ tese_id: "id-SUBVENCAO", valor_compensado_manual: 1000 }],
    });
    expect(r.status_utilizacao).toBe("utilizado");
    expect(r.saldo_final).toBe(0);
  });
});

describe("calcularTotais", () => {
  it("soma zero quando não há linhas", () => {
    expect(calcularTotais([])).toEqual({ apurado: 0, compensado: 0, saldo: 0 });
  });

  it("por default conta só INSUMOS e SUBVENCAO", () => {
    const t = calcularTotais([
      linha({ tese_codigo: "INSUMOS", valor_apurado_inicial: 1000, total_compensado: 400, saldo_final: 600 }),
      linha({ tese_codigo: "SUBVENCAO", valor_apurado_inicial: 500, total_compensado: 100, saldo_final: 400 }),
      linha({ tese_codigo: "PREVIDENCIARIO", valor_apurado_inicial: 9000, total_compensado: 9000, saldo_final: 0 }),
    ]);
    expect(t).toEqual({ apurado: 1500, compensado: 500, saldo: 1000 });
  });

  it("respeita incluir_no_calculo explícito, nos dois sentidos", () => {
    const t = calcularTotais([
      linha({ tese_codigo: "INSUMOS", valor_apurado_inicial: 1000, incluir_no_calculo: false }),
      linha({
        tese_codigo: "PREVIDENCIARIO",
        valor_apurado_inicial: 700,
        total_compensado: 200,
        saldo_final: 500,
        incluir_no_calculo: true,
      }),
    ]);
    expect(t).toEqual({ apurado: 700, compensado: 200, saldo: 500 });
  });
});
