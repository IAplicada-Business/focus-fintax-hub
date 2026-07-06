import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ACTIVE_STAGES, daysSince, formatCurrency } from "@/lib/pipeline-constants";
import { compactCurrency } from "@/components/dashboard/dashboard-utils";
import { PipelineKanban } from "@/components/pipeline/PipelineKanban";
import { PipelineList } from "@/components/pipeline/PipelineList";
import { LeadFormModal } from "@/components/pipeline/LeadFormModal";
import { LeadSidePanel } from "@/components/pipeline/LeadSidePanel";
import { SkeletonKpi } from "@/components/dashboard/SkeletonKpi";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { useLeadsPipeline, useLeadExceptions } from "@/hooks/data/useLeads";
import {
  StatusCompensacaoFilter,
  useStatusCompensacao,
  countByStatus,
  STATUS_COMPENSACAO_VALUES,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";

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
    teses_identificadas: any;
  }[];
}

export default function Pipeline() {
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const { data: leadsData, isLoading: loading } = useLeadsPipeline();
  const { data: exceptionLeadIds = new Set<string>() } = useLeadExceptions();
  const leads = (leadsData ?? []) as PipelineLead[];

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [showForm, setShowForm] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [filterStatusComp, setFilterStatusComp] = useState<Set<StatusCompensacao>>(
    new Set(STATUS_COMPENSACAO_VALUES)
  );

  const { statusMap: statusCompMap } = useStatusCompensacao();
  // Mapeia lead_id → cliente_id (converted leads only)
  const [leadToCliente, setLeadToCliente] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, lead_id")
      .not("lead_id", "is", null)
      .then(({ data }) => {
        const m = new Map<string, string>();
        for (const c of (data || []) as { id: string; lead_id: string }[]) {
          m.set(c.lead_id, c.id);
        }
        setLeadToCliente(m);
      });
  }, []);

  const leadStatusMap = useMemo(() => {
    const m = new Map<string, StatusCompensacao>();
    for (const [leadId, cId] of leadToCliente.entries()) {
      const s = statusCompMap.get(cId);
      if (s) m.set(leadId, s);
    }
    return m;
  }, [leadToCliente, statusCompMap]);

  const filteredLeads = useMemo(() => {
    const allOrNone =
      filterStatusComp.size === 0 || filterStatusComp.size === STATUS_COMPENSACAO_VALUES.length;
    if (allOrNone) return leads;
    return leads.filter((l) => {
      const s = leadStatusMap.get(l.id) ?? "sem_operacao";
      return filterStatusComp.has(s);
    });
  }, [leads, leadStatusMap, filterStatusComp]);

  const statusCompCounts = useMemo(
    () => countByStatus(leads.map((l) => l.id), leadStatusMap),
    [leads, leadStatusMap]
  );

  const fetchLeads = () => queryClient.invalidateQueries({ queryKey: ["leads"] });

  useEffect(() => {
    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const activeLeads = useMemo(
    () => leads.filter((l) => l.status_funil !== "perdido" && l.status_funil !== "nao_vai_fazer"),
    [leads]
  );


  const newToday = useMemo(
    () => leads.filter((l) => {
      const d = new Date(l.criado_em);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length,
    [leads]
  );

  const totalPotencial = useMemo(
    () => activeLeads.reduce((sum, l) => {
      const r = l.relatorios_leads?.[0];
      return sum + (r?.estimativa_total_maxima || 0);
    }, 0),
    [activeLeads]
  );

  const leadsStale = useMemo(
    () => leads.filter((l) => l.status_funil === "novo" && daysSince(l.status_funil_atualizado_em || l.criado_em) > 1).length,
    [leads]
  );

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-navy">Pipeline de Leads</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">gerenciamento de leads e oportunidades</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("kanban")}
              className="rounded-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
              className="rounded-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <StatusCompensacaoFilter
            selectedStatuses={filterStatusComp}
            onChange={setFilterStatusComp}
            counts={statusCompCounts}
          />
          {userRole !== "gestor_tributario" && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo Lead
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="animate-slide-up delay-1 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Leads ativos</p>
          <p className="font-display text-[28px] font-bold leading-none text-navy">{activeLeads.length}</p>
          <p className="text-[11px] text-ink-35 mt-1">excluindo perdidos</p>
        </div>
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Novos hoje</p>
          <p className="font-display text-[28px] font-bold leading-none text-navy">{newToday}</p>
          <p className="text-[11px] text-ink-35 mt-1">captados hoje</p>
        </div>
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Potencial total</p>
          <p className="font-display text-[28px] font-bold leading-none text-dash-green">{compactCurrency(totalPotencial)}</p>
          <p className="text-[11px] text-ink-35 mt-1">soma do potencial máx.</p>
        </div>
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Sem contato &gt;1d</p>
          <p className="font-display text-[28px] font-bold leading-none text-dash-red">{leadsStale}</p>
          <p className="text-[11px] text-ink-35 mt-1">leads parados</p>
        </div>
      </div>

      {/* View */}
      {loading ? (
        <div className="space-y-4">
          <SkeletonKpi />
          <SkeletonTable />
        </div>
      ) : view === "kanban" ? (
        <PipelineKanban leads={filteredLeads} onLeadClick={setSelectedLeadId} onRefresh={fetchLeads} exceptionLeadIds={exceptionLeadIds} />
      ) : (
        <PipelineList leads={filteredLeads} onLeadClick={setSelectedLeadId} />
      )}

      {/* Form Modal */}
      <LeadFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={fetchLeads} />

      {/* Side Panel */}
      <LeadSidePanel lead={selectedLead} onClose={() => setSelectedLeadId(null)} onRefresh={fetchLeads} />
    </div>
  );
}
