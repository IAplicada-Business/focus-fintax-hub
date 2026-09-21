import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, LayoutGrid, List, Search, ChevronsLeft, ChevronsRight, Clock, MessageCircle, Target, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PIPELINE_STAGES } from "@/lib/pipeline-constants";
import { compactCurrency } from "@/components/dashboard/dashboard-utils";
import { KpiCard, LoadingGrid } from "@/components/dashboard/ui/primitives";
import { PipelineKanban, lerColapsadas, salvarColapsadas } from "@/components/pipeline/PipelineKanban";
import { PipelineList } from "@/components/pipeline/PipelineList";
import { LeadFormModal } from "@/components/pipeline/LeadFormModal";
import { LeadSidePanel } from "@/components/pipeline/LeadSidePanel";
import { useLeadsPipeline, useLeadExceptions } from "@/hooks/data/useLeads";
import { usePipelineSlaConfig } from "@/hooks/data/usePipelineSla";
import { useAtendimentoInbox } from "@/hooks/data/useAtendimentoInbox";
import { resumirSlaFunil } from "@/lib/pipeline-sla";
import { agruparPorEtapa, etapasVazias, filtrarLeadsBusca } from "@/lib/pipeline-board";
import { leadAtivo, resumoAtendimento } from "@/lib/comercial-analytics";
import { cn } from "@/lib/utils";

export interface PipelineLead {
  id: string;
  nome: string;
  empresa: string;
  cnpj: string;
  email: string;
  whatsapp: string;
  segmento: string;
  regime_tributario: string;
  faturamento_faixa: string;
  score_lead: number | null;
  status: string;
  status_funil: string;
  status_funil_atualizado_em: string;
  origem: string;
  criado_em: string;
  observacoes: string;
  token: string;
  relatorios_leads: {
    estimativa_total_minima: number;
    estimativa_total_maxima: number;
    teses_identificadas: unknown;
  }[];
}

const VIEW_KEY = "pipeline.view";

