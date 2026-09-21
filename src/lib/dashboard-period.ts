import { monthKeyBrt } from "@/lib/month-key";
import type { CompLike, ProcessoLike } from "@/lib/operacional-analytics";

export type DashboardPeriod =
  | { mode: "month"; month: string }
  | { mode: "year"; year: string }
  | { mode: "accumulated" };

export interface DashboardPeriodOptions {
  months: string[];
  years: string[];
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function competenciaKey(value: string | null | undefined): string | null {
  const key = String(value ?? "").slice(0, 7);
  return MONTH_RE.test(key) ? key : null;
}

export function dashboardPeriodOptions(comps: CompLike[]): DashboardPeriodOptions {
  const months = [...new Set(
    comps.map((comp) => competenciaKey(comp.mes_referencia)).filter(Boolean) as string[],
  )].sort().reverse();
  const years = [...new Set(months.map((month) => month.slice(0, 4)))].sort().reverse();
  return { months, years };
}

/** Evita abrir em um mês corrente vazio: começa pela última competência real. */
export function defaultDashboardPeriod(comps: CompLike[]): DashboardPeriod {
  const [latest] = dashboardPeriodOptions(comps).months;
  return latest ? { mode: "month", month: latest } : { mode: "accumulated" };
}

export function dashboardPeriodLabel(period: DashboardPeriod): string {
  if (period.mode === "accumulated") return "Acumulado";
  if (period.mode === "year") return `Ano ${period.year}`;
  const [year, month] = period.month.split("-");
  return `${month}/${year}`;
}

/** Meses disponíveis para um ano, no formato MM (mais recente primeiro). */
export function dashboardMonthsForYear(
  options: DashboardPeriodOptions,
  year: string,
): string[] {
  return options.months
    .filter((key) => key.startsWith(`${year}-`))
    .map((key) => key.slice(5, 7));
}

/**
 * Troca o modo sem produzir um período inválido. Ao entrar em mês/ano,
 * reaproveita o ano atual e cai na competência real mais recente disponível.
 */
export function changeDashboardPeriodMode(
  period: DashboardPeriod,
  mode: DashboardPeriod["mode"],
  options: DashboardPeriodOptions,
): DashboardPeriod {
  if (mode === "accumulated") return { mode: "accumulated" };

  const currentYear =
    period.mode === "month"
      ? period.month.slice(0, 4)
      : period.mode === "year"
        ? period.year
        : options.years[0];

  if (!currentYear) return { mode: "accumulated" };
  if (mode === "year") return { mode: "year", year: currentYear };

  const currentMonth = period.mode === "month" ? period.month.slice(5, 7) : null;
  const months = dashboardMonthsForYear(options, currentYear);
  const month = currentMonth && months.includes(currentMonth) ? currentMonth : months[0];
  if (month) return { mode: "month", month: `${currentYear}-${month}` };

  const latest = options.months[0];
  return latest ? { mode: "month", month: latest } : { mode: "accumulated" };
}

/** Troca o ano e mantém o mês quando ele existe no novo ano. */
export function changeDashboardPeriodYear(
  period: DashboardPeriod,
  year: string,
  options: DashboardPeriodOptions,
): DashboardPeriod {
  if (period.mode === "year") return { mode: "year", year };
  if (period.mode !== "month") return changeDashboardPeriodMode(period, "month", options);

  const currentMonth = period.month.slice(5, 7);
  const months = dashboardMonthsForYear(options, year);
  const month = months.includes(currentMonth) ? currentMonth : months[0];
  return month ? { mode: "month", month: `${year}-${month}` } : period;
}

export function matchesDashboardPeriod(
  month: string | null | undefined,
  period: DashboardPeriod,
): boolean {
  if (period.mode === "accumulated") return true;
  const key = competenciaKey(month);
  if (!key) return false;
  return period.mode === "month" ? key === period.month : key.startsWith(`${period.year}-`);
}

export function timestampMatchesDashboardPeriod(
  timestamp: string | null | undefined,
  period: DashboardPeriod,
): boolean {
  if (period.mode === "accumulated") return true;
  if (!timestamp) return false;
  const millis = new Date(timestamp).getTime();
  if (!Number.isFinite(millis)) return false;
  return matchesDashboardPeriod(monthKeyBrt(millis), period);
}

export function filterCompsByDashboardPeriod(
  comps: CompLike[],
  period: DashboardPeriod,
): CompLike[] {
  return comps.filter((comp) => matchesDashboardPeriod(comp.mes_referencia, period));
}

export function filterProcessosByDashboardPeriod(
  processos: ProcessoLike[],
  period: DashboardPeriod,
): ProcessoLike[] {
  return processos.filter((processo) =>
    timestampMatchesDashboardPeriod(processo.criado_em, period),
  );
}

/**
 * Em mês/ano, todo o dashboard usa a mesma população: clientes com compensação
 * na competência ou processo criado no período. Acumulado mantém todos.
 */
export function filterClientIdsByDashboardPeriod(
  ids: Iterable<string>,
  period: DashboardPeriod,
  comps: CompLike[],
  processos: ProcessoLike[],
): Set<string> {
  const all = new Set(ids);
  if (period.mode === "accumulated") return all;
  const active = new Set<string>();
  for (const comp of filterCompsByDashboardPeriod(comps, period)) active.add(comp.cliente_id);
  for (const processo of filterProcessosByDashboardPeriod(processos, period)) {
    active.add(processo.cliente_id);
  }
  return new Set([...all].filter((id) => active.has(id)));
}

export function dashboardPeriodEndMonth(
  period: DashboardPeriod,
  options: DashboardPeriodOptions,
): string | null {
  if (period.mode === "month") return period.month;
  if (period.mode === "year") return `${period.year}-12`;
  return options.months[0] ?? null;
}
