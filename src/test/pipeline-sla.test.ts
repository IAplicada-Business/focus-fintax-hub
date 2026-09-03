import { describe, it, expect } from "vitest";
import {
  PIPELINE_SLA_DIAS_DEFAULT,
  defaultPipelineSlaConfig,
  diasDeAtraso,
  diasNaEtapaLead,
  filtrarFilaSla,
  isFiltroFilaSla,
  normalizarEtapaFunil,
  resumirSlaFunil,
  serieGraficoSla,
} from "@/lib/pipeline-sla";

const AGORA = new Date("2026-09-03T12:00:00Z").getTime();
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

describe("normalizarEtapaFunil", () => {
  it("unifica valor legado e trata vazio como novo", () => {
    expect(normalizarEtapaFunil("levantamento_teses")).toBe("em_negociacao");
    expect(normalizarEtapaFunil("")).toBe("novo");
    expect(normalizarEtapaFunil(null)).toBe("novo");
    expect(normalizarEtapaFunil("contrato_emitido")).toBe("contrato_emitido");
  });

  it("fora do funil em andamento devolve null", () => {
    expect(normalizarEtapaFunil("perdido")).toBeNull();
    expect(normalizarEtapaFunil("nao_vai_fazer")).toBeNull();
    expect(normalizarEtapaFunil("cliente_ativo")).toBeNull();
  });
});

describe("diasNaEtapaLead", () => {
  it("usa a data de entrada na etapa e cai na criação quando falta", () => {
    expect(diasNaEtapaLead({ id: "1", status_funil_atualizado_em: diasAtras(4), criado_em: diasAtras(30) }, AGORA)).toBe(4);
    expect(diasNaEtapaLead({ id: "2", status_funil_atualizado_em: null, criado_em: diasAtras(30) }, AGORA)).toBe(30);
    expect(diasNaEtapaLead({ id: "3" }, AGORA)).toBe(0);
  });
});

describe("resumirSlaFunil", () => {
  const config = defaultPipelineSlaConfig();
  const leads = [
    { id: "a", empresa: "A", status_funil: "novo", status_funil_atualizado_em: diasAtras(10), potencial: 100 }, // meta 3 → -7
    { id: "b", empresa: "B", status_funil: "novo", status_funil_atualizado_em: diasAtras(1), potencial: 50 },
    { id: "c", empresa: "C", status_funil: "levantamento_teses", status_funil_atualizado_em: diasAtras(12) }, // em_negociacao meta 10 → -2
    { id: "d", empresa: "D", status_funil: "contrato_emitido", status_funil_atualizado_em: diasAtras(3) }, // vence hoje
    { id: "e", empresa: "E", status_funil: "perdido", status_funil_atualizado_em: diasAtras(90) }, // fora
  ];

  it("defaults batem com a regra antiga de 3 dias em Contrato Emitido", () => {
    expect(PIPELINE_SLA_DIAS_DEFAULT.contrato_emitido).toBe(3);
  });

  it("resume por etapa, ignora perdidos e ordena atrasados do pior pro menos pior", () => {
    const r = resumirSlaFunil(leads, config, AGORA);
    expect(r.linhas).toHaveLength(4);
    const novo = r.etapas.find((e) => e.etapa === "novo")!;
    expect(novo).toMatchObject({ leads: 2, atrasados: 1, atrasoAcumulado: 7, potencial: 150 });
    expect(novo.diasMedios).toBe(5.5);
    const neg = r.etapas.find((e) => e.etapa === "em_negociacao")!;
    expect(neg).toMatchObject({ leads: 1, atrasados: 1, atrasoAcumulado: 2 });
    expect(r.atrasados.map((l) => l.lead.id)).toEqual(["a", "c"]);
    expect(r.totalAtrasados).toBe(2);
    expect(r.totalNoPrazo).toBe(2);
    expect(r.atrasoAcumulado).toBe(9);
    const d = r.linhas.find((l) => l.lead.id === "d")!;
    expect(d.sla.status).toBe("atencao");
  });

  it("meta vazia = etapa sem SLA (nunca atrasa)", () => {
    const cfg = config.map((c) => (c.etapa === "novo" ? { ...c, sla_dias: null } : c));
    const r = resumirSlaFunil(leads, cfg, AGORA);
    expect(r.etapas.find((e) => e.etapa === "novo")!.atrasados).toBe(0);
    expect(r.linhas.find((l) => l.lead.id === "a")!.sla.status).toBe("sem_sla");
  });
});

