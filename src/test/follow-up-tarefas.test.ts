import { describe, expect, it } from "vitest";
import { ACTIVE_STAGES, PIPELINE_STAGES, STAGE_COLORS } from "@/lib/pipeline-constants";
import { agruparPorEtapa } from "@/lib/pipeline-board";
import { ETAPAS_FUNIL_HANDOFF, funilEntraNaEsteira } from "@/lib/handoff-funil-esteira";
import { PROBABILIDADE_ETAPA, leadAtivo, pipelinePonderado } from "@/lib/comercial-analytics";
import { PIPELINE_SLA_DIAS_DEFAULT, normalizarEtapaFunil } from "@/lib/pipeline-sla";
import { canEditLead } from "@/lib/role-permissions";
import {
  agruparTarefas,
  combinarDataHora,
  contarAbertas,
  ehAnotacaoHistorico,
  formatarVencimento,
  ordenarTarefas,
  paraInputData,
  paraInputHora,
  prefillFollowUp,
  resumoTarefasPorLead,
  statusTarefa,
  tarefasParaLembrete,
  vencimentoDoPreset,
  type LeadTarefa,
} from "@/lib/lead-tarefas";

// Quarta, 15/10/2026 14:00 (hora local do runner).
const AGORA = new Date(2026, 9, 15, 14, 0, 0);
const em = (dia: number, hora = 9, min = 0) => new Date(2026, 9, dia, hora, min).toISOString();

function tarefa(p: Partial<LeadTarefa> & Pick<LeadTarefa, "id" | "vence_em">): LeadTarefa {
  return {
    lead_id: "L1",
    titulo: "Retomar contato",
    descricao: null,
    tipo: "follow_up",
    responsavel_id: "u1",
    concluida_em: null,
    criado_por: "u1",
    criado_em: null,
    ...p,
  };
}

describe("etapa Follow-up no funil", () => {
  it("fica entre Ganho e Perdido na ordem das colunas", () => {
    const ordem = PIPELINE_STAGES.map((s) => s.value);
    const i = ordem.indexOf("follow_up");
    expect(i).toBeGreaterThan(-1);
    expect(ordem[i - 1]).toBe("ganho");
    expect(ordem[i + 1]).toBe("perdido");
    expect(PIPELINE_STAGES[i].label).toBe("Follow-up");
    expect(STAGE_COLORS.follow_up).toBeTruthy();
  });

  it("é etapa aberta: ativa, com coluna própria no quadro e SLA configurável (30d)", () => {
    expect(ACTIVE_STAGES.some((s) => s.value === "follow_up")).toBe(true);
    expect(leadAtivo({ status_funil: "follow_up" })).toBe(true);
    const g = agruparPorEtapa([{ id: "a", status_funil: "follow_up" }]);
    expect(g.follow_up.map((l) => l.id)).toEqual(["a"]);
    expect(normalizarEtapaFunil("follow_up")).toBe("follow_up");
    expect(PIPELINE_SLA_DIAS_DEFAULT.follow_up).toBe(30);
  });

  it("não entra na esteira operacional", () => {
    expect(ETAPAS_FUNIL_HANDOFF).not.toContain("follow_up");
    expect(funilEntraNaEsteira("follow_up")).toBe(false);
  });

  it("probabilidade de fechamento baixa (5%) no pipeline ponderado", () => {
    expect(PROBABILIDADE_ETAPA.follow_up).toBe(0.05);
    const p = pipelinePonderado([{ id: "a", status_funil: "follow_up", potencial: 100_000 }]);
    expect(p.porEtapa).toEqual([{ etapa: "follow_up", leads: 1, potencial: 100_000, probabilidade: 0.05, ponderado: 5_000 }]);
  });

  it("comercial edita lead em Follow-up", () => {
    expect(canEditLead("comercial", "follow_up")).toBe(true);
    expect(canEditLead("comercial", "ganho")).toBe(false);
  });
});

