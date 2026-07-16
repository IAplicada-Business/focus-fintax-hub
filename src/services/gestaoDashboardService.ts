import { supabase } from "@/integrations/supabase/client";

const MS_DAY = 86400000;

export interface CompensacaoSemana {
  id: string;
  cliente_id: string;
  empresa: string;
  mes_referencia: string;
  valor_compensado: number;
  criado_em: string | null;
  tese_label: string | null;
}

export interface HistoricoSemana {
  id: string;
  cliente_id: string;
  empresa: string;
  tipo: string;
  descricao: string;
  created_at: string;
}

export interface ProcessoNovo {
  id: string;
  cliente_id: string;
  empresa: string;
  nome_exibicao: string;
  criado_em: string;
}

export interface ClienteMovimentoSemana {
  id: string;
  empresa: string;
  valor: number;
  lancamentos: number;
}

export interface ClienteAtencao {
  id: string;
  empresa: string;
  dias: number;
  status: string;
  saldo: number;
}

export interface ResumoSemanalData {
  desde: string;
  comps: CompensacaoSemana[];
  totalCompensado: number;
  clientesEmMovimento: number;
  topClientes: ClienteMovimentoSemana[];
  historico: HistoricoSemana[];
  processosNovos: ProcessoNovo[];
  intimacoesNovas: number;
  clientesSemMovimento: ClienteAtencao[];
}

export type EtapaCiclo =
  | "cadastrado"
  | "com_processo"
  | "com_credito"
  | "tese_ativa"
  | "compensando"
  | "compensado";

export interface ClienteCiclo {
  id: string;
  empresa: string;
  etapa: EtapaCiclo;
  diasNaEtapa: number;
  diasDesdeCadastro: number;
  atrasado: boolean;
  status: string;
  teseAtiva: string | null;
  saldo: number;
  ultimaComp: string | null;
}

export interface CicloSlaData {
  clientes: ClienteCiclo[];
  tempoMedioDias: Record<EtapaCiclo, number | null>;
  atrasados: number;
  semOperacao: number;
}

const ETAPA_LABEL: Record<EtapaCiclo, string> = {
  cadastrado: "Cadastrado",
  com_processo: "Com processo",
  com_credito: "Com crédito apurado",
  tese_ativa: "Tese em uso",
  compensando: "Compensando",
  compensado: "Compensado",
};

export { ETAPA_LABEL };

function daysBetween(from: string | Date | null | undefined, to: Date = new Date()) {
  if (from == null || from === "") return 0;
  const a = typeof from === "string" ? new Date(from).getTime() : from.getTime();
  if (!Number.isFinite(a)) return 0;
  return Math.max(0, Math.floor((to.getTime() - a) / MS_DAY));
}

