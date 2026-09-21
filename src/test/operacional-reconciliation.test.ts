import { describe, expect, it } from "vitest";
import {
  compensacoesCanonicas,
  resumoEsteira,
  resumirFinanceiroPorCliente,
} from "@/lib/operacional-analytics";
import { filtrarIdsRecorteGerencial, normalizarStatusCompensacao } from "@/lib/gerencial-filters";

const TESES = [
  { id: "t-insumos", codigo: "INSUMOS", label: "Insumos" },
  { id: "t-subvencao", codigo: "SUBVENCAO", label: "Subvenção" },
  { id: "t-reporto", codigo: "REPORTO", label: "Reporto" },
];

const PROCESSOS = [
  {
    id: "p-insumos",
    cliente_id: "a",
    tese: "INSUMOS",
    nome_exibicao: "Insumos",
    criado_em: "2026-01-01",
    valor_credito: 1_000,
    status_contrato: "assinado",
    status_processo: "em_andamento",
    tipo_recuperacao: "compensacao",
  },
  {
    id: "p-reporto",
    cliente_id: "a",
    tese: "REPORTO",
    nome_exibicao: "Reporto",
    criado_em: "2026-01-01",
    valor_credito: 5_000,
    status_contrato: "assinado",
    status_processo: "em_andamento",
    tipo_recuperacao: "compensacao",
  },
  {
    id: "p-subvencao",
    cliente_id: "b",
    tese: "SUBVENCAO",
    nome_exibicao: "Subvenção",
    criado_em: "2026-01-01",
    valor_credito: 500,
    status_contrato: "assinado",
    status_processo: "em_andamento",
    tipo_recuperacao: "recuperacao_judicial",
  },
];

const COMPS = [
  {
    cliente_id: "a",
    mes_referencia: "2026-09-01",
    valor_compensado: 100,
    honorario_valor: 10,
    tese_origem_id: "t-insumos",
    processo_tese_id: "p-insumos",
    tributo_enum: "PIS",
  },
  {
    cliente_id: "a",
    mes_referencia: "2026-09-01",
    valor_compensado: 100,
    honorario_valor: 10,
    tese_origem_id: null,
    processo_tese_id: null,
    tributo_enum: "PIS",
  },
  {
    cliente_id: "a",
    mes_referencia: "2026-09-01",
    valor_compensado: 50,
    honorario_valor: 5,
    tese_origem_id: "t-reporto",
    processo_tese_id: "p-reporto",
    tributo_enum: "outros",
  },
  {
    cliente_id: "b",
    mes_referencia: "2026-09-01",
    valor_compensado: 300,
    honorario_valor: 30,
    tese_origem_id: null,
    processo_tese_id: "p-subvencao",
    tributo_enum: "IRPJ_CSLL_agregado",
  },
  {
    cliente_id: "inativo",
    mes_referencia: "2026-09-01",
    valor_compensado: 999,
    honorario_valor: 99,
    tese_origem_id: "t-insumos",
    processo_tese_id: null,
    tributo_enum: "PIS",
  },
];