describe("serieGraficoSla", () => {
  const config = defaultPipelineSlaConfig();
  const leads = [
    { id: "a", empresa: "A", status_funil: "novo", status_funil_atualizado_em: diasAtras(10) },
    { id: "b", empresa: "B", status_funil: "novo", status_funil_atualizado_em: diasAtras(1) },
    { id: "c", empresa: "C", status_funil: "qualificado", status_funil_atualizado_em: diasAtras(2) },
  ];

  it("gera um ponto por etapa com média, máximo e meta, marcando média acima da meta", () => {
    const serie = serieGraficoSla(resumirSlaFunil(leads, config, AGORA));
    expect(serie.map((p) => p.etapa)).toEqual(["novo", "qualificado", "em_negociacao", "em_apresentacao", "contrato_emitido"]);
    expect(serie[0]).toMatchObject({ labelCurto: "Novo", media: 5.5, maximo: 10, meta: 3, leads: 2, atrasados: 1, atrasoAcumulado: 7, acimaDaMeta: true });
    expect(serie[1]).toMatchObject({ media: 2, maximo: 2, meta: 5, leads: 1, atrasados: 0, acimaDaMeta: false });
    // etapa vazia: zera as barras mas mantém a meta pra linha
    expect(serie[2]).toMatchObject({ labelCurto: "Negociação", media: 0, maximo: 0, meta: 10, leads: 0, acimaDaMeta: false });
  });

  it("etapa sem meta nunca fica acima da meta", () => {
    const semMeta = config.map((c) => (c.etapa === "novo" ? { ...c, sla_dias: null } : c));
    const serie = serieGraficoSla(resumirSlaFunil(leads, semMeta, AGORA));
    expect(serie[0]).toMatchObject({ meta: null, acimaDaMeta: false, atrasados: 0 });
  });
});

describe("filtrarFilaSla", () => {
  const config = defaultPipelineSlaConfig();
  const leads = [
    { id: "a", empresa: "Alfa Supermercados", status_funil: "novo", status_funil_atualizado_em: diasAtras(10) }, // +7
    { id: "b", empresa: "Beta Pet", status_funil: "novo", status_funil_atualizado_em: diasAtras(1) },
    { id: "c", empresa: "Gama Farma", status_funil: "levantamento_teses", status_funil_atualizado_em: diasAtras(12) }, // +2
    { id: "d", empresa: "Delta", status_funil: "em_negociacao", status_funil_atualizado_em: diasAtras(9) }, // no prazo, 9d
    { id: "e", empresa: "Épsilon", status_funil: "contrato_emitido", status_funil_atualizado_em: diasAtras(20) }, // +17
  ];
  const resumo = resumirSlaFunil(leads, config, AGORA);

  it("atrasados: só estourados, do maior atraso pro menor", () => {
    expect(filtrarFilaSla(resumo, "atrasados").map((l) => l.lead.id)).toEqual(["e", "a", "c"]);
  });

  it("todos: atrasados primeiro e depois por dias na etapa", () => {
    expect(filtrarFilaSla(resumo, "todos").map((l) => l.lead.id)).toEqual(["e", "a", "c", "d", "b"]);
  });

  it("por etapa inclui no prazo e atrasados da etapa", () => {
    expect(filtrarFilaSla(resumo, "em_negociacao").map((l) => l.lead.id)).toEqual(["c", "d"]);
    expect(filtrarFilaSla(resumo, "novo").map((l) => l.lead.id)).toEqual(["a", "b"]);
  });

  it("busca por empresa ignora caixa e combina com o filtro", () => {
    expect(filtrarFilaSla(resumo, "todos", "  gama ").map((l) => l.lead.id)).toEqual(["c"]);
    expect(filtrarFilaSla(resumo, "atrasados", "beta")).toHaveLength(0);
  });

  it("diasDeAtraso zera fora do estouro", () => {
    const porId = new Map(resumo.linhas.map((l) => [l.lead.id, l]));
    expect(diasDeAtraso(porId.get("e")!)).toBe(17);
    expect(diasDeAtraso(porId.get("d")!)).toBe(0);
    expect(diasDeAtraso(porId.get("b")!)).toBe(0);
  });

  it("isFiltroFilaSla aceita etapas e os dois atalhos", () => {
    expect(isFiltroFilaSla("atrasados")).toBe(true);
    expect(isFiltroFilaSla("todos")).toBe(true);
    expect(isFiltroFilaSla("contrato_emitido")).toBe(true);
    expect(isFiltroFilaSla("perdido")).toBe(false);
    expect(isFiltroFilaSla(null)).toBe(false);
  });
});
