import { supabase } from "@/integrations/supabase/client";
import {
  compensacoesCanonicas,
  resumirFinanceiroPorCliente,
  type AcaoLike,
  type CompLike,
  type CreditoLike,
  type HistoricoEsteiraLike,
  type ProcessoLike,
  type TeseLike,
} from "@/lib/operacional-analytics";
import { listEsteiraClientes, type EsteiraCliente } from "@/services/esteiraService";
import { listEsteiraSlaConfig, type EsteiraSlaConfigRow } from "@/services/esteiraSlaConfigService";
import {
  normalizarStatusCompensacao,
  type StatusCompensacaoRow,
} from "@/lib/gerencial-filters";

const MS_DIA = 86_400_000;

export interface ClienteResumo {
  id: string;
  empresa: string;
  tese_ativa_id: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

export interface TotaisCliente {
  cliente_id: string;
  credito_apurado: number;
  total_compensado: number;
  saldo_restante: number;
}

export interface IntimacaoResumo {
  id: string;
  status: string;
  prazo_vencimento: string | null;
  created_at: string;
}

export interface OperacionalDashboardData {
  clientes: ClienteResumo[];
  comps: CompLike[];
  creditos: CreditoLike[];
  teses: TeseLike[];
  processos: ProcessoLike[];
  totais: TotaisCliente[];
  statusRows: StatusCompensacaoRow[];
  esteira: EsteiraCliente[];
  slaConfig: EsteiraSlaConfigRow[];
  esteiraHistorico: HistoricoEsteiraLike[];
  acoes: AcaoLike[];
  /** user_id → nome (para ações do time). */
  nomes: Record<string, string>;
  intimacoes: IntimacaoResumo[];
  qualidade: {
    compensacoesForaDaCarteiraAtiva: number;
    lancamentosForaDaRegraCanonica: number;
    statusForaDaCarteiraAtiva: number;
    clientesSemBaseFinanceira: number;
    clientesComSnapshotManual: number;
    clientesSemEtapa: number;
    clientesEmEtapaSemConfig: number;
  };
}

/**
 * Leitura única para as três visões do Dashboard operacional (Operacional,
 * Executiva e Pulso da semana). Trocar de aba não dispara consulta nova.
 */
export async function fetchOperacionalDashboard(): Promise<OperacionalDashboardData> {
  const agora = Date.now();
  const desde30 = new Date(agora - 30 * MS_DIA).toISOString();
  const desde7 = new Date(agora - 7 * MS_DIA).toISOString();
  // Views/tabelas fora do types.ts gerado (creditos_apurados, v_*): mesmo padrão dos outros services.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [
    clientesRes,
    compsRes,
    creditosRes,
    tesesRes,
    processosRes,
    statusRes,
    esteira,
    slaConfig,
    histRes,
    acoesRes,
    profilesRes,
    intimRes,
  ] = await Promise.all([
    supabase.from("clientes").select("id, empresa, tese_ativa_id, criado_em, atualizado_em").eq("status", "ativo").limit(5000),
    supabase
      .from("compensacoes_mensais")
      .select("cliente_id, mes_referencia, valor_compensado, honorario_valor, valor_nf_servico, tese_origem_id, processo_tese_id, tributo_enum, tributo, criado_em")
      .limit(10000),
    db.from("creditos_apurados").select("cliente_id, tese_id, valor_apurado_inicial, valor_compensado_manual, incluir_no_calculo").limit(10000),
    db.from("teses_tributarias").select("id, codigo, label, incluir_no_calculo").limit(200),
    supabase
      .from("processos_teses")
      .select("id, cliente_id, tese, nome_exibicao, criado_em, valor_credito, status_contrato, status_processo, categoria, tipo_recuperacao")
      .limit(10000),
    db
      .from("v_clientes_status_compensacao")
      .select("cliente_id, status_principal, tem_compensacao_mes_corrente, tem_tese_ativa, todos_encerrados, tem_reporto")
      .limit(5000),
    listEsteiraClientes(),
    listEsteiraSlaConfig(),
    supabase
      .from("esteira_historico")
      .select("cliente_id, estagio, entrou_em, saiu_em, origem, responsavel_id")
      .gte("entrou_em", desde30)
      .limit(5000),
    db.from("cliente_historico").select("cliente_id, tipo, usuario_id, created_at").gte("created_at", desde7).limit(2000),
    supabase.from("profiles").select("user_id, full_name").limit(500),
    supabase.from("intimacoes").select("id, status, prazo_vencimento, created_at").limit(2000),
  ]);