export async function fetchResumoSemanal(): Promise<ResumoSemanalData> {
  const desdeDate = new Date(Date.now() - 7 * MS_DAY);
  const desde = desdeDate.toISOString();

  const [
    { data: clientes },
    { data: comps },
    { data: historico },
    { data: processos },
    { count: intimacoesNovas },
    { data: statusRows },
    { data: totais },
  ] = await Promise.all([
    supabase.from("clientes").select("id, empresa, status, criado_em, atualizado_em").eq("status", "ativo").limit(5000),
    supabase
      .from("compensacoes_mensais")
      .select("id, cliente_id, mes_referencia, valor_compensado, criado_em, tese_origem_id")
      .gte("criado_em", desde)
      .limit(2000),
    (supabase as any)
      .from("cliente_historico")
      .select("id, cliente_id, tipo, descricao, created_at")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("processos_teses")
      .select("id, cliente_id, nome_exibicao, criado_em")
      .gte("criado_em", desde)
      .limit(500),
    supabase
      .from("intimacoes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", desde),
    (supabase as any).from("v_clientes_status_compensacao").select("cliente_id, status_principal").limit(5000),
    (supabase as any)
      .from("v_cliente_totais_calculo")
      .select("cliente_id, saldo_restante")
      .limit(5000),
  ]);

  const clienteMap = new Map((clientes || []).map((c) => [c.id, c.empresa || "—"]));
  const statusMap = new Map(
    ((statusRows as { cliente_id: string; status_principal: string }[]) || []).map((s) => [
      s.cliente_id,
      s.status_principal,
    ]),
  );

  // Labels de tese (origem)
  const teseIds = [
    ...new Set(
      ((comps as { tese_origem_id?: string | null }[]) || [])
        .map((c) => c.tese_origem_id)
        .filter(Boolean) as string[],
    ),
  ];
  let teseLabelMap = new Map<string, string>();
  if (teseIds.length) {
    const { data: teses } = await (supabase as any)
      .from("teses_tributarias")
      .select("id, label")
      .in("id", teseIds);
    teseLabelMap = new Map(((teses as { id: string; label: string }[]) || []).map((t) => [t.id, t.label]));
  }

  const compsMapped: CompensacaoSemana[] = ((comps as any[]) || []).map((c) => ({
    id: c.id,
    cliente_id: c.cliente_id,
    empresa: clienteMap.get(c.cliente_id) || "—",
    mes_referencia: c.mes_referencia,
    valor_compensado: Number(c.valor_compensado || 0),
    criado_em: c.criado_em,
    tese_label: c.tese_origem_id ? teseLabelMap.get(c.tese_origem_id) || null : null,
  }));

  const historicoMapped: HistoricoSemana[] = ((historico as any[]) || []).map((h) => ({
    id: h.id,
    cliente_id: h.cliente_id,
    empresa: clienteMap.get(h.cliente_id) || "—",
    tipo: h.tipo,
    descricao: h.descricao,
    created_at: h.created_at,
  }));

  const processosMapped: ProcessoNovo[] = ((processos as any[]) || []).map((p) => ({
    id: p.id,
    cliente_id: p.cliente_id,
    empresa: clienteMap.get(p.cliente_id) || "—",
    nome_exibicao: p.nome_exibicao,
    criado_em: p.criado_em,
  }));

  const saldoMap = new Map(
    ((totais as { cliente_id: string; saldo_restante: number }[]) || []).map((t) => [
      t.cliente_id,
      Number(t.saldo_restante || 0),
    ]),
  );

  // Top clientes por volume compensado na semana (agregado)
  const byCliente = new Map<string, ClienteMovimentoSemana>();
  for (const c of compsMapped) {
    const prev = byCliente.get(c.cliente_id);
    if (prev) {
      prev.valor += c.valor_compensado;
      prev.lancamentos += 1;
    } else {
      byCliente.set(c.cliente_id, {
        id: c.cliente_id,
        empresa: c.empresa,
        valor: c.valor_compensado,
        lancamentos: 1,
      });
    }
  }
  const topClientes = [...byCliente.values()].sort((a, b) => b.valor - a.valor).slice(0, 8);

  // Clientes com saldo e sem compensação na semana → fila de atenção
  const movedIds = new Set(compsMapped.map((c) => c.cliente_id));
  const clientesSemMovimento = ((clientes as any[]) || [])
    .filter((c) => (saldoMap.get(c.id) || 0) > 1000 && !movedIds.has(c.id))
    .map((c) => ({
      id: c.id,
      empresa: c.empresa || "—",
      dias: daysBetween(c.atualizado_em || c.criado_em),
      status: statusMap.get(c.id) || "sem_operacao",
      saldo: saldoMap.get(c.id) || 0,
    }))
    .sort((a, b) => b.saldo - a.saldo || b.dias - a.dias)
    .slice(0, 10);

  return {
    desde,
    comps: compsMapped,
    totalCompensado: compsMapped.reduce((s, c) => s + c.valor_compensado, 0),
    clientesEmMovimento: byCliente.size,
    topClientes,
    historico: historicoMapped,
    processosNovos: processosMapped,
    intimacoesNovas: intimacoesNovas ?? 0,
    clientesSemMovimento,
  };
}

