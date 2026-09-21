import { describe, expect, it } from "vitest";
import { countByStatus, normalizarStatusCompensacao } from "@/lib/gerencial-filters";
import { movimentosEsteira, resumoEsteira, serieMensal } from "@/lib/operacional-analytics";
import { currentMonthKey } from "@/lib/month-key";

const ids = Array.from({ length: 94 }, (_, index) => `cliente-${index + 1}`);
const clientes = ids.map((id, index) => ({
  id,
  estagio_esteira: "triagem",
  compensando_fintax: index < 23,
}));
const statusRows = ids.map((cliente_id, index) => ({
  cliente_id,
  status_principal: index < 40 ? "reporto" : index < 65 ? "prevista" : "sem_operacao",
  tem_compensacao_mes_corrente: false,
  tem_reporto: index < 40,
  compensando_fintax: index < 23,
}));

describe("regressão com o formato observado no banco ao vivo", () => {
  it("mantém setembro em BRT quando UTC já virou outubro", () => {
    const viradaUtc = Date.parse("2026-10-01T02:30:00.000Z");
    expect(currentMonthKey(viradaUtc)).toBe("2026-09");

    const serie = serieMensal(
      [{
        cliente_id: ids[0],
        mes_referencia: "2026-08-01",
        valor_compensado: 100,
      }],
      2,
      viradaUtc,
    );
    expect(serie.map((ponto) => [ponto.mes, ponto.compensado])).toEqual([
      ["2026-08", 100],
      ["2026-09", 0],
    ]);
  });

  it("preserva os 94 clientes em triagem e reclassifica legado como qualidade de dados", () => {
    const statusMap = new Map(
      statusRows.map((row) => [row.cliente_id, normalizarStatusCompensacao(row)]),
    );
    const contagem = countByStatus(ids, statusMap);
    const etapas = resumoEsteira(clientes, [{
      estagio: "triagem",
      label: "Triagem",
      sla_dias: 3,
      ordem: 1,
      ativo: true,
    }]);

    expect(clientes.filter((cliente) => cliente.compensando_fintax)).toHaveLength(23);
    expect(etapas).toHaveLength(1);
    expect(etapas[0].clientes).toBe(94);
    expect(contagem).toEqual({
      compensando: 0,
      prevista: 0,
      reporto: 40,
      encerrado: 0,
      sem_operacao: 54,
    });
  });

  it("conta no pulso somente movimentos de origem sistema", () => {
    const desde = "2026-09-14T00:00:00.000Z";
    const movimentos = movimentosEsteira([
      {
        cliente_id: ids[0],
        estagio: "triagem",
        entrou_em: "2026-09-15T10:00:00.000Z",
        saiu_em: null,
        origem: "sistema",
      },
      {
        cliente_id: ids[1],
        estagio: "triagem",
        entrou_em: "2026-09-15T10:00:00.000Z",
        saiu_em: null,
        origem: "importacao",
      },
      {
        cliente_id: ids[2],
        estagio: "triagem",
        entrou_em: "2026-09-15T10:00:00.000Z",
        saiu_em: null,
        origem: "reset_sla",
      },
    ], desde);

    expect(movimentos).toMatchObject({ total: 1, clientes: 1, concluidos: 0 });
  });
});
