import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPeriodFilter } from "@/components/DashboardPeriodFilter";
import {
  changeDashboardPeriodMode,
  changeDashboardPeriodYear,
  dashboardMonthsForYear,
  dashboardPeriodOptions,
  defaultDashboardPeriod,
  filterClientIdsByDashboardPeriod,
  filterCompsByDashboardPeriod,
  filterProcessosByDashboardPeriod,
  timestampMatchesDashboardPeriod,
} from "@/lib/dashboard-period";
import { resumirFinanceiroPorCliente } from "@/lib/operacional-analytics";

const comps = [
  {
    cliente_id: "a",
    mes_referencia: "2026-07-01",
    valor_compensado: 100,
    tese_origem_id: "t-insumos",
    processo_tese_id: "p-a",
  },
  {
    cliente_id: "b",
    mes_referencia: "2026-08-01",
    valor_compensado: 250,
    tese_origem_id: "t-insumos",
    processo_tese_id: "p-b",
  },
];

const processos = [
  {
    id: "p-a",
    cliente_id: "a",
    tese: "INSUMOS",
    criado_em: "2026-07-10T12:00:00Z",
    valor_credito: 1_000,
  },
  {
    id: "p-b",
    cliente_id: "b",
    tese: "INSUMOS",
    criado_em: "2026-08-10T12:00:00Z",
    valor_credito: 2_000,
  },
];

const teses = [{ id: "t-insumos", codigo: "INSUMOS", label: "Insumos" }];
const creditos = [
  { cliente_id: "a", tese_id: "t-insumos", valor_apurado_inicial: 1_000, incluir_no_calculo: true },
  { cliente_id: "b", tese_id: "t-insumos", valor_apurado_inicial: 2_000, incluir_no_calculo: true },
];

describe("recorte temporal compartilhado dos dashboards", () => {
  it("abre na última competência com dados, nunca no mês corrente vazio", () => {
    expect(dashboardPeriodOptions(comps)).toEqual({
      months: ["2026-08", "2026-07"],
      years: ["2026"],
    });
    expect(defaultDashboardPeriod(comps)).toEqual({ mode: "month", month: "2026-08" });
  });

  it("muda população, lançamentos, processos e KPIs com o mesmo período", () => {
    const julho = { mode: "month", month: "2026-07" } as const;
    const agosto = { mode: "month", month: "2026-08" } as const;

    const idsJulho = filterClientIdsByDashboardPeriod(["a", "b"], julho, comps, processos);
    const idsAgosto = filterClientIdsByDashboardPeriod(["a", "b"], agosto, comps, processos);
    const compsJulho = filterCompsByDashboardPeriod(comps, julho);
    const compsAgosto = filterCompsByDashboardPeriod(comps, agosto);

    expect([...idsJulho]).toEqual(["a"]);
    expect([...idsAgosto]).toEqual(["b"]);
    expect(filterProcessosByDashboardPeriod(processos, julho).map((p) => p.id)).toEqual(["p-a"]);
    expect(filterProcessosByDashboardPeriod(processos, agosto).map((p) => p.id)).toEqual(["p-b"]);

    const kpisJulho = resumirFinanceiroPorCliente(
      idsJulho,
      compsJulho,
      creditos,
      teses,
      processos,
    );
    const kpisAgosto = resumirFinanceiroPorCliente(
      idsAgosto,
      compsAgosto,
      creditos,
      teses,
      processos,
    );

    expect(kpisJulho[0]).toMatchObject({
      cliente_id: "a",
      credito_apurado: 1_000,
      total_compensado: 100,
      saldo_restante: 900,
    });
    expect(kpisAgosto[0]).toMatchObject({
      cliente_id: "b",
      credito_apurado: 2_000,
      total_compensado: 250,
      saldo_restante: 1_750,
    });
  });

  it("usa BRT em timestamps na virada UTC e oferece acumulado", () => {
    const fevereiro = { mode: "month", month: "2026-02" } as const;
    expect(timestampMatchesDashboardPeriod("2026-03-01T02:30:00Z", fevereiro)).toBe(true);
    expect(
      filterClientIdsByDashboardPeriod(
        ["a", "b"],
        { mode: "accumulated" },
        comps,
        processos,
      ),
    ).toEqual(new Set(["a", "b"]));
  });

  it("separa mês e ano sem inventar competências sem dados", () => {
    const options = {
      months: ["2026-08", "2026-07", "2025-12"],
      years: ["2026", "2025"],
    };
    const agosto = { mode: "month", month: "2026-08" } as const;

    expect(dashboardMonthsForYear(options, "2026")).toEqual(["08", "07"]);
    expect(changeDashboardPeriodYear(agosto, "2025", options)).toEqual({
      mode: "month",
      month: "2025-12",
    });
    expect(changeDashboardPeriodMode(agosto, "year", options)).toEqual({
      mode: "year",
      year: "2026",
    });
    expect(changeDashboardPeriodMode(agosto, "accumulated", options)).toEqual({
      mode: "accumulated",
    });
  });

  it("renderiza modo, mês e ano em campos separados", () => {
    const onChange = vi.fn();
    render(
      <DashboardPeriodFilter
        value={{ mode: "month", month: "2026-08" }}
        onChange={onChange}
        options={{
          months: ["2026-08", "2026-07", "2025-12"],
          years: ["2026", "2025"],
        }}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Tipo de período" })).toHaveTextContent("Por mês");
    expect(screen.getByRole("combobox", { name: "Mês do dashboard" })).toHaveTextContent("Ago");
    expect(screen.getByRole("combobox", { name: "Ano do dashboard" })).toHaveTextContent("2026");

    fireEvent.click(screen.getByRole("combobox", { name: "Ano do dashboard" }));
    fireEvent.click(screen.getByRole("option", { name: "2025" }));
    expect(onChange).toHaveBeenCalledWith({ mode: "month", month: "2025-12" });
  });
});