  if (clientesRes.error) throw clientesRes.error;
  if (compsRes.error) throw compsRes.error;
  if (creditosRes.error) throw creditosRes.error;
  if (tesesRes.error) throw tesesRes.error;
  if (processosRes.error) throw processosRes.error;
  if (statusRes.error) throw statusRes.error;
  if (histRes.error) throw histRes.error;
  if (acoesRes.error) throw acoesRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (intimRes.error) throw intimRes.error;

  const nomes: Record<string, string> = {};
  for (const p of profilesRes.data ?? []) nomes[p.user_id] = p.full_name;
  const clientes = (clientesRes.data ?? []).map((c) => ({
    id: c.id,
    empresa: c.empresa || "—",
    tese_ativa_id: c.tese_ativa_id ?? null,
    criado_em: c.criado_em ?? null,
    atualizado_em: c.atualizado_em ?? null,
  }));
  const idsAtivos = new Set(clientes.map((c) => c.id));
  const compsTodos = (compsRes.data ?? []) as CompLike[];
  const creditosTodos = (creditosRes.data ?? []) as CreditoLike[];
  const processosTodos = (processosRes.data ?? []) as ProcessoLike[];
  const statusTodos = (statusRes.data ?? []) as StatusCompensacaoRow[];
  if (compsTodos.length === 10_000 || creditosTodos.length === 10_000 || processosTodos.length === 10_000) {
    throw new Error("Base operacional atingiu o limite de leitura; os totais não seriam completos.");
  }
  const compsAtivos = compsTodos.filter((row) => idsAtivos.has(row.cliente_id));
  const creditos = creditosTodos.filter((row) => idsAtivos.has(row.cliente_id));
  const processos = processosTodos.filter((row) => idsAtivos.has(row.cliente_id));
  const teses = (tesesRes.data ?? []) as TeseLike[];
  const comps = compensacoesCanonicas(compsAtivos, teses, processos);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const clientesComCompensacaoMes = new Set(
    comps
      .filter(
        (row) =>
          Number(row.valor_compensado ?? 0) > 0 &&
          String(row.mes_referencia).slice(0, 7) === mesAtual,
      )
      .map((row) => row.cliente_id),
  );
  const statusRows = statusTodos
    .filter((row) => idsAtivos.has(row.cliente_id))
    .map((row) => {
      const reconciliada = {
        ...row,
        tem_compensacao_mes_corrente: clientesComCompensacaoMes.has(row.cliente_id),
      };
      return { ...reconciliada, status_principal: normalizarStatusCompensacao(reconciliada) };
    });
  const totaisCanonicos = resumirFinanceiroPorCliente(idsAtivos, comps, creditos, teses, processos);
  const configStages = new Set(slaConfig.map((row) => row.estagio as string));

  return {
    clientes,
    comps,
    creditos,
    teses,
    processos,
    totais: totaisCanonicos.map((t) => ({
      cliente_id: t.cliente_id,
      credito_apurado: t.credito_apurado,
      total_compensado: t.total_compensado,
      saldo_restante: t.saldo_restante,
    })),
    statusRows,
    esteira,
    slaConfig,
    esteiraHistorico: (histRes.data ?? []) as HistoricoEsteiraLike[],
    acoes: (acoesRes.data ?? []) as AcaoLike[],
    nomes,
    intimacoes: (intimRes.data ?? []) as IntimacaoResumo[],
    qualidade: {
      compensacoesForaDaCarteiraAtiva: compsTodos.filter((row) => !idsAtivos.has(row.cliente_id)).length,
      lancamentosForaDaRegraCanonica: compsAtivos.length - comps.length,
      statusForaDaCarteiraAtiva: statusTodos.filter((row) => !idsAtivos.has(row.cliente_id)).length,
      clientesSemBaseFinanceira: totaisCanonicos.filter((row) => row.sem_base_financeira).length,
      clientesComSnapshotManual: new Set(
        creditos
          .filter((row) => row.valor_compensado_manual != null)
          .map((row) => row.cliente_id),
      ).size,
      clientesSemEtapa: esteira.filter((row) => !row.estagio_esteira).length,
      clientesEmEtapaSemConfig: esteira.filter(
        (row) => !!row.estagio_esteira && !configStages.has(row.estagio_esteira),
      ).length,
    },
  };
}
