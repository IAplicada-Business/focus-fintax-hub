import { useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { AlertTriangle, Building2, ChevronsLeft, ChevronsRight, Clock, UserX } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ESTEIRA_STAGES, ORIGEM_LABELS, isEstagioEsteira } from "@/lib/esteira-constants";
import { TIPO_RECUPERACAO_BADGE, TIPO_RECUPERACAO_LABEL } from "@/lib/tipo-recuperacao";
import { ramosDoCliente, type SlaInfo } from "@/lib/esteira-acompanhamento";
import {
  ESTEIRA_COLAPSO_KEY,
  agruparEsteiraPorEtapa,
  ordenarCardsEsteira,
  resumoEtapaEsteira,
  slaDoClienteEsteira,
} from "@/lib/esteira-board";
import { lerColapsadas, salvarColapsadas } from "@/lib/pipeline-board";
import { ResponsavelAvatar } from "@/components/esteira/ResponsavelAvatar";
import { useUpdateEstagioEsteira } from "@/hooks/data/useEsteira";
import type { EsteiraCliente } from "@/services/esteiraService";
import { cn } from "@/lib/utils";

export interface EsteiraKanbanStage {
  value: string;
  label: string;
  /** Meta da etapa em dias (config); usada quando o cliente não traz `sla_dias`. */
  sla_dias?: number | null;
}

interface Props {
  clientes: EsteiraCliente[];
  onClienteClick?: (id: string) => void;
  /**
   * Colunas a renderizar, na ordem desejada. Default = ESTEIRA_STAGES (etapas
   * fixas) — usado só como fallback/teste; a tela real passa a lista derivada
   * de `esteira_sla_config` (ordem/ativo editáveis).
   */
  stages?: readonly EsteiraKanbanStage[];
  /** Etapa vinda de `?etapa=` (dashboard): abre expandida, destacada e à vista. */
  focusStage?: string | null;
  /** Altura do quadro; a tela cheia usa flex-1 e o dashboard passa uma fixa. */
  className?: string;
}

/**
 * Quadro da Esteira Administrativa no mesmo padrão do Pipeline: as colunas
 * dividem a largura disponível, qualquer etapa pode ser recolhida (escolha
 * salva) e os cards trazem SLA, ramos, responsável e teses.
 */
