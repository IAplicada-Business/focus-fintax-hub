import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { AlertTriangle, ChevronRight, ChevronDown, Building2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import {
  ESTEIRA_STAGES,
  ORIGEM_LABELS,
  isEstagioEsteira,
  isClienteAtrasadoSla,
  slaDiasDaEtapa,
} from "@/lib/esteira-constants";
import {
  ramosVisiveisNoKanban,
  TIPO_RECUPERACAO_BADGE,
  TIPO_RECUPERACAO_LABEL,
} from "@/lib/tipo-recuperacao";
import { useUpdateEstagioEsteira } from "@/hooks/data/useEsteira";
import type { EsteiraCliente } from "@/services/esteiraService";

export interface EsteiraKanbanStage {
  value: string;
  label: string;
}

interface Props {
  clientes: EsteiraCliente[];
  onClienteClick?: (id: string) => void;
  /**
   * Colunas a renderizar, na ordem desejada. Default = ESTEIRA_STAGES (7
   * etapas fixas) — usado só como fallback/teste; a tela real (Esteira.tsx)
   * passa a lista derivada de `esteira_sla_config` (ordem/ativo editáveis).
   */
  stages?: readonly EsteiraKanbanStage[];
}

export function EsteiraKanban({ clientes, onClienteClick, stages = ESTEIRA_STAGES }: Props) {
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});
  const updateEstagio = useUpdateEstagioEsteira();

  const toggleCollapse = (stage: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const effectiveClientes = useMemo(() => {
    if (Object.keys(optimisticMoves).length === 0) return clientes;
    return clientes.map((c) =>
      optimisticMoves[c.id] ? { ...c, estagio_esteira: optimisticMoves[c.id] } : c,
    );
  }, [clientes, optimisticMoves]);

  const grouped = useMemo(() => {
    const map: Record<string, EsteiraCliente[]> = {};
    stages.forEach((s) => (map[s.value] = []));
    effectiveClientes.forEach((c) => {
      const stage = c.estagio_esteira || "triagem";
      if (map[stage]) map[stage].push(c);
      else if (map["triagem"]) map["triagem"].push(c);
    });
    return map;
  }, [effectiveClientes, stages]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const clienteId = result.draggableId;
    const newStage = result.destination.droppableId;
    if (!isEstagioEsteira(newStage)) return;
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente || cliente.estagio_esteira === newStage) return;

    setOptimisticMoves((prev) => ({ ...prev, [clienteId]: newStage }));
    try {
      await updateEstagio.mutateAsync({ clienteId, estagio: newStage });
    } finally {
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[clienteId];
        return next;
      });
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        role="region"
        aria-label="Esteira administrativa"
        className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-4"
      >
        {stages.map((stage) => {
          const stageClientes = grouped[stage.value] || [];
          const isCollapsed = collapsedStages.has(stage.value);
          const atrasadosNaEtapa = stageClientes.filter((c) =>
            typeof c.atrasado === "boolean"
              ? c.atrasado
              : isClienteAtrasadoSla(c.estagio_esteira, c.dias_na_etapa ?? 0),
          ).length;

          if (isCollapsed) {
            return (
              <div
                key={stage.value}
                onClick={() => toggleCollapse(stage.value)}
                className="flex-shrink-0 w-[44px] rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors flex flex-col items-center py-3 gap-2"
              >
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wide [writing-mode:vertical-lr] rotate-180">
                  {stage.label}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {stageClientes.length}
                </span>
                {atrasadosNaEtapa > 0 && (
                  <span className="text-[10px] font-bold text-destructive">{atrasadosNaEtapa}</span>
                )}
              </div>
            );
          }

          return (
            <Droppable key={stage.value} droppableId={stage.value}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  role="list"
                  aria-label={`${stage.label} — ${stageClientes.length} clientes`}
                  className={`flex-1 min-w-[240px] rounded-lg border p-2 flex flex-col gap-2 transition-colors ${
                    snapshot.isDraggingOver ? "bg-primary/5 border-primary/30" : "bg-muted/30"
                  }`}
                >
                  <div
                    className="px-1 py-1 cursor-pointer select-none flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(stage.value);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="flex-1 flex items-center justify-between gap-1">
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">
                        {stage.label}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        {atrasadosNaEtapa > 0 && (
                          <span
                            className="text-[10px] font-bold text-destructive"
                            title={`${atrasadosNaEtapa} acima do SLA`}
                          >
                            {atrasadosNaEtapa} SLA
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground font-medium">
                          {stageClientes.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-2 min-h-[60px] overflow-y-auto">
                    {stageClientes.length === 0 && (
                      <EmptyState
                        icon={<Building2 className="w-5 h-5 text-[rgba(10,21,100,0.3)]" />}
                        title="Nenhum cliente nesta etapa"
                        subtitle="Arraste clientes para cá"
                      />
                    )}
                    {stageClientes.map((cliente, index) => (
                      <ClienteCard
                        key={cliente.id}
                        cliente={cliente}
                        index={index}
                        onClick={() => onClienteClick?.(cliente.id)}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}

function ClienteCard({
  cliente,
  index,
  onClick,
}: {
  cliente: EsteiraCliente;
  index: number;
  onClick: () => void;
}) {
  const dias = cliente.dias_na_etapa ?? 0;
  const sla = cliente.sla_dias ?? slaDiasDaEtapa(cliente.estagio_esteira);
  const atrasado =
    typeof cliente.atrasado === "boolean"
      ? cliente.atrasado
      : isClienteAtrasadoSla(cliente.estagio_esteira, dias);
  const ramos = ramosVisiveisNoKanban(cliente);

  let borderClass = "";
  if (atrasado) borderClass = "border-l-4 border-l-destructive";
  else if (sla != null && dias > Math.max(0, sla - 1) && sla > 1) {
    borderClass = "border-l-4 border-l-orange-400";
  }

  return (
    <Draggable draggableId={cliente.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          role="listitem"
          aria-label={`${cliente.empresa} — ${dias} dias na etapa${atrasado ? ", atrasado no SLA" : ""}`}
          aria-roledescription="card arrastável"
          onClick={onClick}
          className={`bg-card rounded-md border p-2 cursor-pointer hover:shadow-md transition-shadow ${borderClass} ${
            snapshot.isDragging ? "shadow-lg rotate-1" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs font-bold text-foreground leading-tight truncate">
              {cliente.empresa}
            </p>
            {atrasado && (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {ORIGEM_LABELS[cliente.origem] || cliente.origem}
            </span>
            {ramos.map((ramo) => (
              <span
                key={ramo}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${TIPO_RECUPERACAO_BADGE[ramo]}`}
              >
                {TIPO_RECUPERACAO_LABEL[ramo]}
              </span>
            ))}
            {atrasado && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">
                SLA
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground truncate">
              {cliente.responsavel_nome || "Sem responsável"}
            </span>
            <span
              className={`text-[10px] shrink-0 ${
                atrasado ? "text-destructive font-semibold" : "text-muted-foreground"
              }`}
            >
              · {dias}d{sla != null ? `/${sla}d` : ""}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
