import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listStatusCompensacaoRows } from "@/services/clientesService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter } from "lucide-react";
import {
  STATUS_COMPENSACAO_VALUES,
  buildRamoFlagsPorCliente,
  countByRamo,
  countByStatus,
  makeRamoFilterPredicate,
  makeStatusFilterPredicate,
  normalizarStatusCompensacao,
  type StatusCompensacao,
} from "@/lib/gerencial-filters";
import {
  RAMO_GERENCIAL_FILTROS,
  type RamoGerencialFiltro,
} from "@/lib/esteira-acompanhamento";

// -----------------------------------------------------------------------------
// Enum + config visual
// -----------------------------------------------------------------------------

export {
  STATUS_COMPENSACAO_VALUES,
  buildRamoFlagsPorCliente,
  countByRamo,
  countByStatus,
  makeRamoFilterPredicate,
  makeStatusFilterPredicate,
  normalizarStatusCompensacao,
};
export type { StatusCompensacao, RamoGerencialFiltro };

export const STATUS_COMPENSACAO_LABELS: Record<StatusCompensacao, string> = {
  compensando: "Compensando",
  prevista: "Prevista",
  reporto: "Possíveis futuros",
  encerrado: "Encerrado",
  sem_operacao: "Pendente / sem operação",
};

export const STATUS_COMPENSACAO_COLORS: Record<StatusCompensacao, string> = {
  compensando: "bg-emerald-100 text-emerald-800 border-emerald-200",
  prevista: "bg-blue-100 text-blue-800 border-blue-200",
  reporto: "bg-slate-100 text-slate-700 border-slate-200",
  encerrado: "bg-slate-100 text-slate-700 border-slate-200",
  sem_operacao: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

// -----------------------------------------------------------------------------
// Hook — puxa v_clientes_status_compensacao
// -----------------------------------------------------------------------------

export function useStatusCompensacao() {
  const { data, isPending } = useQuery({
    queryKey: ["catalog", "status_compensacao"],
    queryFn: listStatusCompensacaoRows,
    staleTime: 60_000,
  });

  const statusMap = useMemo(() => {
    const m = new Map<string, StatusCompensacao>();
    for (const row of data ?? []) {
      m.set(row.cliente_id, normalizarStatusCompensacao(row));
    }
    return m;
  }, [data]);

  const ramosMap = useMemo(
    () => buildRamoFlagsPorCliente((data ?? []).flatMap((row) => row.processos ?? [])),
    [data],
  );

  return { statusMap, ramosMap, loading: isPending && !data };
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

interface TipoProps {
  ramo: RamoGerencialFiltro;
  onChange: (next: RamoGerencialFiltro) => void;
  counts?: Partial<Record<RamoGerencialFiltro, number>>;
  className?: string;
}

export function TipoRecuperacaoFilter({ ramo, onChange, counts, className }: TipoProps) {
  const atual = RAMO_GERENCIAL_FILTROS.find((item) => item.value === ramo);
  const label = ramo === "todas" ? "Tipo de recuperação" : atual?.label ?? ramo;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Filter className="h-3.5 w-3.5 mr-1" />
          {label}
          {ramo !== "todas" && <Badge className="ml-2 text-[10px] h-4 px-1">{counts?.[ramo] ?? 0}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold">Tipo / ramo de recuperação</p>
              <p className="text-[10px] text-muted-foreground">Administrativo inclui compensação e ressarcimento.</p>
            </div>
            <button
              className="text-[11px] text-primary underline"
              onClick={() => onChange("todas")}
            >
              Todos
            </button>
          </div>
          {RAMO_GERENCIAL_FILTROS.filter((item) => item.value !== "todas").map((item) => (
            <label key={item.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted rounded px-1.5 py-1">
              <Checkbox checked={ramo === item.value} onCheckedChange={() => onChange(item.value)} />
              <span>{item.label}</span>
              {typeof counts?.[item.value] === "number" && (
                <span className="ml-auto text-[11px] text-muted-foreground">{counts[item.value]}</span>
              )}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