export async function fetchCicloSla(): Promise<CicloSlaData> {
  const [
    { data: clientes },
    { data: processos },
    { data: creditos },
    { data: comps },
    { data: statusRows },
    { data: totais },
    { data: teses },
  ] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, empresa, status, tese_ativa_id, criado_em")
      .eq("status", "ativo")
      .limit(5000),
    supabase.from("processos_teses").select("cliente_id, criado_em").limit(10000),
    (supabase as any).from("creditos_apurados").select("cliente_id, valor_apurado_inicial").limit(10000),
    supabase
      .from("compensacoes_mensais")
      .select("cliente_id, valor_compensado, mes_referencia, criado_em")
      .limit(10000),
    (supabase as any).from("v_clientes_status_compensacao").select("cliente_id, status_principal").limit(5000),
    (supabase as any)
      .from("v_cliente_totais_calculo")
      .select("cliente_id, saldo_restante, credito_apurado, total_compensado")
      .limit(5000),
    (supabase as any).from("teses_tributarias").select("id, label").limit(200),
  ]);

  const teseLabel = new Map(
    ((teses as { id: string; label: string }[]) || []).map((t) => [t.id, t.label]),
  );
  const statusMap = new Map(
    ((statusRows as { cliente_id: string; status_principal: string }[]) || []).map((s) => [
      s.cliente_id,
      s.status_principal,
    ]),
  );
  const saldoMap = new Map(
    ((totais as any[]) || []).map((t) => [t.cliente_id, Number(t.saldo_restante || 0)]),
  );

  const firstProc = new Map<string, string>();
  for (const p of (processos as any[]) || []) {
    const prev = firstProc.get(p.cliente_id);
    if (!prev || p.criado_em < prev) firstProc.set(p.cliente_id, p.criado_em);
  }

  const hasCredito = new Set(
    ((creditos as any[]) || [])
      .filter((c) => Number(c.valor_apurado_inicial || 0) > 0)
      .map((c) => c.cliente_id),
  );

  const firstComp = new Map<string, string>();
  const lastComp = new Map<string, string>();
  const totalCompCliente = new Map<string, number>();
  for (const c of (comps as any[]) || []) {
    const val = Number(c.valor_compensado || 0);
    if (val <= 0) continue;
    totalCompCliente.set(c.cliente_id, (totalCompCliente.get(c.cliente_id) || 0) + val);
    const ref = c.criado_em || c.mes_referencia;
    if (!firstComp.has(c.cliente_id) || ref < firstComp.get(c.cliente_id)!) {
      firstComp.set(c.cliente_id, ref);
    }
    if (!lastComp.has(c.cliente_id) || ref > lastComp.get(c.cliente_id)!) {
      lastComp.set(c.cliente_id, ref);
    }
  }

  // SLA heurístico (até o macrofluxo oficial do Paulo):
  // cadastrado >7d sem processo = atraso
  // com_processo >15d sem crédito = atraso
  // tese_ativa / com_credito >30d sem 1ª comp = atraso
  // compensando com saldo e >45d sem nova comp = atraso
  const SLA: Partial<Record<EtapaCiclo, number>> = {
    cadastrado: 7,
    com_processo: 15,
    com_credito: 30,
    tese_ativa: 30,
    compensando: 45,
  };

  const clientesCiclo: ClienteCiclo[] = ((clientes as any[]) || []).map((c) => {
    const status = statusMap.get(c.id) || "sem_operacao";
    const temProc = firstProc.has(c.id);
    const temCred = hasCredito.has(c.id);
    const temComp = firstComp.has(c.id);
    const saldo = saldoMap.get(c.id) || 0;

    let etapa: EtapaCiclo = "cadastrado";
    let etapaDesde = c.criado_em as string;

    if (status === "compensado" || (temComp && saldo <= 0.01)) {
      etapa = "compensado";
      etapaDesde = lastComp.get(c.id) || firstComp.get(c.id) || c.criado_em;
    } else if (temComp || status === "compensando") {
      etapa = "compensando";
      etapaDesde = lastComp.get(c.id) || firstComp.get(c.id) || c.criado_em;
    } else if (c.tese_ativa_id) {
      etapa = "tese_ativa";
      etapaDesde = firstProc.get(c.id) || c.criado_em;
    } else if (temCred) {
      etapa = "com_credito";
      etapaDesde = firstProc.get(c.id) || c.criado_em;
    } else if (temProc) {
      etapa = "com_processo";
      etapaDesde = firstProc.get(c.id)!;
    }

    const diasNaEtapa = daysBetween(etapaDesde);
    const sla = SLA[etapa];
    const atrasado = sla != null ? diasNaEtapa > sla : false;

    return {
      id: c.id,
      empresa: c.empresa || "—",
      etapa,
      diasNaEtapa,
      diasDesdeCadastro: daysBetween(c.criado_em),
      atrasado,
      status,
      teseAtiva: c.tese_ativa_id ? teseLabel.get(c.tese_ativa_id) || null : null,
      saldo,
      ultimaComp: lastComp.get(c.id) || null,
    };
  });

  const tempoMedioDias = {} as Record<EtapaCiclo, number | null>;
  (Object.keys(ETAPA_LABEL) as EtapaCiclo[]).forEach((e) => {
    const list = clientesCiclo.filter((c) => c.etapa === e);
    tempoMedioDias[e] =
      list.length > 0
        ? Math.round(list.reduce((s, c) => s + c.diasNaEtapa, 0) / list.length)
        : null;
  });

  return {
    clientes: clientesCiclo.sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || b.diasNaEtapa - a.diasNaEtapa),
    tempoMedioDias,
    atrasados: clientesCiclo.filter((c) => c.atrasado).length,
    semOperacao: clientesCiclo.filter((c) => c.status === "sem_operacao" || c.etapa === "cadastrado").length,
  };
}
