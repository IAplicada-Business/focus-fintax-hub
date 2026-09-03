import { describe, it, expect } from "vitest";
import {
  PIPELINE_SLA_DIAS_DEFAULT,
  defaultPipelineSlaConfig,
  diasNaEtapaLead,
  normalizarEtapaFunil,
  resumirSlaFunil,
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
