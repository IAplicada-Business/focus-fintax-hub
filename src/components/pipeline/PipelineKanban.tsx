import { useMemo, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toastError } from "@/lib/handle-error";
import { AlertTriangle, ChevronRight, ChevronDown, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PIPELINE_STAGES, STAGE_MERGE_MAP, SEGMENTO_COLORS, SEGMENTO_LABELS, SCORE_CONFIG, getScoreLabel, formatCurrency, daysSince } from "@/lib/pipeline-constants";
import type { PipelineLead } from "@/pages/Pipeline";
import { useAuth } from "@/hooks/useAuth";
import { ConvertClientModal } from "./ConvertClientModal";
import { canEditLead, canDragInPipeline } from "@/lib/role-permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  leads: PipelineLead[];
  onLeadClick: (id: string) => void;
  onRefresh: () => void;
  exceptionLeadIds?: Set<string>;
}

export function PipelineKanban({ leads, onLeadClick, onRefresh, exceptionLeadIds = new Set() }: Props) {
  const { user, userRole } = useAuth();
  const [convertLead, setConvertLead] = useState<PipelineLead | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});
  const dragEnabled = canDragInPipeline(userRole);

  const toggleCollapse = (stage: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const effectiveLeads = useMemo(() => {
    if (Object.keys(optimisticMoves).length === 0) return leads;
    return leads.map((l) =>
      optimisticMoves[l.id] ? { ...l, status_funil: optimisticMoves[l.id] } : l
    );
  }, [leads, optimisticMoves]);

  const grouped = useMemo(() => {
    const map: Record<string, PipelineLead[]> = {};
    PIPELINE_STAGES.forEach((s) => (map[s.value] = []));
    effectiveLeads.forEach((l) => {
      const raw = l.status_funil || "novo";
      const stage = STAGE_MERGE_MAP[raw] || raw;
      if (map[stage]) map[stage].push(l);
      else map["novo"].push(l);
    });
    return map;
  }, [effectiveLeads]);

  const handleDragEnd = async (result: DropResult) => {
    if (!dragEnabled) return;
    if (!result.destination) return;
    const leadId = result.draggableId;
    const newStage = result.destination.droppableId;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const currentMapped = STAGE_MERGE_MAP[lead.status_funil] || lead.status_funil;
    if (currentMapped === newStage) return;

    if (newStage === "cliente_ativo") {
      setConvertLead(lead);
      return;
    }

    await moveLeadToStage(lead, newStage);
  };

  const moveLeadToStage = useCallback(async (lead: PipelineLead, newStage: string) => {
    const oldStage = lead.status_funil;

    setOptimisticMoves((prev) => ({ ...prev, [lead.id]: newStage }));

    const { error } = await supabase
      .from("leads")
      .update({ status_funil: newStage, status_funil_atualizado_em: new Date().toISOString() })
      .eq("id", lead.id);

    if (error) {
      setOptimisticMoves((prev) => { const next = { ...prev }; delete next[lead.id]; return next; });
      toastError(error, "Erro ao mover lead");
      return;
    }

    await supabase.from("lead_historico").insert({
      lead_id: lead.id,
      de_etapa: oldStage,
      para_etapa: newStage,
      criado_por: user?.id,
    });

    setOptimisticMoves((prev) => { const next = { ...prev }; delete next[lead.id]; return next; });
    onRefresh();
  }, [user?.id, onRefresh]);

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div role="region" aria-label="Pipeline de leads" className="flex gap-3 overflow-x-auto pb-4" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = grouped[stage.value] || [];
            const totalPotencial = stageLeads.reduce((s, l) => s + (l.relatorios_leads?.[0]?.estimativa_total_maxima || 0), 0);
            const isCollapsed = collapsedStages.has(stage.value);

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
                  <span className="text-xs text-muted-foreground font-medium">{stageLeads.length}</span>
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
                    aria-label={`${stage.label} — ${stageLeads.length} leads`}
                    className={`flex-shrink-0 w-[240px] rounded-lg border p-2 flex flex-col gap-2 transition-colors ${
                      snapshot.isDraggingOver ? "bg-primary/5 border-primary/30" : "bg-muted/30"
                    }`}
                  >
                    <div
                      className="px-1 py-1 cursor-pointer select-none flex items-center gap-1"
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(stage.value); }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex-1 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">{stage.label}</h3>
                        <span className="text-xs text-muted-foreground font-medium">{stageLeads.length}</span>
                      </div>
                    </div>
                    {totalPotencial > 0 && (
                      <p className="text-[10px] text-primary font-medium px-1 -mt-1">{formatCurrency(totalPotencial)}</p>
                    )}

                    <div className="flex-1 flex flex-col gap-2 min-h-[60px] overflow-y-auto">
                      {stageLeads.length === 0 && (
                        <EmptyState
                          icon={<Users className="w-5 h-5 text-[rgba(10,21,100,0.3)]" />}
                          title="Nenhum lead nesta etapa"
                          subtitle="Arraste leads para cá ou adicione um novo"
                        />
                      )}
                      {stageLeads.map((lead, index) => (
                        <LeadCard key={lead.id} lead={lead} index={index} onClick={() => onLeadClick(lead.id)} isException={exceptionLeadIds.has(lead.id)} userRole={userRole} isDragDisabled={!dragEnabled || !canEditLead(userRole, lead.status_funil)} />
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

      <ConvertClientModal lead={convertLead} onClose={() => setConvertLead(null)} onRefresh={onRefresh} />
    </>
  );
}

function LeadCard({ lead, index, onClick, isException, userRole, isDragDisabled }: { lead: PipelineLead; index: number; onClick: () => void; isException: boolean; userRole: string | null; isDragDisabled: boolean }) {
  const days = daysSince(lead.status_funil_atualizado_em || lead.criado_em);
  const isNew = lead.status_funil === "novo";
  const scoreLabel = getScoreLabel(lead.score_lead);
  const scoreConf = SCORE_CONFIG[scoreLabel];
  const potencialMax = lead.relatorios_leads?.[0]?.estimativa_total_maxima || 0;
  const isClienteAtivo = lead.status_funil === "cliente_ativo";
  const showTooltip = isClienteAtivo && userRole === "comercial";

  let borderClass = "";
  if (isNew && days > 3) borderClass = "border-l-4 border-l-destructive";
  else if (isNew && days > 1) borderClass = "border-l-4 border-l-orange-400";

  const card = (
    <Draggable draggableId={lead.id} index={index} isDragDisabled={isDragDisabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          role="listitem"
          aria-label={`${lead.empresa} — Score ${scoreLabel}, ${days} dias`}
          aria-roledescription="card arrastável"
          onClick={onClick}
          className={`bg-card rounded-md border p-2 cursor-pointer hover:shadow-md transition-shadow ${borderClass} ${
            snapshot.isDragging ? "shadow-lg rotate-1" : ""
          } ${isDragDisabled ? "cursor-default" : ""}`}
        >
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-bold text-foreground leading-tight truncate flex-1">{lead.empresa}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreConf.color} shrink-0`}>
              {scoreLabel}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${SEGMENTO_COLORS[lead.segmento] || "bg-muted text-muted-foreground"}`}>
              {SEGMENTO_LABELS[lead.segmento] || lead.segmento}
            </span>
            {isException && <AlertTriangle className="h-3 w-3 text-amber-500" />}
          </div>

          <div className="mt-1 flex items-center justify-between">
            <span className={`text-[10px] font-bold ${potencialMax >= 500_000 ? "text-green-600" : "text-muted-foreground"}`}>
              {potencialMax > 0 ? formatCurrency(potencialMax) : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground">· {days}d</span>
          </div>
        </div>
      )}
    </Draggable>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{card}</TooltipTrigger>
          <TooltipContent><p>Gerenciado pelo time operacional</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return card;
}
