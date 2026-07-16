import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter } from "lucide-react";

// -----------------------------------------------------------------------------
// Enum + config visual
// -----------------------------------------------------------------------------

export const STATUS_COMPENSACAO_VALUES = [
  "compensando",
  "prevista",
  "reporto",
  "judicial",
  "encerrado",
  "sem_operacao",
] as const;

export type StatusCompensacao = (typeof STATUS_COMPENSACAO_VALUES)[number];

export const STATUS_COMPENSACAO_LABELS: Record<StatusCompensacao, string> = {
  compensando: "Compensando",
  prevista: "Prevista",
  reporto: "Possíveis futuros",
  judicial: "Judicial",
  encerrado: "Encerrado",
  sem_operacao: "Sem operação",
};

export const STATUS_COMPENSACAO_COLORS: Record<StatusCompensacao, string> = {
  compensando: "bg-emerald-100 text-emerald-800 border-emerald-200",
  prevista: "bg-blue-100 text-blue-800 border-blue-200",
  reporto: "bg-slate-100 text-slate-700 border-slate-200",
  judicial: "bg-rose-100 text-rose-800 border-rose-200",
  encerrado: "bg-slate-100 text-slate-700 border-slate-200",
  sem_operacao: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

// -----------------------------------------------------------------------------
// Hook — puxa v_clientes_status_compensacao
// -----------------------------------------------------------------------------

export function useStatusCompensacao() {
  const [statusMap, setStatusMap] = useState<Map<string, StatusCompensacao>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("v_clientes_status_compensacao")
        .select("cliente_id, status_principal");
      if (error) {
        setStatusMap(new Map());
        setLoading(false);
        return;
      }
      const m = new Map<string, StatusCompensacao>();
      for (const row of (data || []) as { cliente_id: string; status_principal: StatusCompensacao }[]) {
        m.set(row.cliente_id, row.status_principal);
      }
      setStatusMap(m);
      setLoading(false);
    };
    fetch();
  }, []);

  return { statusMap, loading };
}

// -----------------------------------------------------------------------------
// Componente reutilizável
// -----------------------------------------------------------------------------

interface Props {
  selectedStatuses: Set<StatusCompensacao>;
  onChange: (next: Set<StatusCompensacao>) => void;
  /** Contagens por status — a UI ainda funciona sem, só não mostra os números */
  counts?: Partial<Record<StatusCompensacao, number>>;
  className?: string;
}

export function StatusCompensacaoFilter({ selectedStatuses, onChange, counts, className }: Props) {
  const allSelected = selectedStatuses.size === 0 || selectedStatuses.size === STATUS_COMPENSACAO_VALUES.length;
  const label = allSelected ? "Status compensação" : `${selectedStatuses.size} status`;

  const toggle = (s: StatusCompensacao) => {
    const next = new Set(selectedStatuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange(next);
  };

  const setAll = (v: boolean) => {
    onChange(v ? new Set(STATUS_COMPENSACAO_VALUES) : new Set());
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Filter className="h-3.5 w-3.5 mr-1" />
          {label}
          {!allSelected && (
            <Badge className="ml-2 text-[10px] h-4 px-1">{selectedStatuses.size}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">Status de compensação</p>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] text-primary underline"
                onClick={() => setAll(true)}
              >
                Todos
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                className="text-[11px] text-muted-foreground underline"
                onClick={() => setAll(false)}
              >
                Nenhum
              </button>
            </div>
          </div>
          {STATUS_COMPENSACAO_VALUES.map((s) => {
            const active = selectedStatuses.has(s);
            const n = counts?.[s];
            return (
              <label
                key={s}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted rounded px-1.5 py-1"
              >
                <Checkbox checked={active} onCheckedChange={() => toggle(s)} />
                <Badge
                  variant="outline"
                  className={`${STATUS_COMPENSACAO_COLORS[s]} text-[10px]`}
                >
                  {STATUS_COMPENSACAO_LABELS[s]}
                </Badge>
                {typeof n === "number" && (
                  <span className="ml-auto text-[11px] text-muted-foreground">{n}</span>
                )}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Utilitário: dado um set de status selecionados e um Map<cliente_id, status>,
 * retorna um predicado pra filtrar arrays de clientes/leads. */
export function makeStatusFilterPredicate(
  selected: Set<StatusCompensacao>,
  statusMap: Map<string, StatusCompensacao>
) {
  // Selection vazia OU total = sem filtro (mostra tudo)
  const allOrNone = selected.size === 0 || selected.size === STATUS_COMPENSACAO_VALUES.length;
  return (clienteId: string | null | undefined) => {
    if (allOrNone) return true;
    if (!clienteId) return selected.has("sem_operacao");
    const s = statusMap.get(clienteId);
    return s ? selected.has(s) : selected.has("sem_operacao");
  };
}

/** Utilitário: conta clientes por status pra alimentar o Popover. */
export function countByStatus(
  ids: string[],
  statusMap: Map<string, StatusCompensacao>
): Record<StatusCompensacao, number> {
  const counts: Record<StatusCompensacao, number> = {
    compensando: 0,
    prevista: 0,
    reporto: 0,
    judicial: 0,
    encerrado: 0,
    sem_operacao: 0,
  };
  for (const id of ids) {
    const s = statusMap.get(id) ?? "sem_operacao";
    counts[s]++;
  }
  return counts;
}
