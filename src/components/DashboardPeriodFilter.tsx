import { CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  dashboardPeriodLabel,
  type DashboardPeriod,
  type DashboardPeriodOptions,
} from "@/lib/dashboard-period";

interface Props {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
  options: DashboardPeriodOptions;
}

const serialize = (period: DashboardPeriod) => {
  if (period.mode === "accumulated") return "accumulated";
  return `${period.mode}:${period.mode === "month" ? period.month : period.year}`;
};

const parse = (value: string): DashboardPeriod => {
  if (value === "accumulated") return { mode: "accumulated" };
  const [mode, key] = value.split(":");
  return mode === "year"
    ? { mode: "year", year: key }
    : { mode: "month", month: key };
};

export function DashboardPeriodFilter({ value, onChange, options }: Props) {
  return (
    <Select value={serialize(value)} onValueChange={(next) => onChange(parse(next))}>
      <SelectTrigger className="h-9 w-[190px]" aria-label="Período do dashboard">
        <CalendarRange className="mr-2 h-3.5 w-3.5 shrink-0" />
        <SelectValue>{dashboardPeriodLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="accumulated">Acumulado</SelectItem>
        {options.years.length > 0 && (
          <SelectGroup>
            <SelectLabel>Anos</SelectLabel>
            {options.years.map((year) => (
              <SelectItem key={year} value={`year:${year}`}>
                Ano {year}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {options.months.length > 0 && (
          <SelectGroup>
            <SelectLabel>Competências</SelectLabel>
            {options.months.map((month) => (
              <SelectItem key={month} value={`month:${month}`}>
                {dashboardPeriodLabel({ mode: "month", month })}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
