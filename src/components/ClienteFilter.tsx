import { useMemo, useState } from "react";
import { Building2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ClienteOpcao {
  id: string;
  empresa: string;
}

interface Props {
  clientes: ClienteOpcao[];
  /** `null` = todos os clientes. */
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
}

/** Filtro de um cliente específico nos painéis gerenciais, com busca por nome. */
export function ClienteFilter({ clientes, value, onChange, className }: Props) {
  const [aberto, setAberto] = useState(false);
  const ordenados = useMemo(
    () => [...clientes].sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR")),
    [clientes],
  );
  const atual = value ? ordenados.find((c) => c.id === value) : undefined;

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("max-w-[240px]", atual && "rounded-r-none")}>
            <Building2 className="h-3.5 w-3.5 mr-1 shrink-0" />
            <span className="truncate">{atual?.empresa ?? "Cliente"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Buscar cliente..." />
            <CommandList>
              <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
              <CommandGroup>
                {ordenados.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.empresa} ${c.id}`}
                    onSelect={() => {
                      onChange(c.id === value ? null : c.id);
                      setAberto(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", c.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{c.empresa}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {atual && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-l-none border-l-0 px-2"
          onClick={() => onChange(null)}
          aria-label="Limpar filtro de cliente"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
