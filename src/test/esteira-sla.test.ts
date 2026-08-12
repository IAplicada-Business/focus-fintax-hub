import { describe, it, expect } from "vitest";
import {
  ESTEIRA_SLA_DIAS,
  ESTEIRA_STAGES,
  diasAcimaDoSla,
  isClienteAtrasadoSla,
  isEstagioEsteira,
  projetarAtrasoPorEtapa,
  slaDiasDaEtapa,
  visibleEsteiraStages,
} from "@/lib/esteira-constants";

describe("ESTEIRA_SLA_DIAS (épica Painel SLA)", () => {
  it("bate com as metas do backlog para as 4 etapas iniciais", () => {
    expect(ESTEIRA_SLA_DIAS.triagem).toBe(1);
    expect(ESTEIRA_SLA_DIAS.levantamento).toBe(3);
    expect(ESTEIRA_SLA_DIAS.emitir_contrato).toBe(1);
    expect(ESTEIRA_SLA_DIAS.receber_assinado).toBe(3);
  });

  it("define default operacional pra Em Compensação, Financeiro e sem meta pra Concluído", () => {
    expect(ESTEIRA_SLA_DIAS.em_compensacao).toBe(30);
    expect(ESTEIRA_SLA_DIAS.encaminhar_financeiro).toBe(5);
    expect(ESTEIRA_SLA_DIAS.concluido).toBeNull();
  });

  it("tem uma entrada por estágio da esteira", () => {
    for (const s of ESTEIRA_STAGES) {
      expect(s.value in ESTEIRA_SLA_DIAS).toBe(true);
    }
  });
});

describe("isEstagioEsteira / slaDiasDaEtapa", () => {
  it("aceita só valores do enum", () => {
    expect(isEstagioEsteira("triagem")).toBe(true);
    expect(isEstagioEsteira("foo")).toBe(false);
  });

  it("devolve null pra estágio desconhecido", () => {
    expect(slaDiasDaEtapa("inexistente")).toBeNull();
    expect(slaDiasDaEtapa("concluido")).toBeNull();
    expect(slaDiasDaEtapa("triagem")).toBe(1);
  });
});

describe("isClienteAtrasadoSla", () => {
  it("Triagem: >1d é atraso; =1d ainda no prazo", () => {
    expect(isClienteAtrasadoSla("triagem", 0)).toBe(false);
    expect(isClienteAtrasadoSla("triagem", 1)).toBe(false);
    expect(isClienteAtrasadoSla("triagem", 2)).toBe(true);
  });

  it("Levantamento: >3d é atraso", () => {
    expect(isClienteAtrasadoSla("levantamento", 3)).toBe(false);
    expect(isClienteAtrasadoSla("levantamento", 4)).toBe(true);
  });

  it("Emitir Contrato: >1d é atraso", () => {
    expect(isClienteAtrasadoSla("emitir_contrato", 1)).toBe(false);
    expect(isClienteAtrasadoSla("emitir_contrato", 2)).toBe(true);
  });

  it("Receber Assinado: >3d é atraso", () => {
    expect(isClienteAtrasadoSla("receber_assinado", 3)).toBe(false);
    expect(isClienteAtrasadoSla("receber_assinado", 4)).toBe(true);
  });

  it("Em Compensação: >30d é atraso", () => {
    expect(isClienteAtrasadoSla("em_compensacao", 30)).toBe(false);
    expect(isClienteAtrasadoSla("em_compensacao", 31)).toBe(true);
  });

  it("Encaminhar Financeiro: >5d é atraso", () => {
    expect(isClienteAtrasadoSla("encaminhar_financeiro", 5)).toBe(false);
    expect(isClienteAtrasadoSla("encaminhar_financeiro", 6)).toBe(true);
  });

  it("aceita override de SLA (config editável)", () => {
    expect(isClienteAtrasadoSla("triagem", 2)).toBe(true);
    expect(isClienteAtrasadoSla("triagem", 2, { triagem: 5 })).toBe(false);
    expect(slaDiasDaEtapa("encaminhar_financeiro")).toBe(5);
    expect(slaDiasDaEtapa("encaminhar_financeiro", { encaminhar_financeiro: 10 })).toBe(10);
  });

  it("Concluído nunca atrasa", () => {
    expect(isClienteAtrasadoSla("concluido", 999)).toBe(false);
  });

  it("estágio inválido não atrasa", () => {
    expect(isClienteAtrasadoSla("xyz", 100)).toBe(false);
  });
});

describe("diasAcimaDoSla", () => {
  it("retorna 0 no prazo e a diferença quando atrasa", () => {
    expect(diasAcimaDoSla("triagem", 1)).toBe(0);
    expect(diasAcimaDoSla("triagem", 5)).toBe(4);
    expect(diasAcimaDoSla("concluido", 100)).toBe(0);
  });
});

describe("projetarAtrasoPorEtapa", () => {
  it("soma o atraso acumulado por etapa", () => {
    const proj = projetarAtrasoPorEtapa([
      { estagio_esteira: "triagem", dias_na_etapa: 5 }, // +4
      { estagio_esteira: "triagem", dias_na_etapa: 1 }, // 0
      { estagio_esteira: "levantamento", dias_na_etapa: 10 }, // +7
      { estagio_esteira: "concluido", dias_na_etapa: 90 }, // 0
    ]);

    const triagem = proj.find((p) => p.estagio === "triagem")!;
    expect(triagem.clientes).toBe(2);
    expect(triagem.atrasados).toBe(1);
    expect(triagem.atrasoAcumuladoDias).toBe(4);

    const lev = proj.find((p) => p.estagio === "levantamento")!;
    expect(lev.atrasados).toBe(1);
    expect(lev.atrasoAcumuladoDias).toBe(7);

    const conc = proj.find((p) => p.estagio === "concluido")!;
    expect(conc.atrasados).toBe(0);
    expect(conc.atrasoAcumuladoDias).toBe(0);
  });

  it("devolve uma linha por estágio mesmo sem clientes", () => {
    const proj = projetarAtrasoPorEtapa([]);
    expect(proj).toHaveLength(ESTEIRA_STAGES.length);
    expect(proj.every((p) => p.clientes === 0 && p.atrasados === 0)).toBe(true);
  });
});

describe("visibleEsteiraStages (estágios configuráveis)", () => {
  const config = [
    { estagio: "triagem", label: "Triagem", ativo: true },
    { estagio: "levantamento", label: "Levantamento", ativo: false },
    { estagio: "concluido", label: "Concluído", ativo: true },
  ];

  it("mostra etapa ativa e some com a inativa sem cliente", () => {
    const stages = visibleEsteiraStages(config, []);
    expect(stages.map((s) => s.value)).toEqual(["triagem", "concluido"]);
  });

  it("nunca esconde cliente: etapa inativa com cliente alocado continua visível", () => {
    const stages = visibleEsteiraStages(config, ["levantamento"]);
    expect(stages.map((s) => s.value)).toEqual(["triagem", "levantamento", "concluido"]);
  });

  it("preserva a ordem recebida (quem chama já ordena por `ordem`)", () => {
    const reordered = [config[2], config[0]];
    const stages = visibleEsteiraStages(reordered, []);
    expect(stages.map((s) => s.value)).toEqual(["concluido", "triagem"]);
  });
});
