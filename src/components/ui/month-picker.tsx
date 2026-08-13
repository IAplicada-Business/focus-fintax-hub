import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCompetenciaPT } from "@/lib/clientes-constants";

const MESES = [
  { v: "01", label: "Jan" },
  { v: "02", label: "Fev" },
  { v: "03", label: "Mar" },
  { v: "04", label: "Abr" },
  { v: "05", label: "Mai" },
  { v: "06", label: "Jun" },
  { v: "07", label: "Jul" },
  { v: "08", label: "Ago" },
  { v: "09", label: "Set" },
  { v: "10", label: "Out" },
  { v: "11", label: "Nov" },
  { v: "12", label: "Dez" },
] as const;

interface MonthPickerProps {
  value: string;
  onChange: (yyyyMm: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

/** Seletor de competência YYYY-MM com meses em português (não depende do idioma do SO). */
export function MonthPicker({
  value,
  onChange,
  placeholder = "mês/ano",
  className,
  "aria-label": ariaLabel,
}: MonthPickerProps) {
  const parsed = String(value || "").match(/^(\d{4})-(\d{2})/);
  const selectedYear = parsed ? Number(parsed[1]) : new Date().getFullYear();
  const selectedMonth = parsed ? parsed[2] : "";
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selectedYear);

  useEffect(() => {
    if (open) setYear(selectedYear);
  }, [open, selectedYear]);

  const display = parsed ? formatCompetenciaPT(value) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            "h-8 w-[9.5rem] justify-between px-2.5 text-xs font-normal",
            !display && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{display || placeholder}</span>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[232px] p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold tabular-nums">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Próximo ano"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MESES.map((m) => {
            const active = selectedMonth === m.v && selectedYear === year;
            return (
              <Button
                key={m.v}
                type="button"
                variant={active ? "default" : "ghost"}
                className="h-8 text-xs"
                onClick={() => {
                  onChange(`${year}-${m.v}`);
                  setOpen(false);
                }}
              >
                {m.label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