describe("lead-tarefas: status, ordem e agrupamento", () => {
  it("classifica atrasada (inclusive mais cedo hoje), hoje, próxima e concluída", () => {
    expect(statusTarefa({ vence_em: em(14), concluida_em: null }, AGORA)).toBe("atrasada");
    expect(statusTarefa({ vence_em: em(15, 9), concluida_em: null }, AGORA)).toBe("atrasada");
    expect(statusTarefa({ vence_em: em(15, 17), concluida_em: null }, AGORA)).toBe("hoje");
    expect(statusTarefa({ vence_em: em(16), concluida_em: null }, AGORA)).toBe("proxima");
    expect(statusTarefa({ vence_em: em(10), concluida_em: em(11) }, AGORA)).toBe("concluida");
  });

  it("ordena abertas por vencimento e concluídas por último (mais recente primeiro)", () => {
    const lista = [
      tarefa({ id: "c1", vence_em: em(1), concluida_em: em(2) }),
      tarefa({ id: "a2", vence_em: em(20) }),
      tarefa({ id: "c2", vence_em: em(1), concluida_em: em(5) }),
      tarefa({ id: "a1", vence_em: em(12) }),
    ];
    expect(ordenarTarefas(lista).map((t) => t.id)).toEqual(["a1", "a2", "c2", "c1"]);
    expect(contarAbertas(lista)).toBe(2);
  });

  it("agrupa em Atrasadas / Hoje / Próximas / Concluídas", () => {
    const g = agruparTarefas(
      [
        tarefa({ id: "x", vence_em: em(13) }),
        tarefa({ id: "h", vence_em: em(15, 18) }),
        tarefa({ id: "p", vence_em: em(22) }),
        tarefa({ id: "c", vence_em: em(13), concluida_em: em(14) }),
      ],
      AGORA,
    );
    expect(g.atrasada.map((t) => t.id)).toEqual(["x"]);
    expect(g.hoje.map((t) => t.id)).toEqual(["h"]);
    expect(g.proxima.map((t) => t.id)).toEqual(["p"]);
    expect(g.concluida.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("lead-tarefas: datas", () => {
  it("atalhos caem às 9h: amanhã, +3, +7, +15, +30 dias", () => {
    expect(vencimentoDoPreset("amanha", AGORA)).toEqual(new Date(2026, 9, 16, 9, 0));
    expect(vencimentoDoPreset("3d", AGORA)).toEqual(new Date(2026, 9, 18, 9, 0));
    expect(vencimentoDoPreset("7d", AGORA)).toEqual(new Date(2026, 9, 22, 9, 0));
    expect(vencimentoDoPreset("15d", AGORA)).toEqual(new Date(2026, 9, 30, 9, 0));
    expect(vencimentoDoPreset("30d", AGORA)).toEqual(new Date(2026, 10, 14, 9, 0));
  });

  it("prefill do Follow-up: Retomar contato em 7 dias", () => {
    const p = prefillFollowUp(AGORA);
    expect(p.titulo).toBe("Retomar contato");
    expect(p.tipo).toBe("follow_up");
    expect(p.vence_em).toEqual(new Date(2026, 9, 22, 9, 0));
  });

  it("converte de/para os inputs de data e hora", () => {
    const d = new Date(2026, 0, 5, 7, 3);
    expect(paraInputData(d)).toBe("2026-01-05");
    expect(paraInputHora(d)).toBe("07:03");
    expect(combinarDataHora("2026-01-05", "07:03")).toEqual(d);
    expect(combinarDataHora("2026-01-05", "")).toEqual(new Date(2026, 0, 5, 9, 0));
    expect(combinarDataHora("2026-02-31", "10:00")).toBeNull();
    expect(combinarDataHora("", "10:00")).toBeNull();
    expect(combinarDataHora("2026-01-05", "25:00")).toBeNull();
  });

  it("formata o vencimento relativo a hoje", () => {
    expect(formatarVencimento(em(15, 16), AGORA)).toBe("Hoje 16:00");
    expect(formatarVencimento(em(16, 9), AGORA)).toBe("Amanhã 09:00");
    expect(formatarVencimento(em(14, 9), AGORA)).toBe("Ontem 09:00");
    expect(formatarVencimento(em(22, 9, 30), AGORA)).toBe("22/10 09:30");
    expect(formatarVencimento(new Date(2027, 0, 3, 9).toISOString(), AGORA)).toBe("03/01/2027 09:00");
  });
});

describe("lead-tarefas: kanban e lembrete", () => {
  const lista = [
    tarefa({ id: "1", lead_id: "A", vence_em: em(20) }),
    tarefa({ id: "2", lead_id: "A", vence_em: em(14) }),
    tarefa({ id: "3", lead_id: "B", vence_em: em(15, 18), responsavel_id: "u2" }),
    tarefa({ id: "4", lead_id: "C", vence_em: em(10), concluida_em: em(11) }),
    tarefa({ id: "5", lead_id: "D", vence_em: em(15, 20) }),
  ];

  it("resume a tarefa aberta mais urgente por lead (concluídas ignoradas)", () => {
    const m = resumoTarefasPorLead(lista, AGORA);
    expect(m.get("A")).toMatchObject({ status: "atrasada", abertas: 2, proxima: { id: "2" } });
    expect(m.get("B")).toMatchObject({ status: "hoje", abertas: 1 });
    expect(m.has("C")).toBe(false);
  });

  it("lembrete: só minhas, abertas, de hoje ou atrasadas", () => {
    expect(tarefasParaLembrete(lista, "u1", AGORA).map((t) => t.id)).toEqual(["2", "5"]);
    expect(tarefasParaLembrete(lista, null, AGORA)).toEqual([]);
  });

  it("linhas de histórico com de = para são anotação, não movimento", () => {
    expect(ehAnotacaoHistorico({ de_etapa: "follow_up", para_etapa: "follow_up" })).toBe(true);
    expect(ehAnotacaoHistorico({ de_etapa: "ganho", para_etapa: "follow_up" })).toBe(false);
    expect(ehAnotacaoHistorico({ de_etapa: null, para_etapa: "novo" })).toBe(false);
  });
});
