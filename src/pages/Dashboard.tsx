import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getScoreLabel, daysSince } from "@/lib/pipeline-constants";
import { FUNNEL_STAGES_COM, type FunnelRow, type RecentLead, type MonthBar, type ClientRank, MONTH_ABBR } from "@/components/dashboard/dashboard-utils";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CommercialView } from "@/components/dashboard/comercial/CommercialView";
import { OperationalView } from "@/components/dashboard/operacional/OperationalView";
import { ExecutivaView } from "@/components/dashboard/executiva/ExecutivaView";

async function fetchDashboardData() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d14 = new Date(now.getTime() - 14 * 86400000).toISOString();
  const d3 = new Date(now.getTime() - 3 * 86400000).toISOString();

  // ═══ COMMERCIAL KPIs ═══
  const [pipelineRes, newWeekRes, prevWeekRes, contratosRes, clientesAtivosRes, totalEverRes] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).not("status_funil", "in", "(perdido,nao_vai_fazer)"),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("criado_em", d7),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("criado_em", d14).lt("criado_em", d7),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status_funil", "contrato_emitido"),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("status", "ativo"),
    supabase.from("leads").select("id", { count: "exact", head: true }),
  ]);

  const comLeads = pipelineRes.count ?? 0;
  const comNewWeek = newWeekRes.count ?? 0;
  const comNewPrevWeek = prevWeekRes.count ?? 0;
  const comContratos = contratosRes.count ?? 0;
  const comClientesAtivos = clientesAtivosRes.count ?? 0;
  const totalEver = totalEverRes.count ?? 0;
  const comTaxaConversao = totalEver > 0 ? Math.min(Math.round((comClientesAtivos / totalEver) * 100), 100) : 0;

  // ═══ COMMERCIAL CHARTS ═══
  const { data: allLeads } = await supabase.from("leads").select("id, status_funil, segmento, origem, score_lead").not("status_funil", "in", "(perdido,nao_vai_fazer)").limit(5000);
  const activeLeads = allLeads ?? [];
  const activeIds = activeLeads.map(l => l.id);

  let comPotencial = 0;
  let potByLead: Record<string, number> = {};
  if (activeIds.length) {
    const { data: rels } = await supabase.from("relatorios_leads").select("lead_id, estimativa_total_maxima").in("lead_id", activeIds);
    (rels ?? []).forEach(r => { potByLead[r.lead_id] = Math.max(potByLead[r.lead_id] ?? 0, Number(r.estimativa_total_maxima)); });
    comPotencial = Object.values(potByLead).reduce((s, v) => s + v, 0);
  }

  const fCounts: Record<string, { count: number; ids: string[] }> = {};
  FUNNEL_STAGES_COM.forEach(s => { fCounts[s.value] = { count: 0, ids: [] }; });
  activeLeads.forEach(l => {
    if (fCounts[l.status_funil]) {
      fCounts[l.status_funil].count++;
      fCounts[l.status_funil].ids.push(l.id);
    }
  });
  fCounts["cliente_ativo"] = { count: comClientesAtivos, ids: [] };

  const funnelData: FunnelRow[] = FUNNEL_STAGES_COM.map(s => ({
    stage: s.value, label: s.label, color: s.color,
    count: fCounts[s.value]?.count ?? 0,
    potencial: (fCounts[s.value]?.ids ?? []).reduce((sum, id) => sum + (potByLead[id] ?? 0), 0),
  }));

  const segMap: Record<string, number> = {};
  activeLeads.forEach(l => { segMap[l.segmento] = (segMap[l.segmento] ?? 0) + 1; });
  const segmentoData = Object.entries(segMap).sort((a, b) => b[1] - a[1]).map(([segmento, count]) => ({ segmento, count }));

  const origemData: Record<string, number> = {};
  activeLeads.forEach(l => { origemData[l.origem] = (origemData[l.origem] ?? 0) + 1; });

  const scoreDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  activeLeads.forEach(l => {
    const letter = getScoreLabel(l.score_lead);
    scoreDistribution[letter] = (scoreDistribution[letter] ?? 0) + 1;
  });

  const { data: recent } = await supabase.from("leads").select("empresa, segmento, criado_em, id, score_lead")
    .not("status_funil", "in", "(perdido,nao_vai_fazer)").order("criado_em", { ascending: false }).limit(4);
  const recentIds = (recent ?? []).map(r => r.id);
  let rPotMap: Record<string, number> = {};
  if (recentIds.length) {
    const { data: rRels } = await supabase.from("relatorios_leads").select("lead_id, estimativa_total_maxima").in("lead_id", recentIds);
    (rRels ?? []).forEach(r => { rPotMap[r.lead_id] = Math.max(rPotMap[r.lead_id] ?? 0, Number(r.estimativa_total_maxima)); });
  }
  const recentLeads: RecentLead[] = (recent ?? []).map(r => ({ id: r.id, empresa: r.empresa, segmento: r.segmento, criado_em: r.criado_em, potencial: rPotMap[r.id] ?? 0, score: r.score_lead }));

  const { data: stalled } = await supabase.from("leads").select("empresa, status_funil_atualizado_em, id")
    .eq("status_funil", "contrato_emitido").lt("status_funil_atualizado_em", d3);
  const stalledLeads = (stalled ?? []).map(l => ({ empresa: l.empresa || "Sem empresa", days: daysSince(l.status_funil_atualizado_em!), id: l.id })).sort((a, b) => b.days - a.days);

  const [diagRes, tesesRes] = await Promise.all([
    supabase.from("diagnosticos_leads").select("lead_id"),
    supabase.from("motor_teses_config").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);
  const uniqueDiagLeads = new Set((diagRes.data ?? []).map(d => d.lead_id));
  const motorDiagnosticos = uniqueDiagLeads.size;
  const motorTesesAtivas = tesesRes.count ?? 0;

  // ═══ OPERATIONAL ═══
  // Fox Review: saldos/gráficos usam v_cliente_totais_calculo (só Insumos+Subvenção)
  // e processos sem categoria reporto — evita inflar com REPORTO.
  const [clientesRes, allCompRes, allProcRes, totalAtivosRes, totaisRes] = await Promise.all([
    supabase.from("clientes").select("id, empresa", { count: "exact" }).eq("status", "ativo").limit(5000),
    supabase.from("compensacoes_mensais").select("valor_compensado, valor_nf_servico, honorario_valor, mes_referencia, cliente_id, tese_origem_id").limit(5000),
    supabase.from("processos_teses").select("id, cliente_id, valor_credito, percentual_honorario, valor_honorario").limit(5000),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("status", "ativo"),
    (supabase as any).from("v_cliente_totais_calculo").select("cliente_id, credito_apurado, total_compensado, saldo_restante").limit(5000),
  ]);
  const clientes = clientesRes.data ?? [];
  const allComp = allCompRes.data ?? [];
  const allProc = (allProcRes.data ?? []).filter((p: any) => p.categoria !== "reporto");
  const totaisCalc = (totaisRes.data ?? []) as { cliente_id: string; credito_apurado: number; total_compensado: number; saldo_restante: number }[];

  const clientesComCompensacao = new Set(allComp.filter(c => Number(c.valor_compensado ?? 0) > 0).map(c => c.cliente_id));
  const opClientes = clientesComCompensacao.size;
  const opTotalAtivos = totalAtivosRes.count ?? 0;

  const opCompensado = totaisCalc.length > 0
    ? totaisCalc.reduce((s, t) => s + Number(t.total_compensado ?? 0), 0)
    : allComp.reduce((s, c) => s + Number(c.valor_compensado ?? 0), 0);
  const opHonorarios = allComp.reduce((s, c) => s + Number((c as any).honorario_valor ?? c.valor_nf_servico ?? 0), 0);
  const totalCredito = totaisCalc.length > 0
    ? totaisCalc.reduce((s, t) => s + Number(t.credito_apurado ?? 0), 0)
    : allProc.reduce((s, p) => s + Number(p.valor_credito ?? 0), 0);
  const opSaldo = totaisCalc.length > 0
    ? totaisCalc.reduce((s, t) => s + Number(t.saldo_restante ?? 0), 0)
    : totalCredito - opCompensado;

  const monthMapComp: Record<string, number> = {};
  const monthMapHon: Record<string, number> = {};
  allComp.forEach(c => {
    const m = String(c.mes_referencia).slice(0, 7);
    monthMapComp[m] = (monthMapComp[m] ?? 0) + Number(c.valor_compensado ?? 0);
    monthMapHon[m] = (monthMapHon[m] ?? 0) + Number((c as any).honorario_valor ?? c.valor_nf_servico ?? 0);
  });
  const sortedMonths = Object.keys(monthMapComp).sort().slice(-6);
  const monthlyBars: MonthBar[] = sortedMonths.map(m => ({
    month: m,
    label: `${MONTH_ABBR[m.slice(5, 7)] ?? m.slice(5, 7)}/${m.slice(2, 4)}`,
    valor: monthMapComp[m],
    honorarios: monthMapHon[m] ?? 0,
  }));

  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c.empresa]));
  const compByClient: Record<string, number> = {};
  const honByClient: Record<string, number> = {};
  allComp.forEach(c => {
    compByClient[c.cliente_id] = (compByClient[c.cliente_id] ?? 0) + Number(c.valor_compensado ?? 0);
    honByClient[c.cliente_id] = (honByClient[c.cliente_id] ?? 0) + Number((c as any).honorario_valor ?? c.valor_nf_servico ?? 0);
  });
  const creditByClient: Record<string, number> = {};
  if (totaisCalc.length > 0) {
    totaisCalc.forEach((t) => { creditByClient[t.cliente_id] = Number(t.credito_apurado ?? 0); });
  } else {
    allProc.forEach(p => { creditByClient[p.cliente_id] = (creditByClient[p.cliente_id] ?? 0) + Number(p.valor_credito ?? 0); });
  }
  // Prefer view saldo when available
  const saldoByClient: Record<string, number> = {};
  totaisCalc.forEach((t) => { saldoByClient[t.cliente_id] = Number(t.saldo_restante ?? 0); });
  const allClientIds = [...new Set([...Object.keys(compByClient), ...Object.keys(creditByClient)])];
  const rankings: ClientRank[] = allClientIds.map(id => ({
    id, empresa: clienteMap[id] ?? "—",
    compensado: totaisCalc.length > 0
      ? Number(totaisCalc.find((t) => t.cliente_id === id)?.total_compensado ?? compByClient[id] ?? 0)
      : (compByClient[id] ?? 0),
    honorarios: honByClient[id] ?? 0,
    identificado: creditByClient[id] ?? 0,
    saldo: saldoByClient[id] ?? ((creditByClient[id] ?? 0) - (compByClient[id] ?? 0)),
  }));
  const topCompensado = [...rankings].sort((a, b) => b.compensado - a.compensado).slice(0, 8);
  const topSaldo = [...rankings].sort((a, b) => b.saldo - a.saldo).filter(r => r.saldo > 0).slice(0, 8);

  // ═══ INTIMAÇÕES ═══
  const { data: intimData } = await supabase.from("intimacoes").select("id, status, prazo_vencimento").in("status", ["pendente", "informado_aline", "em_andamento"]);
  const intimacoesPendentes = intimData?.length ?? 0;
  const in15 = new Date(now.getTime() + 15 * 86400000).toISOString().slice(0, 10);
  const intimacoesVencendo = intimData?.filter(i => i.prazo_vencimento && i.prazo_vencimento <= in15).length ?? 0;

  // ═══ DATA HEALTH ═══
  const compCount = allComp.length;
  const procCount = allProc.length;

  return {
    comLeads, comNewWeek, comNewPrevWeek, comPotencial, comContratos, comClientesAtivos, comTaxaConversao,
    funnelData, recentLeads, stalledLeads, segmentoData, origemData, scoreDistribution,
    motorDiagnosticos, motorTesesAtivas,
    opClientes, opTotalAtivos, opCompensado, opHonorarios, opSaldo,
    monthlyBars, topCompensado, topSaldo,
    intimacoesPendentes, intimacoesVencendo,
    dataHealth: { compensacoes: compCount, processos: procCount, hasData: compCount > 0 },
  };
}