describe("reconciliação financeira da Visão Operacional", () => {
  it("movimento no mês prevalece sobre REPORTO no status operacional", () => {
    expect(normalizarStatusCompensacao({
      cliente_id: "a",
      status_principal: "reporto",
      tem_reporto: true,
      tem_compensacao_mes_corrente: true,
    })).toBe("compensando");
  });

  it("movimento somente de REPORTO não vira compensando", () => {
    const canonicas = compensacoesCanonicas([COMPS[2]], TESES, PROCESSOS);
    expect(canonicas).toEqual([]);
    expect(normalizarStatusCompensacao({
      cliente_id: "a",
      status_principal: "reporto",
      tem_reporto: true,
      tem_compensacao_mes_corrente: canonicas.length > 0,
    })).toBe("reporto");
  });

  it("soma exatamente os valores canônicos das fichas no mesmo recorte", () => {
    const statusMap = new Map([
      ["a", "compensando" as const],
      ["b", "prevista" as const],
      ["inativo", "compensando" as const],
    ]);
    const ramosMap = new Map([
      ["a", { tem_ramo_compensacao: true }],
      ["b", { tem_ramo_judicial: true }],
      ["inativo", { tem_ramo_compensacao: true }],
    ]);
    const idsRecorte = filtrarIdsRecorteGerencial(
      ["a", "b"],
      new Set(["compensando" as const]),
      "administrativo",
      statusMap,
      ramosMap,
    );
    const totais = resumirFinanceiroPorCliente(
      idsRecorte,
      COMPS,
      [
        {
          cliente_id: "a",
          tese_id: "t-insumos",
          valor_apurado_inicial: 1_000,
          incluir_no_calculo: true,
        },
        {
          cliente_id: "a",
          tese_id: "t-reporto",
          valor_apurado_inicial: 5_000,
          incluir_no_calculo: true,
        },
      ],
      TESES,
      PROCESSOS,
    );

    expect([...idsRecorte]).toEqual(["a"]);
    expect(totais).toEqual([
      {
        cliente_id: "a",
        credito_apurado: 1_000,
        total_compensado: 100,
        saldo_restante: 900,
        honorarios: 10,
        sem_base_financeira: false,
      },
    ]);
    expect(compensacoesCanonicas(COMPS.filter((row) => idsRecorte.has(row.cliente_id)), TESES, PROCESSOS))
      .toHaveLength(1);
  });

  it("usa fallback de processo como a ficha e nunca inclui cliente inativo", () => {
    const totais = resumirFinanceiroPorCliente(
      ["a", "b"],
      COMPS,
      [
        {
          cliente_id: "a",
          tese_id: "t-insumos",
          valor_apurado_inicial: 1_000,
          incluir_no_calculo: true,
        },
      ],
      TESES,
      PROCESSOS,
    );

    expect(totais.reduce((sum, row) => sum + row.credito_apurado, 0)).toBe(1_500);
    expect(totais.reduce((sum, row) => sum + row.total_compensado, 0)).toBe(400);
    expect(totais.reduce((sum, row) => sum + row.saldo_restante, 0)).toBe(1_100);
    expect(totais.reduce((sum, row) => sum + row.honorarios, 0)).toBe(40);
    expect(totais.find((row) => row.cliente_id === "inativo")).toBeUndefined();
  });

  it("não deduplica lançamentos iguais de clientes diferentes", () => {
    const rows = compensacoesCanonicas(
      [
        COMPS[0],
        {
          ...COMPS[1],
          cliente_id: "b",
        },
      ],
      TESES,
      PROCESSOS,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.cliente_id).sort()).toEqual(["a", "b"]);
  });

  it("usa o snapshot manual quando o mapa do cliente o considera maior", () => {
    const [total] = resumirFinanceiroPorCliente(
      ["a"],
      COMPS,
      [{
        cliente_id: "a",
        tese_id: "t-insumos",
        valor_apurado_inicial: 1_000,
        valor_compensado_manual: 450,
        incluir_no_calculo: true,
      }],
      TESES,
      PROCESSOS,
    );

    expect(total).toMatchObject({
      credito_apurado: 1_000,
      total_compensado: 450,
      saldo_restante: 550,
    });
  });
});

describe("reconciliação da esteira", () => {
  it("a soma das etapas é sempre a população exibida em /esteira", () => {
    const clientes = [
      { id: "1", estagio_esteira: "triagem", dias_na_etapa: 1 },
      { id: "2", estagio_esteira: "concluido", dias_na_etapa: 10 },
      { id: "3", estagio_esteira: "legado_sem_config", dias_na_etapa: 20 },
      { id: "4", estagio_esteira: null, dias_na_etapa: 30 },
    ];
    const etapas = resumoEsteira(clientes, [
      { estagio: "triagem", label: "Triagem", sla_dias: 3, ordem: 1, ativo: true },
      { estagio: "concluido", label: "Concluído", sla_dias: null, ordem: 2, ativo: true },
    ]);

    expect(etapas.reduce((sum, etapa) => sum + etapa.clientes, 0)).toBe(clientes.length);
    expect(etapas.find((etapa) => etapa.estagio === "legado_sem_config")?.clientes).toBe(1);
    expect(etapas.find((etapa) => etapa.estagio === "__sem_etapa__")?.clientes).toBe(1);
    expect(etapas.find((etapa) => etapa.estagio === "concluido")?.atrasados).toBe(0);
  });
});
