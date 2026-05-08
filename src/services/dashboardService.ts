import { supabase } from "@/integrations/supabase/client";

export async function fetchCommercialKpis() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d14 = new Date(now.getTime() - 14 * 86400000).toISOString();

  const [pipelineRes, newWeekRes, prevWeekRes, contratosRes, clientesAtivosRes, totalEverRes] =
    await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }).not("status_funil", "in", "(perdido,nao_vai_fazer)"),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("criado_em", d7),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("criado_em", d14).lt("criado_em", d7),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status_funil", "contrato_emitido"),
      supabase.from("clientes").select("id", { count: "exact", head: true }).eq("status", "ativo"),
      supabase.from("leads").select("id", { count: "exact", head: true }),
    ]);

  return {
    comLeads: pipelineRes.count ?? 0,
    comNewWeek: newWeekRes.count ?? 0,
    comNewPrevWeek: prevWeekRes.count ?? 0,
    comContratos: contratosRes.count ?? 0,
    comClientesAtivos: clientesAtivosRes.count ?? 0,
    totalEver: totalEverRes.count ?? 0,
  };
}

export async function fetchCommercialCharts() {
  const now = new Date();
  const d3 = new Date(now.getTime() - 3 * 86400000).toISOString();

  const [funnelRes, recentRes, stalledRes, diagnosticRes, motorRes] = await Promise.all([
    supabase.from("leads").select("id, status_funil, segmento, origem, score_lead").not("status_funil", "in", "(perdido,nao_vai_fazer)").limit(5000),
    supabase.from("leads").select("empresa, segmento, criado_em, id, score_lead").not("status_funil", "in", "(perdido,nao_vai_fazer)").order("criado_em", { ascending: false }).limit(4),
    supabase.from("leads").select("empresa, status_funil_atualizado_em, id").eq("status_funil", "contrato_emitido").lt("status_funil_atualizado_em", d3),
    supabase.from("diagnosticos_leads").select("lead_id"),
    supabase.from("motor_teses_config").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);

  return {
    funnelLeads: funnelRes.data ?? [],
    recentLeads: recentRes.data ?? [],
    stalledLeads: stalledRes.data ?? [],
    diagnosticLeads: diagnosticRes.data ?? [],
    motorTesesAtivas: motorRes.count ?? 0,
  };
}

export async function fetchOperationalKpis() {
  const [clientesRes, compensacoesRes, processosRes, totalClientesRes] = await Promise.all([
    supabase.from("clientes").select("id, empresa", { count: "exact" }).eq("status", "ativo").limit(5000),
    supabase.from("compensacoes_mensais").select("valor_compensado, valor_nf_servico, mes_referencia, cliente_id").limit(5000),
    supabase.from("processos_teses").select("id, cliente_id, valor_credito, percentual_honorario, valor_honorario").limit(5000),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("status", "ativo"),
  ]);

  return {
    clientes: clientesRes.data ?? [],
    clientesCount: totalClientesRes.count ?? 0,
    compensacoes: compensacoesRes.data ?? [],
    processos: processosRes.data ?? [],
  };
}

export async function fetchOperationalHealth() {
  const [compCount, procCount] = await Promise.all([
    supabase.from("compensacoes_mensais").select("*", { count: "exact", head: true }),
    supabase.from("processos_teses").select("*", { count: "exact", head: true }),
  ]);
  return {
    compensacoes: compCount.count ?? 0,
    processos: procCount.count ?? 0,
    hasData: (compCount.count ?? 0) > 0 || (procCount.count ?? 0) > 0,
  };
}

export async function fetchIntimacoesSummary() {
  const { data } = await supabase
    .from("intimacoes")
    .select("id, status, prazo_vencimento")
    .in("status", ["pendente", "informado_aline", "em_andamento"]);
  return data ?? [];
}