export function EsteiraKanban({ clientes, onClienteClick, stages = ESTEIRA_STAGES, focusStage, className }: Props) {
  const [colapsadas, setColapsadas] = useState<Set<string>>(() => lerColapsadas(typeof localStorage !== "undefined" ? localStorage : null, ESTEIRA_COLAPSO_KEY));
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});
  const updateEstagio = useUpdateEstagioEsteira();
  const focusRef = useRef<HTMLDivElement | null>(null);
  const jaRolou = useRef(false);

  useEffect(() => {
    salvarColapsadas(colapsadas, typeof localStorage !== "undefined" ? localStorage : null, ESTEIRA_COLAPSO_KEY);
  }, [colapsadas]);

  // Uma etapa recolhida em visita anterior engoliria o destino do link do
  // dashboard ("clique para abrir a etapa"); expande e traz pra vista uma vez.
  useEffect(() => {
    if (!focusStage) return;
    setColapsadas((prev) => {
      if (!prev.has(focusStage)) return prev;
      const next = new Set(prev);
      next.delete(focusStage);
      return next;
    });
    if (focusRef.current && !jaRolou.current) {
      jaRolou.current = true;
      focusRef.current.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [focusStage, colapsadas]);

  const toggleCollapse = (stage: string) => {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const effectiveClientes = useMemo(() => {
    if (Object.keys(optimisticMoves).length === 0) return clientes;
    return clientes.map((c) => (optimisticMoves[c.id] ? { ...c, estagio_esteira: optimisticMoves[c.id] } : c));
  }, [clientes, optimisticMoves]);

  const grouped = useMemo(() => agruparEsteiraPorEtapa(effectiveClientes, stages), [effectiveClientes, stages]);

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

  // Sem coluna nenhuma o quadro seria uma faixa vazia — sem isso o usuário vê
  // a tela "sem kanban" e não tem como saber que é config de etapa.
  if (stages.length === 0) {
    return (
      <div role="region" aria-label="Esteira administrativa" className={cn("flex-1 min-h-0 flex items-center justify-center", className)}>
        <EmptyState
          icon={<Building2 className="w-5 h-5 text-ink-35" />}
          title="Nenhuma etapa ativa na esteira"
          subtitle="Ative pelo menos uma etapa em Configurar SLA para o quadro aparecer"
        />
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div role="region" aria-label="Esteira administrativa" className={cn("flex-1 min-h-0 flex gap-3 overflow-x-auto pb-3 -mx-1 px-1", className)}>
        {stages.map((stage) => {
          const stageClientes = ordenarCardsEsteira(grouped[stage.value] || [], stage.sla_dias);
          const resumo = resumoEtapaEsteira(stageClientes, stage.sla_dias);
          const isCollapsed = colapsadas.has(stage.value);
          const terminal = stage.value === "concluido" || stage.value === "devolutiva_cliente";
          const emFoco = focusStage === stage.value;

          if (isCollapsed) {
            return (
              <button
                key={stage.value}
                type="button"
                onClick={() => toggleCollapse(stage.value)}
                title={`Expandir ${stage.label}`}
                className="flex-shrink-0 w-[52px] rounded-2xl border border-ink-06 bg-white/70 hover:bg-white transition-colors flex flex-col items-center py-3 gap-2 text-left"
              >
                <ChevronsRight className="h-4 w-4 text-ink-35" />
                <span className="font-display text-lg font-extrabold text-navy tabular-nums leading-none">{resumo.total}</span>
                {resumo.atrasados > 0 && <span className="text-[10px] font-bold text-dash-red tabular-nums">{resumo.atrasados}!</span>}
                <span className="text-[10px] font-bold text-ink-60 uppercase tracking-[1px] [writing-mode:vertical-lr] rotate-180 mt-1 whitespace-nowrap">{stage.label}</span>
              </button>
            );
          }

          return (
            <Droppable key={stage.value} droppableId={stage.value}>
              {(provided, snapshot) => (
                <div
                  ref={(node: HTMLDivElement | null) => {
                    provided.innerRef(node);
                    if (emFoco) focusRef.current = node;
                  }}
                  {...provided.droppableProps}
                  role="list"
                  aria-label={`${stage.label} — ${resumo.total} clientes`}
                  className={cn(
                    "flex-1 min-w-[250px] max-w-[420px] rounded-2xl border flex flex-col transition-colors",
                    snapshot.isDraggingOver ? "bg-gold/[0.06] border-gold/50" : terminal ? "bg-ink-03 border-ink-06" : "bg-white/60 border-ink-06",
                    emFoco && !snapshot.isDraggingOver && "ring-2 ring-gold/45 border-gold/50",
                  )}
                >
                  <div className="px-3 pt-3 pb-2 border-b border-ink-06">
                    <div className="flex items-center gap-2">
                      <h3 className="flex-1 text-[11px] font-bold text-navy uppercase tracking-[1px] truncate">{stage.label}</h3>
                      <span className="font-display text-sm font-extrabold text-navy tabular-nums">{resumo.total}</span>
                      <button
                        type="button"
                        onClick={() => toggleCollapse(stage.value)}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-ink-35 hover:text-navy hover:bg-ink-06 transition-colors"
                        title={`Recolher ${stage.label}`}
                        aria-label={`Recolher ${stage.label}`}
                      >
                        <ChevronsLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums">
                      <span className="text-ink-35">{stage.sla_dias != null ? `meta ${stage.sla_dias}d` : "sem meta"}</span>
                      {resumo.semResponsavel > 0 && (
                        <span className="inline-flex items-center gap-1 text-dash-amber font-semibold" title="Clientes sem responsável">
                          <UserX className="h-3 w-3" /> {resumo.semResponsavel}
                        </span>
                      )}
                      {resumo.atrasados > 0 && <span className="ml-auto inline-flex items-center gap-1 font-bold text-dash-red"><Clock className="h-3 w-3" /> {resumo.atrasados} atrasado{resumo.atrasados > 1 ? "s" : ""}</span>}
                      {resumo.atrasados === 0 && resumo.vencendo > 0 && <span className="ml-auto inline-flex items-center gap-1 font-bold text-dash-amber"><Clock className="h-3 w-3" /> {resumo.vencendo} vencendo</span>}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-2 p-2 min-h-[60px] overflow-y-auto">
                    {stageClientes.length === 0 && (
                      <EmptyState icon={<Building2 className="w-5 h-5 text-ink-35" />} title="Nenhum cliente nesta etapa" subtitle="Arraste clientes para cá" />
                    )}
                    {stageClientes.map((cliente, index) => (
                      <ClienteCard
                        key={cliente.id}
                        cliente={cliente}
                        index={index}
                        sla={slaDoClienteEsteira(cliente, stage.sla_dias)}
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

const SLA_BADGE: Record<SlaInfo["status"], string> = {
  estourado: "bg-dash-red/10 text-dash-red border-dash-red/25",
  atencao: "bg-dash-amber/10 text-dash-amber border-dash-amber/25",
  no_prazo: "bg-dash-green/10 text-dash-green border-dash-green/20",
  sem_sla: "bg-ink-06 text-ink-35 border-transparent",
};

function ClienteCard({ cliente, index, sla, onClick }: { cliente: EsteiraCliente; index: number; sla: SlaInfo; onClick: () => void }) {
  const ramos = ramosDoCliente(cliente);
  const atrasado = sla.status === "estourado";

  return (
    <Draggable draggableId={cliente.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          role="listitem"
          aria-label={`${cliente.empresa} — ${sla.dias} dias na etapa${atrasado ? ", atrasado no SLA" : ""}`}
          aria-roledescription="card arrastável"
          onClick={onClick}
          className={cn(
            "group relative bg-white rounded-xl border p-3 cursor-pointer transition-all hover:shadow-soft-hover hover:-translate-y-px",
            atrasado ? "border-dash-red/30" : sla.status === "atencao" ? "border-dash-amber/30" : "border-ink-06",
            snapshot.isDragging && "shadow-lg rotate-1 border-gold",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-bold text-navy leading-tight truncate flex-1">{cliente.empresa}</p>
            {atrasado && <AlertTriangle className="h-3.5 w-3.5 text-dash-red shrink-0" aria-hidden />}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-06 text-ink-60">{ORIGEM_LABELS[cliente.origem] || cliente.origem}</span>
            {ramos.map((ramo) => (
              <span key={ramo} className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", TIPO_RECUPERACAO_BADGE[ramo])}>
                {TIPO_RECUPERACAO_LABEL[ramo]}
              </span>
            ))}
            {(cliente.teses_assinadas ?? 0) > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold-deep font-semibold" title={`${cliente.teses_assinadas} teses assinadas`}>
                {cliente.teses_assinadas} teses
              </span>
            )}
            {cliente.estagio_esteira === "nova_abordagem" && (cliente.tentativas_abordagem ?? 0) > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 font-semibold">{cliente.tentativas_abordagem}ª tentativa</span>
            )}
          </div>

          {atrasado && (
            <div
              className={cn(
                "mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-snug",
                cliente.motivo_parada
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-dash-red/20 bg-dash-red/5 text-dash-red",
              )}
              title={cliente.motivo_parada || "Motivo da parada ainda não informado"}
            >
              <span className="font-bold">Motivo: </span>
              <span className="line-clamp-2">
                {cliente.motivo_parada || "não informado — abra o cliente para preencher"}
              </span>
            </div>
          )}

          <div className="mt-2.5 pt-2 border-t border-ink-06 flex items-center justify-between gap-2">
            <ResponsavelAvatar nome={cliente.responsavel_nome} size="xs" comNome className="min-w-0 [&>span]:text-[10px]" />
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[2px] rounded-full border tabular-nums shrink-0", SLA_BADGE[sla.status])} title={sla.sla != null ? `Meta da etapa: ${sla.sla} dias` : "Etapa sem meta"}>
              <Clock className="h-3 w-3" />
              {sla.dias}d{atrasado && sla.restante != null ? ` · +${Math.abs(sla.restante)}` : ""}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
