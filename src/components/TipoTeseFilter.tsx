import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter } from "lucide-react";
import type { TipoTeseFiltro, TipoTeseOpcao } from "@/lib/tese-filter";
import { teseFiltroAtivo } from "@/lib/tese-filter";

interface Props {
  value: TipoTeseFiltro;
  onChange: (value: TipoTeseFiltro) => void;
  options: TipoTeseOpcao[];
  className?: string;
}

/**
 * Seletor de teses: nenhuma, uma, várias ou todas.
 * Conjunto vazio = todas (sem texto de "elegíveis" / "saldo padrão").
 */
export function TipoTeseFilter({ value, onChange, options, className }: Props) {
  const ativo = teseFiltroAtivo(value);
  const selecionadas = new Set(value);
  const label = !ativo
    ? "Teses"
    : value.length === 1
      ? options.find((option) => option.value === value[0])?.label ?? "1 tese"
      : `${value.length} teses`;

  const toggle = (codigo: string) => {
    const next = new Set(selecionadas);
    if (next.has(codigo)) next.delete(codigo);
    else next.add(codigo);
    onChange([...next]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className} aria-label="Filtrar por teses">
          <Filter className="mr-1 h-3.5 w-3.5" />
          <span className="max-w-[180px] truncate">{label}</span>
          {ativo && <Badge className="ml-2 h-4 px-1 text-[10px]">{value.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold">Filtrar por tese</p>
          <button
            type="button"
            className="text-[11px] text-primary underline"
            onClick={() => onChange([])}
          >
            Todas
          </button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted">
            <Checkbox
              checked={!ativo}
              aria-label="Todas as teses"
              onCheckedChange={() => onChange([])}
            />
            <span className="font-medium">Todas as teses</span>
          </label>
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted"
            >
              <Checkbox
                checked={selecionadas.has(option.value)}
                aria-label={option.label}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="text-[11px] text-muted-foreground">{option.clientes}</span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">Nenhuma tese cadastrada.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
