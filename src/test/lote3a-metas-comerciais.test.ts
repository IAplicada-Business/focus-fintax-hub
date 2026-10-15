import { describe, it, expect } from "vitest";
import {
  METRICAS_META,
  NOME_SEM_SDR,
  atingimentoPct,
  consolidarMetas,
  dataParaMes,
  labelAtingimento,
  mesAnterior,
  mesChave,
  mesLabel,
  mesParaData,
  normalizarMetaDigitada,
  tomAtingimento,
  type MetaComercialRow,
  type RealizadoSdrRow,
} from "@/lib/metas-comerciais";
import { labelGapConversao, metasConversaoPorEtapa, tomConversao } from "@/lib/pipeline-sla";

const realizado = (over: Partial<RealizadoSdrRow> & Pick<RealizadoSdrRow, "user_id">): RealizadoSdrRow => ({
  full_name: null,
  reunioes_agendadas: 0,
  reunioes_realizadas: 0,
  leads_novos: 0,
  contratos: 0,
  ...over,
});

const meta = (over: Partial<MetaComercialRow> & Pick<MetaComercialRow, "escopo" | "user_id">): MetaComercialRow => ({
  mes: "2026-10-01",
  reunioes_agendadas: null,
  reunioes_realizadas: null,
  leads_novos: null,
  contratos: null,
  ...over,
});

describe("mês das metas", () => {
  it("mesChave usa o calendário de São Paulo, não UTC", () => {
    // 31/10 23:30 em SP é 01/11 02:30 UTC: ainda é outubro pra equipe.
    expect(mesChave(new Date("2026-11-01T02:30:00Z"))).toBe("2026-10");
    // 01/11 00:30 em SP (03:30 UTC) já é novembro.
    expect(mesChave(new Date("2026-11-01T03:30:00Z"))).toBe("2026-11");
  });

  it("converte entre YYYY-MM e o primeiro dia do mês", () => {
    expect(mesParaData("2026-10")).toBe("2026-10-01");
    expect(dataParaMes("2026-10-01")).toBe("2026-10");
    expect(dataParaMes(null)).toBe("");
    expect(() => mesParaData("2026-10-01")).toThrow();
  });

  it("rotula e desloca o mês sem depender do fuso", () => {
    expect(mesLabel("2026-10")).toBe("Out/2026");
    expect(mesLabel("invalido")).toBe("invalido");
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });
});

describe("atingimentoPct / tom", () => {
  it("calcula o percentual arredondado e devolve null sem meta ou meta zero", () => {
    expect(atingimentoPct(7, 10)).toBe(70);
    expect(atingimentoPct(2, 3)).toBe(67);
    expect(atingimentoPct(12, 10)).toBe(120);
    expect(atingimentoPct(5, null)).toBeNull();
    expect(atingimentoPct(5, 0)).toBeNull();
  });

  it("colore: ≥100 verde, ≥70 âmbar, abaixo vermelho, sem meta neutro", () => {
    expect(tomAtingimento(100)).toBe("green");
    expect(tomAtingimento(150)).toBe("green");
    expect(tomAtingimento(70)).toBe("amber");
    expect(tomAtingimento(69)).toBe("red");
    expect(tomAtingimento(null)).toBe("muted");
  });

  it("label mostra realizado/meta e percentual", () => {
    expect(labelAtingimento({ meta: 10, realizado: 7, pct: 70 })).toBe("7/10 · 70%");
    expect(labelAtingimento({ meta: null, realizado: 7, pct: null })).toBe("7 · sem meta");
  });

  it("normaliza o campo digitado", () => {
    expect(normalizarMetaDigitada(" 12 ")).toBe(12);
    expect(normalizarMetaDigitada("12,7")).toBe(12);
    expect(normalizarMetaDigitada("")).toBeNull();
    expect(normalizarMetaDigitada("-3")).toBeNull();
    expect(normalizarMetaDigitada("abc")).toBeNull();
  });
});

