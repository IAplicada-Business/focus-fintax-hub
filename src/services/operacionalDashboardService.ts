import { supabase } from "@/integrations/supabase/client";
import type { AcaoLike, CompLike, CreditoLike, HistoricoEsteiraLike, ProcessoLike, TeseLike } from "@/lib/operacional-analytics";
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
    totaisRes,
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
      .select("cliente_id, mes_referencia, valor_compensado, honorario_valor, valor_nf_servico, tese_origem_id, tributo_enum, tributo, criado_em")
      .limit(10000),
    db.from("creditos_apurados").select("cliente_id, tese_id, valor_apurado_inicial, incluir_no_calculo").limit(10000),
    db.from("teses_tributarias").select("id, codigo, label, incluir_no_calculo").limit(200),
    supabase
      .from("processos_teses")
      .select("id, cliente_id, tese, nome_exibicao, criado_em, valor_credito, status_contrato, status_processo, categoria, tipo_recuperacao")
      .limit(10000),
    db.from("v_cliente_totais_calculo").select("cliente_id, credito_apurado, total_compensado, saldo_restante").limit(5000),
    db
      .from("v_clientes_status_compensacao")
      .select("cliente_id, status_principal, tem_compensacao_mes_corrente, tem_tese_ativa, todos_encerrados, tem_reporto")
      .limit(5000),
    listEsteiraClientes().catch(() => [] as EsteiraCliente[]),
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

  const nomes: Record<string, string> = {};
  for (const p of profilesRes.data ?? []) nomes[p.user_id] = p.full_name;

  return {
    clientes: (clientesRes.data ?? []).map((c) => ({
      id: c.id,
      empresa: c.empresa || "—",
      tese_ativa_id: c.tese_ativa_id ?? null,
      criado_em: c.criado_em ?? null,
      atualizado_em: c.atualizado_em ?? null,
    })),
    comps: (compsRes.data ?? []) as CompLike[],
    creditos: (creditosRes.data ?? []) as CreditoLike[],
    teses: (tesesRes.data ?? []) as TeseLike[],
    processos: (processosRes.data ?? []) as ProcessoLike[],
    totais: ((totaisRes.data ?? []) as TotaisCliente[]).map((t) => ({
      cliente_id: t.cliente_id,
      credito_apurado: Number(t.credito_apurado ?? 0),
      total_compensado: Number(t.total_compensado ?? 0),
      saldo_restante: Number(t.saldo_restante ?? 0),
    })),
    statusRows: ((statusRes.data ?? []) as StatusCompensacaoRow[]).map((row) => ({
      ...row,
      status_principal: normalizarStatusCompensacao(row),
    })),
    esteira,
    slaConfig,
    esteiraHistorico: (histRes.data ?? []) as HistoricoEsteiraLike[],
    acoes: (acoesRes.data ?? []) as AcaoLike[],
    nomes,
    intimacoes: (intimRes.data ?? []) as IntimacaoResumo[],
  };
}
