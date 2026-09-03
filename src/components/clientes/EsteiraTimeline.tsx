import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { KanbanSquare } from "lucide-react";
import { ResponsavelAvatar } from "@/components/esteira/ResponsavelAvatar";
import { useEsteiraHistorico, useEsteiraSlaConfig } from "@/hooks/data/useEsteira";
import { cn } from "@/lib/utils";

interface Props {
  clienteId: string;
}

const ORIGEM_LABEL: Record<string, string> = {
  importacao: "importado",
  reset_sla: "SLA reiniciado",
};

function duracaoDias(entrou: string, saiu: string | null): number {
  const fim = saiu ? new Date(saiu).getTime() : Date.now();
  return Math.max(0, Math.floor((fim - new Date(entrou).getTime()) / 86_400_000));
}

/**
 * Linha do tempo do cliente na esteira: cada permanência com entrada, saída,
 * duração e quem era o responsável. Vive no drawer "Dados do cliente", acima
 * do histórico geral — não é um modal paralelo.
 */
export function EsteiraTimeline({ clienteId }: Props) {
  const { data, isLoading } = useEsteiraHistorico(clienteId);
  const { data: slaConfig } = useEsteiraSlaConfig();
  const labelEtapa = useMemo(() => {
    const m = new Map((slaConfig ?? []).map((r) => [r.estagio as string, r.label]));
    return (e: string) => m.get(e) ?? e;
  }, [slaConfig]);

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <KanbanSquare className="h-3.5 w-3.5" />
        Linha do tempo na esteira
      </h3>
      <ol className="space-y-2">
        {data.map((h, i) => {
          const atual = h.saiu_em === null;
          const dias = duracaoDias(h.entrou_em, h.saiu_em);
          const origem = ORIGEM_LABEL[h.origem];
          return (
            <li key={h.id} className="flex items-start gap-2">
              <div className="mt-1 flex flex-col items-center">
                <div className={cn("h-2 w-2 rounded-full", atual ? "bg-primary" : "bg-muted-foreground/50")} />
                {i < data.length - 1 && <div className="mt-1 h-full min-h-[24px] w-px bg-border" />}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-xs", atual ? "font-semibold text-foreground" : "text-foreground")}>
                    {labelEtapa(h.estagio)}
                    {atual && <span className="ml-1 text-[10px] font-medium text-primary">atual</span>}
                  </p>
                  <span className={cn("shrink-0 text-[10px] tabular-nums", origem ? "text-muted-foreground/70 line-through" : "text-muted-foreground")} title={origem ? "Duração não conta nas médias" : undefined}>
                    {dias}d
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(h.entrou_em), "dd/MM/yy", { locale: ptBR })}
                  {" → "}
                  {h.saiu_em ? format(new Date(h.saiu_em), "dd/MM/yy", { locale: ptBR }) : "hoje"}
                  {origem && <span className="ml-1 rounded bg-muted px-1 text-[9px] uppercase tracking-wide">{origem}</span>}
                </p>
                <ResponsavelAvatar nome={h.responsavel_nome} size="xs" comNome className="mt-1 [&>span]:text-[10px]" />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
