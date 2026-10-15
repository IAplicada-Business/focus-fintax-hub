import { describe, it, expect } from "vitest";
import {
  PERIODO_PIPELINE_STORAGE_KEY,
  dentroDoPeriodo,
  filtrarPorPeriodo,
  intervaloPeriodo,
  isTipoPeriodoPipeline,
  lerPeriodoPipeline,
  periodoLabel,
  salvarPeriodoPipeline,
  trocarTipoPeriodo,
  type PeriodoPipeline,
} from "@/lib/pipeline-periodo";

// 15/10/2026 12:00 no horário local do ambiente de teste.
const AGORA = new Date(2026, 9, 15, 12, 0, 0).getTime();
const MS_DIA = 86_400_000;
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

const leads = [
  { id: "antigo", criado_em: local(2026, 6, 1) },
  { id: "jul", criado_em: local(2026, 7, 20) },
  { id: "set-ultimo-dia", criado_em: local(2026, 9, 30, 23) },
  { id: "out-1", criado_em: local(2026, 10, 1, 0) },
  { id: "out-14", criado_em: local(2026, 10, 14) },
  { id: "sem-data", criado_em: null },
];
const ids = (p: PeriodoPipeline) => filtrarPorPeriodo(leads, p, AGORA).map((l) => l.id);

describe("intervaloPeriodo", () => {
  it("tudo não limita; 30d/90d só têm limite inferior", () => {
    expect(intervaloPeriodo({ tipo: "tudo" }, AGORA)).toEqual({ inicio: null, fim: null });
    expect(intervaloPeriodo({ tipo: "30d" }, AGORA)).toEqual({ inicio: AGORA - 30 * MS_DIA, fim: null });
    expect(intervaloPeriodo({ tipo: "90d" }, AGORA)).toEqual({ inicio: AGORA - 90 * MS_DIA, fim: null });
  });

  it("este mês e mês passado fecham no primeiro dia do mês seguinte (exclusivo)", () => {
    expect(intervaloPeriodo({ tipo: "este_mes" }, AGORA)).toEqual({ inicio: new Date(2026, 9, 1).getTime(), fim: new Date(2026, 10, 1).getTime() });
    expect(intervaloPeriodo({ tipo: "mes_passado" }, AGORA)).toEqual({ inicio: new Date(2026, 8, 1).getTime(), fim: new Date(2026, 9, 1).getTime() });
  });

  it("mês passado vira o ano em janeiro", () => {
    const jan = new Date(2027, 0, 10).getTime();
    expect(intervaloPeriodo({ tipo: "mes_passado" }, jan)).toEqual({ inicio: new Date(2026, 11, 1).getTime(), fim: new Date(2027, 0, 1).getTime() });
  });

  it("mês escolhido inválido não esconde nada", () => {
    expect(intervaloPeriodo({ tipo: "mes", mes: "" }, AGORA)).toEqual({ inicio: null, fim: null });
    expect(intervaloPeriodo({ tipo: "mes", mes: "2026-13" }, AGORA)).toEqual({ inicio: null, fim: null });
  });
});

describe("filtrarPorPeriodo", () => {
  it("tudo devolve a lista intacta (mesma referência)", () => {
    expect(filtrarPorPeriodo(leads, { tipo: "tudo" }, AGORA)).toBe(leads);
  });

  it("respeita as bordas do mês: 30/09 23h fica fora de outubro, 01/10 00h fica dentro", () => {
    expect(ids({ tipo: "este_mes" })).toEqual(["out-1", "out-14"]);
    expect(ids({ tipo: "mes_passado" })).toEqual(["set-ultimo-dia"]);
    expect(ids({ tipo: "mes", mes: "2026-07" })).toEqual(["jul"]);
  });

  it("janelas móveis contam a partir de agora", () => {
    expect(ids({ tipo: "30d" })).toEqual(["set-ultimo-dia", "out-1", "out-14"]);
    expect(ids({ tipo: "90d" })).toEqual(["jul", "set-ultimo-dia", "out-1", "out-14"]);
  });

  it("lead sem data de criação só aparece em 'tudo'", () => {
    expect(ids({ tipo: "tudo" })).toContain("sem-data");
    expect(ids({ tipo: "90d" })).not.toContain("sem-data");
    expect(dentroDoPeriodo("data-invalida", { inicio: 0, fim: null })).toBe(false);
  });
});

describe("rótulos e troca de tipo", () => {
  it("periodoLabel", () => {
    expect(periodoLabel({ tipo: "tudo" })).toBe("Tudo");
    expect(periodoLabel({ tipo: "30d" })).toBe("Últimos 30 dias");
    expect(periodoLabel({ tipo: "mes", mes: "2026-07" })).toBe("Jul/2026");
    expect(periodoLabel({ tipo: "mes", mes: "" })).toBe("Escolher mês");
  });

  it("trocar para 'mes' sugere o mês corrente e preserva o mês já escolhido", () => {
    expect(trocarTipoPeriodo({ tipo: "tudo" }, "mes", AGORA)).toEqual({ tipo: "mes", mes: "2026-10" });
    expect(trocarTipoPeriodo({ tipo: "mes", mes: "2026-07" }, "mes", AGORA)).toEqual({ tipo: "mes", mes: "2026-07" });
    expect(trocarTipoPeriodo({ tipo: "mes", mes: "2026-07" }, "90d", AGORA)).toEqual({ tipo: "90d" });
    expect(isTipoPeriodoPipeline("90d")).toBe(true);
    expect(isTipoPeriodoPipeline("semana")).toBe(false);
  });
});

describe("persistência em localStorage", () => {
  const memoria = (): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it("salva e lê de volta sob a chave focus.pipeline.periodo", () => {
    const s = memoria();
    salvarPeriodoPipeline(s, { tipo: "mes", mes: "2026-07" });
    expect(s.m.has(PERIODO_PIPELINE_STORAGE_KEY)).toBe(true);
    expect(lerPeriodoPipeline(s)).toEqual({ tipo: "mes", mes: "2026-07" });
    salvarPeriodoPipeline(s, { tipo: "30d" });
    expect(lerPeriodoPipeline(s)).toEqual({ tipo: "30d" });
  });

  it("lixo, storage ausente ou mês inválido caem em 'tudo'", () => {
    expect(lerPeriodoPipeline(null)).toEqual({ tipo: "tudo" });
    const s = memoria();
    s.setItem(PERIODO_PIPELINE_STORAGE_KEY, "{nope");
    expect(lerPeriodoPipeline(s)).toEqual({ tipo: "tudo" });
    s.setItem(PERIODO_PIPELINE_STORAGE_KEY, JSON.stringify({ tipo: "semana" }));
    expect(lerPeriodoPipeline(s)).toEqual({ tipo: "tudo" });
    s.setItem(PERIODO_PIPELINE_STORAGE_KEY, JSON.stringify({ tipo: "mes", mes: "07/2026" }));
    expect(lerPeriodoPipeline(s)).toEqual({ tipo: "tudo" });
    expect(() => salvarPeriodoPipeline({ getItem: () => null, setItem: () => { throw new Error("cheio"); } }, { tipo: "30d" })).not.toThrow();
  });
});