describe("consolidarMetas", () => {
  const equipe = [
    { user_id: "agatha", full_name: "Ágatha Souza", cargo_comercial: "sdr" },
    { user_id: "larissa", full_name: "Larissa Lima", cargo_comercial: "sdr" },
    { user_id: "sampaio", full_name: "Sampaio", cargo_comercial: "closer" },
  ];

  it("cruza realizado e meta por SDR e calcula o atingimento", () => {
    const c = consolidarMetas(
      [
        realizado({ user_id: "agatha", full_name: "Ágatha Souza", reunioes_agendadas: 8, reunioes_realizadas: 5, leads_novos: 30, contratos: 2 }),
        realizado({ user_id: "larissa", full_name: "Larissa Lima", reunioes_agendadas: 4, reunioes_realizadas: 4 }),
      ],
      [
        meta({ escopo: "sdr", user_id: "agatha", reunioes_agendadas: 10, reunioes_realizadas: 8 }),
        meta({ escopo: "sdr", user_id: "larissa", reunioes_agendadas: 10, reunioes_realizadas: 2 }),
      ],
      equipe,
    );
    expect(c.linhas.map((l) => l.nome)).toEqual(["Ágatha Souza", "Larissa Lima"]);
    const agatha = c.linhas[0];
    expect(agatha.metricas.reunioes_agendadas).toEqual({ meta: 10, realizado: 8, pct: 80 });
    expect(agatha.metricas.reunioes_realizadas).toEqual({ meta: 8, realizado: 5, pct: 63 });
    expect(agatha.metricas.leads_novos).toEqual({ meta: null, realizado: 30, pct: null });
    expect(c.linhas[1].metricas.reunioes_realizadas).toEqual({ meta: 2, realizado: 4, pct: 200 });
  });

  it("closers ficam de fora; SDR sem movimento entra zerada pra receber meta", () => {
    const c = consolidarMetas([], [], equipe);
    expect(c.linhas.map((l) => l.user_id)).toEqual(["agatha", "larissa"]);
    for (const k of METRICAS_META) expect(c.linhas[0].metricas[k]).toEqual({ meta: null, realizado: 0, pct: null });
  });

  it("linha 'Sem SDR' aparece por último só quando há movimento sem dono", () => {
    const comMovimento = consolidarMetas([realizado({ user_id: null, reunioes_agendadas: 3 })], [], equipe);
    expect(comMovimento.linhas.at(-1)).toMatchObject({ user_id: null, nome: NOME_SEM_SDR, semSdr: true });
    expect(comMovimento.linhas.at(-1)?.metricas.reunioes_agendadas.realizado).toBe(3);

    const semMovimento = consolidarMetas([realizado({ user_id: null })], [], equipe);
    expect(semMovimento.linhas.some((l) => l.semSdr)).toBe(false);
  });

  it("equipe: realizado soma tudo (inclusive sem SDR) e meta soma as SDRs quando não há meta própria", () => {
    const c = consolidarMetas(
      [
        realizado({ user_id: "agatha", reunioes_agendadas: 8 }),
        realizado({ user_id: "larissa", reunioes_agendadas: 4 }),
        realizado({ user_id: null, reunioes_agendadas: 1 }),
      ],
      [meta({ escopo: "sdr", user_id: "agatha", reunioes_agendadas: 10 }), meta({ escopo: "sdr", user_id: "larissa", reunioes_agendadas: 10 })],
      equipe,
    );
    expect(c.metaEquipeExplicita).toBe(false);
    expect(c.equipe.metricas.reunioes_agendadas).toEqual({ meta: 20, realizado: 13, pct: 65 });
    // Métrica sem nenhuma meta de SDR fica sem meta na equipe também.
    expect(c.equipe.metricas.contratos).toEqual({ meta: null, realizado: 0, pct: null });
  });

  it("meta explícita da equipe (escopo 'equipe') prevalece sobre a soma", () => {
    const c = consolidarMetas(
      [realizado({ user_id: "agatha", reunioes_realizadas: 6 })],
      [meta({ escopo: "sdr", user_id: "agatha", reunioes_realizadas: 5 }), meta({ escopo: "equipe", user_id: null, reunioes_realizadas: 12 })],
      equipe,
    );
    expect(c.metaEquipeExplicita).toBe(true);
    expect(c.equipe.metricas.reunioes_realizadas).toEqual({ meta: 12, realizado: 6, pct: 50 });
    // A linha da equipe não vira uma SDR na tabela.
    expect(c.linhas.every((l) => l.user_id !== null)).toBe(true);
  });

  it("SDR só com meta (sem estar na equipe nem no realizado) ainda aparece, com nome da RPC quando houver", () => {
    const c = consolidarMetas(
      [realizado({ user_id: "ex", full_name: "Ex SDR", reunioes_agendadas: 1 })],
      [meta({ escopo: "sdr", user_id: "ex", reunioes_agendadas: 4 }), meta({ escopo: "sdr", user_id: "fantasma", reunioes_agendadas: 2 })],
      [],
    );
    expect(c.linhas.map((l) => [l.nome, l.metricas.reunioes_agendadas.meta])).toEqual([
      ["Ex SDR", 4],
      ["Sem nome", 2],
    ]);
  });
});

describe("metas de conversão por etapa", () => {
  it("monta o mapa só com etapas que têm meta", () => {
    expect(
      metasConversaoPorEtapa([
        { etapa: "novo", meta_conversao_pct: 60 },
        { etapa: "qualificado", meta_conversao_pct: null },
        { etapa: "apresentacao" },
      ]),
    ).toEqual({ novo: 60 });
  });

  it("colore o desvio observado × meta", () => {
    expect(tomConversao(65, 60)).toBe("green");
    expect(tomConversao(60, 60)).toBe("green");
    expect(tomConversao(52, 60)).toBe("amber");
    expect(tomConversao(40, 60)).toBe("red");
    expect(tomConversao(null, 60)).toBe("muted");
    expect(tomConversao(40, null)).toBe("muted");
  });

  it("rotula o gap em pontos percentuais", () => {
    expect(labelGapConversao(65, 60)).toBe("+5 pp");
    expect(labelGapConversao(48, 60)).toBe("−12 pp");
    expect(labelGapConversao(60, 60)).toBe("na meta");
    expect(labelGapConversao(60, null)).toBeNull();
  });
});
