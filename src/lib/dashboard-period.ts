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
