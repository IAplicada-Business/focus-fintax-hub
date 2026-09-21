import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/handle-error";
import { AlertTriangle, Bot, ChevronsLeft, ChevronsRight, Clock, MessageCircle, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PIPELINE_STAGES, SEGMENTO_COLORS, SEGMENTO_LABELS, SCORE_CONFIG, getScoreLabel, formatCurrency } from "@/lib/pipeline-constants";
import { ORIGEM_LEAD_LABEL } from "@/lib/comercial-analytics";
import {
  agruparPorEtapa,
  conversaDoLead,
  estadoConversa,
  indexarConversas,
  lerColapsadas,
  resumoColuna,
  salvarColapsadas,
  slaDoLead,
  type EstadoConversa,
} from "@/lib/pipeline-board";
import type { PipelineSlaConfigRow } from "@/lib/pipeline-sla";
import type { SlaInfo } from "@/lib/esteira-acompanhamento";
import type { InboxConversa } from "@/services/atendimentoService";
import type { PipelineLead } from "@/pages/Pipeline";
import { useAuth } from "@/hooks/useAuth";
import { ConvertClientModal } from "./ConvertClientModal";
import { funilEntraNaEsteira } from "@/lib/handoff-funil-esteira";
import { canEditLead, canDragInPipeline } from "@/lib/role-permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  leads: PipelineLead[];
  onLeadClick: (id: string) => void;
  onRefresh: () => void;
  exceptionLeadIds?: Set<string>;
  /** Metas por etapa (`pipeline_sla_config`); sem elas o card não mostra SLA. */
  slaConfig?: PipelineSlaConfigRow[];
  /** Inbox do atendimento para o indicador de conversa nos cards. */
  conversas?: InboxConversa[];
  /** Etapa a destacar (vinda de `?etapa=` do Dashboard). */
  etapaDestaque?: string | null;
  /** Controle externo das colunas recolhidas (persistido). */
  colapsadas: Set<string>;
  onToggleColapso: (stage: string) => void;
}

export { lerColapsadas, salvarColapsadas };

/**
 * Quadro do pipeline. As colunas dividem a largura disponível (com mínimo
 * confortável) em vez de rolar em 240px fixos; qualquer etapa pode ser
 * recolhida para dar espaço às outras, e a escolha fica salva.
 */
