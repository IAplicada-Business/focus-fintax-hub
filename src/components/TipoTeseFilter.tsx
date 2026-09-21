import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter } from "lucide-react";
import type { TipoTeseFiltro, TipoTeseOpcao } from "@/lib/tese-filter";

interface Props {
  value: TipoTeseFiltro;
  onChange: (value: TipoTeseFiltro) => void;
  options: TipoTeseOpcao[];
  className?: string;
}

export function TipoTeseFilter({ value, onChange, options, className }: Props) {
  const selecionada = options.find((option) => option.value === value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Filter className="mr-1 h-3.5 w-3.5" />
          {selecionada?.label ?? "Tipo de tese"}
          {selecionada && (
            <Badge className="ml-2 h-4 px-1 text-[10px]">{selecionada.clientes}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-1">
          <p className="px-1.5 text-xs font-semibold">Tipo de tese</p>
          <p className="px-1.5 pb-1 text-[10px] text-muted-foreground">
            O padrão inclui teses elegíveis e deixa REPORTO fora do saldo.
          </p>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex w-full items-center justify-between rounded px-1.5 py-1.5 text-left text-xs hover:bg-muted"
          >
            <span className={!value ? "font-semibold text-primary" : undefined}>
              Todas elegíveis (sem REPORTO)
            </span>
          </button>
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => onChange(option.value)}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className={value === option.value ? "font-semibold text-primary" : undefined}>
                {option.label}
              </span>
              {option.value === "REPORTO" && (
                <Badge variant="outline" className="text-[9px]">fora do saldo padrão</Badge>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {option.clientes}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
