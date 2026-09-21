import { CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeDashboardPeriodMode,
  changeDashboardPeriodYear,
  dashboardMonthsForYear,
  type DashboardPeriod,
  type DashboardPeriodOptions,
} from "@/lib/dashboard-period";
import { MESES_CURTOS } from "@/lib/competencia-select";

interface Props {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
  options: DashboardPeriodOptions;
}

export function DashboardPeriodFilter({ value, onChange, options }: Props) {
  const year =
    value.mode === "month"
      ? value.month.slice(0, 4)
      : value.mode === "year"
        ? value.year
        : options.years[0] ?? "";
  const month = value.mode === "month" ? value.month.slice(5, 7) : "";
  const months = dashboardMonthsForYear(options, year);

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label="Período do dashboard"
    >
      <Select
        value={value.mode}
        onValueChange={(mode) =>
          onChange(
            changeDashboardPeriodMode(
              value,
              mode as DashboardPeriod["mode"],
              options,
            ),
          )
        }
      >
        <SelectTrigger className="h-9 w-[8.5rem]" aria-label="Tipo de período">
          <CalendarRange className="mr-1.5 h-3.5 w-3.5 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Por mês</SelectItem>
          <SelectItem value="year">Por ano</SelectItem>
          <SelectItem value="accumulated">Acumulado</SelectItem>
        </SelectContent>
      </Select>

      {value.mode === "month" && (
        <Select
          value={month}
          onValueChange={(nextMonth) =>
            onChange({ mode: "month", month: `${year}-${nextMonth}` })
          }
        >
          <SelectTrigger className="h-9 w-[5.5rem]" aria-label="Mês do dashboard">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {months.map((number) => {
              const label =
                MESES_CURTOS.find((item) => item.v === number)?.label ?? number;
              return (
                <SelectItem key={number} value={number}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {value.mode !== "accumulated" && (
        <Select
          value={year}
          onValueChange={(nextYear) =>
            onChange(changeDashboardPeriodYear(value, nextYear, options))
          }
        >
          <SelectTrigger className="h-9 w-[5.75rem]" aria-label="Ano do dashboard">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {options.years.map((optionYear) => (
              <SelectItem key={optionYear} value={optionYear}>
                {optionYear}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