export default function Dashboard() {
  const { profile, userRole, permissions } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = userRole ?? "comercial";

  const canTab = (tabKey: string) => {
    const perm = permissions.find((p) => p.screen_key === tabKey);
    if (!perm) return true;
    return perm.can_access;
  };
  const canComercial = canTab("dashboard.comercial");
  const canOperacional = canTab("dashboard.operacional");
  const canExecutiva = canTab("dashboard.executiva");

  const resolveDefault = () => {
    const stored = localStorage.getItem("dash_tab");
    if (stored === "executiva" && canExecutiva) return "executiva";
    if (stored === "operacional" && canOperacional) return "operacional";
    if (stored === "comercial" && canComercial) return "comercial";
    if (role === "gestor_tributario" && canOperacional) return "operacional";
    if (canComercial) return "comercial";
    if (canOperacional) return "operacional";
    if (canExecutiva) return "executiva";
    return "comercial";
  };
  const [activeTab, setActiveTab] = useState(resolveDefault);
  const switchTab = (t: string) => { setActiveTab(t); localStorage.setItem("dash_tab", t); };

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardData,
    staleTime: 20_000,
  });

  const kpiLoading = isLoading;
  const chartLoading = isLoading;

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "compensacoes_mensais" }, () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const d = data;
  const trendDiff = (d?.comNewWeek ?? 0) - (d?.comNewPrevWeek ?? 0);
  const maxFunnelCount = Math.max(...(d?.funnelData ?? []).map(f => f.count), 1);
  const totalFunnelCount = (d?.funnelData ?? []).reduce((s, f) => s + f.count, 0);
  const totalFunnelPotencial = (d?.funnelData ?? []).reduce((s, f) => s + f.potencial, 0);
  const maxSegCount = Math.max(...(d?.segmentoData ?? []).map(s => s.count), 1);
  const opEconomia = (d?.opCompensado ?? 0) - (d?.opHonorarios ?? 0);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f2f3f7] font-sans antialiased">
      <DashboardHeader
        profileName={profile?.full_name?.split(" ")[0] || "usuário"}
        role={role}
        canComercial={canComercial}
        canOperacional={canOperacional}
        canExecutiva={canExecutiva}
        activeTab={activeTab}
        switchTab={switchTab}
      />

      {role === "admin" && d?.dataHealth && !d.dataHealth.hasData && (
        <div className="mx-7 mt-4 p-3 rounded-xl border border-[hsl(var(--destructive)/0.2)] bg-[hsl(var(--destructive)/0.04)] flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Nenhuma compensação encontrada. Os dados reais precisam ser importados.
          </p>
          <Link to="/clientes" className="text-[10px] font-bold text-destructive hover:underline whitespace-nowrap">
            Ir para clientes →
          </Link>
        </div>
      )}

      <div className="px-7 pt-[18px] pb-9 w-full">
        {activeTab === "executiva" ? (
          <ExecutivaView navigate={navigate} />
        ) : activeTab === "comercial" ? (
          <CommercialView
            kpiLoading={kpiLoading} chartLoading={chartLoading}
            comLeads={d?.comLeads ?? 0} comNewWeek={d?.comNewWeek ?? 0} trendDiff={trendDiff}
            comPotencial={d?.comPotencial ?? 0} comContratos={d?.comContratos ?? 0} comTaxaConversao={d?.comTaxaConversao ?? 0}
            comClientesAtivos={d?.comClientesAtivos ?? 0} stalledLeads={d?.stalledLeads ?? []} funnelData={d?.funnelData ?? []}
            maxFunnelCount={maxFunnelCount} totalFunnelCount={totalFunnelCount} totalFunnelPotencial={totalFunnelPotencial}
            segmentoData={d?.segmentoData ?? []} maxSegCount={maxSegCount} origemData={d?.origemData ?? {}}
            recentLeads={d?.recentLeads ?? []} scoreDistribution={d?.scoreDistribution ?? { A: 0, B: 0, C: 0, D: 0 }}
            motorDiagnosticos={d?.motorDiagnosticos ?? 0} motorTesesAtivas={d?.motorTesesAtivas ?? 0}
            navigate={navigate}
          />
        ) : (
          <OperationalView
            kpiLoading={kpiLoading} chartLoading={chartLoading}
            opClientes={d?.opClientes ?? 0} opTotalAtivos={d?.opTotalAtivos ?? 0} opCompensado={d?.opCompensado ?? 0} opHonorarios={d?.opHonorarios ?? 0}
            opSaldo={d?.opSaldo ?? 0} opEconomia={opEconomia} monthlyBars={d?.monthlyBars ?? []}
            topCompensado={d?.topCompensado ?? []} topSaldo={d?.topSaldo ?? []} navigate={navigate}
            intimacoesPendentes={d?.intimacoesPendentes ?? 0} intimacoesVencendo={d?.intimacoesVencendo ?? 0}
          />
        )}
      </div>
    </div>
  );
}