export function PipelineKanban({ leads, onLeadClick, onRefresh, exceptionLeadIds = new Set(), slaConfig = [], conversas = [], etapaDestaque, colapsadas, onToggleColapso }: Props) {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [convertLead, setConvertLead] = useState<PipelineLead | null>(null);
  const [convertParaEtapa, setConvertParaEtapa] = useState("triagem");
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});
  const dragEnabled = canDragInPipeline(userRole);
  const colunaRefs = useRef<Record<string, HTMLElement | null>>({});

  const slaPorEtapa = useMemo(() => new Map(slaConfig.map((c) => [c.etapa as string, c.sla_dias])), [slaConfig]);
  const indiceConversas = useMemo(() => indexarConversas(conversas), [conversas]);

  const effectiveLeads = useMemo(() => {
    if (Object.keys(optimisticMoves).length === 0) return leads;
    return leads.map((l) => (optimisticMoves[l.id] ? { ...l, status_funil: optimisticMoves[l.id] } : l));
  }, [leads, optimisticMoves]);

  const grouped = useMemo(
    () => agruparPorEtapa(effectiveLeads.map((l) => ({ ...l, potencial: l.relatorios_leads?.[0]?.estimativa_total_maxima ?? 0 })), PIPELINE_STAGES),
    [effectiveLeads],
  );

  useEffect(() => {
    if (!etapaDestaque) return;
    const el = colunaRefs.current[etapaDestaque];
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [etapaDestaque]);

  const moveLeadToStage = useCallback(
    async (lead: PipelineLead, newStage: string) => {
      const oldStage = lead.status_funil;
      setOptimisticMoves((prev) => ({ ...prev, [lead.id]: newStage }));
      const { error } = await supabase
        .from("leads")
        .update({ status_funil: newStage, status_funil_atualizado_em: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) {
        setOptimisticMoves((prev) => {
          const next = { ...prev };
          delete next[lead.id];
          return next;
        });
        toastError(error, "Erro ao mover lead");
        return;
      }
      await supabase.from("lead_historico").insert({ lead_id: lead.id, de_etapa: oldStage, para_etapa: newStage, criado_por: user?.id });
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[lead.id];
        return next;
      });
      onRefresh();
    },
    [user?.id, onRefresh],
  );

  const handleDragEnd = async (result: DropResult) => {
    if (!dragEnabled || !result.destination) return;
    const lead = leads.find((l) => l.id === result.draggableId);
    if (!lead) return;
    const newStage = result.destination.droppableId;
    const atual = grouped[newStage]?.some((l) => l.id === lead.id);
    if (atual) return;
    if (funilEntraNaEsteira(newStage)) {
      setConvertParaEtapa(newStage);
      setConvertLead(lead);
      return;
    }
    await moveLeadToStage(lead, newStage);
  };

  const abrirConversa = (lead: PipelineLead) => {
    if (!lead.whatsapp) return;
    navigate(`/atendimento?tel=${encodeURIComponent(lead.whatsapp)}`);
  };

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div role="region" aria-label="Pipeline de leads" className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 h-[calc(100vh-292px)] min-h-[440px]">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = grouped[stage.value] || [];
            const slaDias = slaPorEtapa.get(stage.value) ?? null;
            const resumo = resumoColuna(stageLeads, slaDias);
            const isCollapsed = colapsadas.has(stage.value);
            const destaque = etapaDestaque === stage.value;
            const isPerdido = stage.value === "perdido";

            if (isCollapsed) {
              return (
                <button
                  key={stage.value}
                  type="button"
                  ref={(el) => {
                    colunaRefs.current[stage.value] = el;
                  }}
                  onClick={() => onToggleColapso(stage.value)}
                  title={`Expandir ${stage.label}`}
                  className={cn(
                    "flex-shrink-0 w-[52px] rounded-2xl border bg-white/70 hover:bg-white transition-colors flex flex-col items-center py-3 gap-2 text-left",
                    destaque ? "border-gold ring-2 ring-gold/30" : "border-ink-06",
                  )}
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
                    ref={(el) => {
                      provided.innerRef(el);
                      colunaRefs.current[stage.value] = el;
                    }}
                    {...provided.droppableProps}
                    role="list"
                    aria-label={`${stage.label} — ${resumo.total} leads`}
                    className={cn(
                      "flex-1 min-w-[268px] max-w-[440px] rounded-2xl border flex flex-col transition-colors",
                      snapshot.isDraggingOver ? "bg-gold/[0.06] border-gold/50" : isPerdido ? "bg-ink-03 border-ink-06" : "bg-white/60 border-ink-06",
                      destaque && "ring-2 ring-gold/40 border-gold",
                    )}
                  >
                    <div className="px-3 pt-3 pb-2 border-b border-ink-06">
                      <div className="flex items-center gap-2">
                        <h3 className="flex-1 text-[11px] font-bold text-navy uppercase tracking-[1px] truncate">{stage.label}</h3>
                        <span className="font-display text-sm font-extrabold text-navy tabular-nums">{resumo.total}</span>
                        <button
                          type="button"
                          onClick={() => onToggleColapso(stage.value)}
                          className="h-6 w-6 rounded-md flex items-center justify-center text-ink-35 hover:text-navy hover:bg-ink-06 transition-colors"
                          title={`Recolher ${stage.label}`}
                          aria-label={`Recolher ${stage.label}`}
                        >
                          <ChevronsLeft className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums">
                        <span className="font-mono-dm font-semibold text-gold-deep">{resumo.potencial > 0 ? formatCurrency(resumo.potencial) : "—"}</span>
                        {slaDias != null && <span className="text-ink-35">· meta {slaDias}d</span>}
                        {resumo.atrasados > 0 && <span className="ml-auto inline-flex items-center gap-1 font-bold text-dash-red"><Clock className="h-3 w-3" /> {resumo.atrasados} atrasado{resumo.atrasados > 1 ? "s" : ""}</span>}
                        {resumo.atrasados === 0 && resumo.vencendo > 0 && <span className="ml-auto inline-flex items-center gap-1 font-bold text-dash-amber"><Clock className="h-3 w-3" /> {resumo.vencendo} vencendo</span>}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-2 p-2 min-h-[60px] overflow-y-auto">
                      {stageLeads.length === 0 && (
                        <EmptyState icon={<Users className="w-5 h-5 text-ink-35" />} title="Nenhum lead nesta etapa" subtitle={dragEnabled ? "Arraste leads para cá ou adicione um novo" : undefined} />
                      )}
                      {stageLeads.map((lead, index) => {
                        const conversa = conversaDoLead(lead.whatsapp, indiceConversas);
                        return (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            index={index}
                            onClick={() => onLeadClick(lead.id)}
                            onConversa={() => abrirConversa(lead)}
                            isException={exceptionLeadIds.has(lead.id)}
                            userRole={userRole}
                            isDragDisabled={!dragEnabled || !canEditLead(userRole, lead.status_funil)}
                            sla={slaDoLead({ ...lead, potencial: lead.relatorios_leads?.[0]?.estimativa_total_maxima ?? 0 }, slaDias)}
                            estadoConversa={estadoConversa(conversa)}
                            ultimaMensagem={conversa?.ultima_texto ?? null}
                          />
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      <ConvertClientModal
        lead={convertLead}
        paraEtapa={convertParaEtapa}
        onClose={() => setConvertLead(null)}
        onRefresh={onRefresh}
      />
    </>
  );
}

const SLA_BADGE: Record<SlaInfo["status"], string> = {
  estourado: "bg-dash-red/10 text-dash-red border-dash-red/25",
  atencao: "bg-dash-amber/10 text-dash-amber border-dash-amber/25",
  no_prazo: "bg-dash-green/10 text-dash-green border-dash-green/20",
  sem_sla: "bg-ink-06 text-ink-35 border-transparent",
};

const CONVERSA_STYLE: Record<EstadoConversa, { cls: string; title: string; icon: "bot" | "msg" | "none" }> = {
  sem_conversa: { cls: "text-ink-35 hover:text-navy", title: "Sem conversa — abrir WhatsApp no atendimento", icon: "msg" },
  robo: { cls: "text-navy", title: "Robô SDR conduzindo a conversa", icon: "bot" },
  aguardando_lead: { cls: "text-dash-green", title: "Última mensagem foi nossa — aguardando o lead", icon: "msg" },
  aguardando_nos: { cls: "text-dash-red", title: "Lead respondeu e está esperando a gente", icon: "msg" },
};

interface CardProps {
  lead: PipelineLead;
  index: number;
  onClick: () => void;
  onConversa: () => void;
  isException: boolean;
  userRole: string | null;
  isDragDisabled: boolean;
  sla: SlaInfo;
  estadoConversa: EstadoConversa;
  ultimaMensagem: string | null;
}

function LeadCard({ lead, index, onClick, onConversa, isException, userRole, isDragDisabled, sla, estadoConversa: estado, ultimaMensagem }: CardProps) {
  const scoreLabel = getScoreLabel(lead.score_lead);
  const scoreConf = SCORE_CONFIG[scoreLabel];
  const potMin = lead.relatorios_leads?.[0]?.estimativa_total_minima || 0;
  const potMax = lead.relatorios_leads?.[0]?.estimativa_total_maxima || 0;
  const isGanho = lead.status_funil === "ganho" || lead.status_funil === "cliente_ativo";
  const showTooltip = isGanho && userRole === "comercial";
  const conv = CONVERSA_STYLE[estado];
  const origem = lead.origem ? ORIGEM_LEAD_LABEL[lead.origem] ?? lead.origem : null;

  const card = (
    <Draggable draggableId={lead.id} index={index} isDragDisabled={isDragDisabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          role="listitem"
          aria-label={`${lead.empresa} — Score ${scoreLabel}, ${sla.dias} dias na etapa`}
          aria-roledescription="card arrastável"
          onClick={onClick}
          className={cn(
            "group relative bg-white rounded-xl border p-3 cursor-pointer transition-all hover:shadow-soft-hover hover:-translate-y-px",
            sla.status === "estourado" ? "border-dash-red/30" : sla.status === "atencao" ? "border-dash-amber/30" : "border-ink-06",
            snapshot.isDragging && "shadow-lg rotate-1 border-gold",
            isDragDisabled && "cursor-default",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-navy leading-tight truncate">{lead.empresa}</p>
              {lead.nome && <p className="text-[11px] text-ink-35 truncate mt-0.5">{lead.nome}</p>}
            </div>
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0", scoreConf.color)} title={`Score ${lead.score_lead ?? "—"}`}>
              {scoreLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", SEGMENTO_COLORS[lead.segmento] || "bg-muted text-muted-foreground")}>
              {SEGMENTO_LABELS[lead.segmento] || lead.segmento}
            </span>
            {origem && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-06 text-ink-60">{origem}</span>}
            {isException && <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Exceção registrada" />}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className={cn("text-[11px] font-bold font-mono-dm tabular-nums", potMax >= 500_000 ? "text-gold-deep" : potMax > 0 ? "text-navy" : "text-ink-35")}>
              {potMax > 0 ? (potMin > 0 && potMin !== potMax ? `${formatCurrency(potMin)} – ${formatCurrency(potMax)}` : formatCurrency(potMax)) : "sem diagnóstico"}
            </span>
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[2px] rounded-full border tabular-nums", SLA_BADGE[sla.status])} title={sla.sla != null ? `Meta da etapa: ${sla.sla} dias` : "Etapa sem meta"}>
              <Clock className="h-3 w-3" />
              {sla.dias}d{sla.status === "estourado" && sla.restante != null ? ` · +${Math.abs(sla.restante)}` : ""}
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-ink-06 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConversa();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!lead.whatsapp}
              className={cn("inline-flex items-center gap-1 text-[10px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-default", conv.cls)}
              title={lead.whatsapp ? conv.title : "Lead sem WhatsApp"}
            >
              {conv.icon === "bot" ? <Bot className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
              {estado === "robo" ? "Robô" : estado === "aguardando_nos" ? "Responder" : estado === "aguardando_lead" ? "Enviado" : "WhatsApp"}
            </button>
            {ultimaMensagem && <span className="flex-1 min-w-0 text-[10px] text-ink-35 truncate italic">“{ultimaMensagem}”</span>}
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