export default function Pipeline() {
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const { data: leadsData, isLoading: loading } = useLeadsPipeline();
  const { data: exceptionLeadIds = new Set<string>() } = useLeadExceptions();
  const { data: slaConfig = [] } = usePipelineSlaConfig();
  const inboxQ = useAtendimentoInbox();
  const conversas = useMemo(() => inboxQ.data ?? [], [inboxQ.data]);
  const leads = useMemo(() => (leadsData ?? []) as PipelineLead[], [leadsData]);

  const [view, setView] = useState<"kanban" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "kanban";
    } catch {
      return "kanban";
    }
  });
  const trocarView = (v: "kanban" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage indisponível */
    }
  };
  const [showForm, setShowForm] = useState(false);
  const [busca, setBusca] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const etapaDestaque = searchParams.get("etapa");
  // `?lead=<id>` abre o painel do lead direto (ex.: vindo do SLA do funil).
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(() => searchParams.get("lead"));

  useEffect(() => {
    const fromUrl = searchParams.get("lead");
    if (fromUrl) setSelectedLeadId(fromUrl);
  }, [searchParams]);

  const closeLeadPanel = useCallback(() => {
    setSelectedLeadId(null);
    if (searchParams.has("lead")) {
      const next = new URLSearchParams(searchParams);
      next.delete("lead");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const limparDestaque = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("etapa");
    setSearchParams(next, { replace: true });
  };

  // Colunas recolhidas — persistidas no navegador.
  const [colapsadas, setColapsadas] = useState<Set<string>>(() => lerColapsadas(typeof window !== "undefined" ? window.localStorage : null));
  const atualizarColapsadas = (next: Set<string>) => {
    setColapsadas(next);
    salvarColapsadas(next, typeof window !== "undefined" ? window.localStorage : null);
  };
  const toggleColapso = (stage: string) => {
    const next = new Set(colapsadas);
    if (next.has(stage)) next.delete(stage);
    else next.add(stage);
    atualizarColapsadas(next);
  };

  // Etapa em destaque vinda do Dashboard nunca fica recolhida.
  useEffect(() => {
    if (etapaDestaque && colapsadas.has(etapaDestaque)) {
      const next = new Set(colapsadas);
      next.delete(etapaDestaque);
      atualizarColapsadas(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapaDestaque]);

  const filteredLeads = useMemo(() => filtrarLeadsBusca(leads, busca), [leads, busca]);

  const fetchLeads = () => queryClient.invalidateQueries({ queryKey: ["leads"] });

  useEffect(() => {
    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const kpis = useMemo(() => {
    const ativos = leads.filter(leadAtivo);
    const hoje = new Date().toDateString();
    const novosHoje = leads.filter((l) => new Date(l.criado_em).toDateString() === hoje).length;
    const potencial = ativos.reduce((s, l) => s + (l.relatorios_leads?.[0]?.estimativa_total_maxima || 0), 0);
    const sla = resumirSlaFunil(
      leads.map((l) => ({ ...l, potencial: l.relatorios_leads?.[0]?.estimativa_total_maxima ?? 0 })),
      slaConfig,
    );
    const atendimento = resumoAtendimento(conversas);
    return { ativos: ativos.length, novosHoje, potencial, atrasados: sla.totalAtrasados, potencialTravado: sla.atrasados.reduce((s, l) => s + Number(l.lead.potencial ?? 0), 0), aguardando: atendimento.aguardandoResposta, conversas: atendimento.total };
  }, [leads, slaConfig, conversas]);

  const grupos = useMemo(() => agruparPorEtapa(filteredLeads, PIPELINE_STAGES), [filteredLeads]);
  const vazias = etapasVazias(grupos);
  const recolherVazias = () => atualizarColapsadas(new Set([...colapsadas, ...vazias]));
  const expandirTodas = () => atualizarColapsadas(new Set());

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;
  const etapaLabel = etapaDestaque ? PIPELINE_STAGES.find((s) => s.value === etapaDestaque)?.label : null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho + ferramentas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold text-navy tracking-[-0.02em]">Pipeline de Leads</h1>
          <p className="text-[11px] text-ink-35 uppercase tracking-[1.4px] font-semibold">leads, etapas, SLA e conversas em um quadro</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-35" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, contato, CNPJ ou WhatsApp" className="pl-8 h-9 w-[260px] text-xs bg-white" />
            {busca && (
              <button type="button" onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-35 hover:text-navy" aria-label="Limpar busca">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex rounded-full border border-ink-06 bg-white p-0.5">
            <button type="button" onClick={() => trocarView("kanban")} className={cn("h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-semibold transition-colors", view === "kanban" ? "bg-navy text-white" : "text-ink-60 hover:text-navy")} title="Quadro">
              <LayoutGrid className="h-3.5 w-3.5" /> Quadro
            </button>
            <button type="button" onClick={() => trocarView("list")} className={cn("h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-semibold transition-colors", view === "list" ? "bg-navy text-white" : "text-ink-60 hover:text-navy")} title="Lista">
              <List className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
          {view === "kanban" &&
            (colapsadas.size > 0 ? (
              <Button variant="outline" size="sm" onClick={expandirTodas} title="Expandir todas as etapas">
                <ChevronsRight className="h-3.5 w-3.5 mr-1" /> Expandir ({colapsadas.size})
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={recolherVazias} disabled={vazias.length === 0} title="Recolher etapas sem leads">
                <ChevronsLeft className="h-3.5 w-3.5 mr-1" /> Recolher vazias
              </Button>
            ))}
          {userRole !== "gestor_tributario" && (
            <Button onClick={() => setShowForm(true)} className="bg-navy hover:bg-navy/90">
              <Plus className="h-4 w-4 mr-1" /> Novo Lead
            </Button>
          )}
        </div>
      </div>

      {/* Números */}
      <div className="animate-slide-up delay-1 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Leads ativos" raw={kpis.ativos} sub="excluindo perdidos" icon={<Users />} size="md" className="min-h-[96px] p-4" />
        <KpiCard label="Novos hoje" raw={kpis.novosHoje} sub="captados hoje" icon={<UserPlus />} size="md" className="min-h-[96px] p-4" />
        <KpiCard label="Potencial total" raw={kpis.potencial} format={compactCurrency} sub="soma do potencial máx." tom="gold" icon={<Target />} size="md" className="min-h-[96px] p-4" />
        <KpiCard label="Atrasados no SLA" raw={kpis.atrasados} sub={kpis.potencialTravado > 0 ? `${compactCurrency(kpis.potencialTravado)} travados` : "acima da meta da etapa"} tom={kpis.atrasados > 0 ? "red" : "green"} icon={<Clock />} size="md" className="min-h-[96px] p-4" />
        <KpiCard label="Conversas ativas" raw={kpis.conversas} sub="no inbox do atendimento" icon={<MessageCircle />} size="md" className="min-h-[96px] p-4" />
        <KpiCard label="Aguardando resposta" raw={kpis.aguardando} sub="lead escreveu há +4h" tom={kpis.aguardando > 0 ? "red" : "muted"} icon={<MessageCircle />} size="md" className="min-h-[96px] p-4" />
      </div>

      {etapaLabel && (
        <div className="flex items-center gap-2 text-xs text-ink-60">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          Destacando a etapa <strong className="text-navy">{etapaLabel}</strong>
          <button type="button" onClick={limparDestaque} className="ml-1 inline-flex items-center gap-1 text-gold-deep font-semibold hover:underline">
            limpar <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Quadro / lista */}
      {loading ? (
        <LoadingGrid cards={6} />
      ) : view === "kanban" ? (
        <PipelineKanban
          leads={filteredLeads}
          onLeadClick={setSelectedLeadId}
          onRefresh={fetchLeads}
          exceptionLeadIds={exceptionLeadIds}
          slaConfig={slaConfig}
          conversas={conversas}
          etapaDestaque={etapaDestaque}
          colapsadas={colapsadas}
          onToggleColapso={toggleColapso}
        />
      ) : (
        <PipelineList leads={filteredLeads} onLeadClick={setSelectedLeadId} />
      )}

      <LeadFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={fetchLeads} />
      <LeadSidePanel lead={selectedLead} onClose={closeLeadPanel} onRefresh={fetchLeads} />
    </div>
  );
}
