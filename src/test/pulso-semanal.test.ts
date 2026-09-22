import { describe, expect, it } from "vitest";
import {
  dentroDaSemana,
  mesPulsoLabel,
  semanaAtual,
  semanaPadrao,
  semanasDisponiveis,
  semanasDoMes,
} from "@/lib/pulso-semanal";

describe("semanas administrativas do Pulso semanal", () => {
  it("divide setembro em 01–07, 08–14, 15–21, 22–28 e 29–30", () => {
    expect(
      semanasDoMes("2026-09").map((semana) => ({
        key: semana.key,
        label: semana.label,
        inicioDia: semana.inicioDia,
        fimDia: semana.fimDia,
      })),
    ).toEqual([
      { key: "2026-09-s1", label: "Semana 1 · 01–07", inicioDia: 1, fimDia: 7 },
      { key: "2026-09-s2", label: "Semana 2 · 08–14", inicioDia: 8, fimDia: 14 },
      { key: "2026-09-s3", label: "Semana 3 · 15–21", inicioDia: 15, fimDia: 21 },
      { key: "2026-09-s4", label: "Semana 4 · 22–28", inicioDia: 22, fimDia: 28 },
      { key: "2026-09-s5", label: "Semana 5 · 29–30", inicioDia: 29, fimDia: 30 },
    ]);
  });

  it("respeita fevereiro e seleciona a semana do dia em São Paulo", () => {
    expect(semanasDoMes("2026-02")).toHaveLength(4);
    expect(semanasDoMes("2026-02")[3].fimDia).toBe(28);
    expect(
      semanaAtual("2026-09", new Date("2026-09-22T12:00:00-03:00")).key,
    ).toBe("2026-09-s4");
  });

  it("usa início inclusivo e fim exclusivo", () => {
    const semana = semanasDoMes("2026-09")[0];
    expect(dentroDaSemana("2026-09-01T03:00:00.000Z", semana)).toBe(true);
    expect(dentroDaSemana("2026-09-04T12:00:00-03:00", semana)).toBe(true);
    expect(dentroDaSemana("2026-09-08T02:59:59.999Z", semana)).toBe(true);
    expect(dentroDaSemana("2026-09-08T03:00:00.000Z", semana)).toBe(false);
  });

  it("formata o mês para o cabeçalho", () => {
    expect(mesPulsoLabel("2026-09")).toBe("Setembro de 2026");
  });

  it("esconde semanas futuras e escolhe a semana padrão do mês", () => {
    const agora = new Date("2026-09-22T12:00:00-03:00");
    expect(semanasDisponiveis("2026-09", agora).map((s) => s.key)).toEqual([
      "2026-09-s1",
      "2026-09-s2",
      "2026-09-s3",
      "2026-09-s4",
    ]);
    expect(semanasDisponiveis("2026-08", agora)).toHaveLength(5);
    expect(semanasDisponiveis("2026-10", agora)).toEqual([]);
    expect(semanaPadrao("2026-09", agora).key).toBe("2026-09-s4");
    expect(semanaPadrao("2026-08", agora).key).toBe("2026-08-s5");
  });
});
