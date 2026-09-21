/**
 * Regras puras dos dashboards operacionais: série mensal com projeção,
 * carteira por tese, geração de teses, carga por responsável, resumo da
 * esteira e o pulso semanal (movimentos + ações do time).
 */
import { MONTH_ABBR } from "@/components/dashboard/dashboard-utils";
import {
  ESTEIRA_STAGES,
  ESTEIRA_STAGES_TERMINAIS,
  type EstagioEsteira,
} from "@/lib/esteira-constants";
import {
  filterCompensadoCanonical,
  isReportoProcesso,
  mergeCreditosComProcessosFallback,
  processoTeseCatalogCodigo,
} from "@/lib/clientes-constants";
import { buildLinhasMapa, calcularTotais } from "@/lib/mapa-creditos";
import { currentMonthKey, monthKeyBrt, shiftMonthKey } from "@/lib/month-key";

const MS_DIA = 86_400_000;

// ───────────────────────────────────────── Série mensal

export interface CompLike {
  cliente_id: string;
  mes_referencia: string;
  valor_compensado: number | null;
  honorario_valor?: number | null;
  valor_nf_servico?: number | null;
  tese_origem_id?: string | null;
  processo_tese_id?: string | null;
  criado_em?: string | null;
  tributo_enum?: string | null;
  tributo?: string | null;
}

export interface PontoMensal {
  /** `YYYY-MM` */
  mes: string;
  /** `Mmm/aa` */
  label: string;
  compensado: number;
  honorarios: number;
  projecao?: boolean;
}

export function chaveMes(d: Date): string {
  return monthKeyBrt(d);
}

export function labelMes(chave: string): string {
  const mm = chave.slice(5, 7);
  return `${MONTH_ABBR[mm] ?? mm}/${chave.slice(2, 4)}`;
}

export function honorarioDe(c: Pick<CompLike, "honorario_valor" | "valor_nf_servico">): number {
  return Number(c.honorario_valor ?? c.valor_nf_servico ?? 0);
}

export interface ResumoFinanceiroCliente {
  cliente_id: string;
  credito_apurado: number;
  total_compensado: number;
  saldo_restante: number;
  honorarios: number;
  sem_base_financeira: boolean;
}

/**
 * Consolida a carteira com a mesma régua do mapa do cliente:
 * teses marcadas em `incluir_no_calculo`, compensação canônica por tese,
 * snapshot manual quando maior e os mesmos fallbacks de processo/REPORTO.
 */
export function resumirFinanceiroPorCliente(
  clienteIds: Iterable<string>,
  comps: CompLike[],
  creditos: CreditoLike[],
  teses: TeseLike[],
  processos: ProcessoLike[],
): ResumoFinanceiroCliente[] {
  const ids = new Set(clienteIds);
  const compsAtivas = comps.filter((row) => ids.has(row.cliente_id));
  const creditosAtivos = creditos.filter((row) => ids.has(row.cliente_id));
  const processosAtivos = processos.filter((row) => ids.has(row.cliente_id));
  const teseIdByCodigo = new Map(
    teses
      .filter((t) => t.id && t.codigo)
      .map((t) => [String(t.codigo).toUpperCase(), t.id]),
  );
  const reportoTeseIds = new Set(
    teses.filter((t) => String(t.codigo || "").toUpperCase() === "REPORTO").map((t) => t.id),
  );

  return [...ids].map((clienteId) => {
    const compsCliente = compsAtivas.filter((row) => row.cliente_id === clienteId);
    const processosCliente = processosAtivos.filter((row) => row.cliente_id === clienteId);
    const creditosCliente = creditosAtivos.filter((row) => row.cliente_id === clienteId);
    const reportoProcessoIds = new Set(
      processosCliente
        .filter(isReportoProcesso)
        .map((p) => p.id),
    );
    const creditosComFallback = mergeCreditosComProcessosFallback({
      creditos: creditosCliente,
      processos: processosCliente,
      teseIdByCodigo,
    });
    const teseInfo = new Map(teses.map((t) => [t.id, t]));
    const linhasMapa = buildLinhasMapa({
      mapa: creditosComFallback.map((credito) => {
        const tese = teseInfo.get(credito.tese_id);
        return {
          cliente_id: clienteId,
          tese_id: credito.tese_id,
          tese_codigo: String(tese?.codigo || credito.tese_id).toUpperCase(),
          tese_label: tese?.label || tese?.codigo || "Tese",
          visivel_cliente: true,
          valor_apurado_inicial: Number(credito.valor_apurado_inicial ?? 0),
          total_compensado: 0,
          saldo_final: Number(credito.valor_apurado_inicial ?? 0),
          incluir_no_calculo: credito.incluir_no_calculo ?? undefined,
        };
      }),
      compensacoes: compsCliente,
      processos: processosCliente.map((p) => ({
        id: p.id,
        tese: p.tese,
        nome_exibicao: p.nome_exibicao,
        categoria: p.categoria,
      })),
      creditos: creditosCliente.map((credito) => ({
        tese_id: credito.tese_id,
        valor_compensado_manual: credito.valor_compensado_manual ?? null,
      })),
    });
    // O mapa interno esconde REPORTO por padrão; o consolidado operacional
    // usa exatamente esse mesmo recorte financeiro.
    const totaisMapa = calcularTotais(
      linhasMapa.filter((linha) => linha.tese_codigo !== "REPORTO"),
    );
    const compsCanonicas = filterCompensadoCanonical(compsCliente, {
      reportoTeseIds,
      reportoProcessoIds,
    });
    return {
      cliente_id: clienteId,
      credito_apurado: totaisMapa.apurado,
      total_compensado: totaisMapa.compensado,
      saldo_restante: totaisMapa.saldo,
      honorarios: compsCanonicas.reduce((sum, row) => sum + honorarioDe(row), 0),
      sem_base_financeira:
        creditosCliente.length === 0 &&
        !processosCliente.some((p) => Number(p.valor_credito ?? 0) !== 0),
    };
  });
}

/** Mantém só os lançamentos que entram nos totais das fichas dos clientes. */
export function compensacoesCanonicas(
  comps: CompLike[],
  teses: TeseLike[],
  processos: ProcessoLike[],
): CompLike[] {
  const reportoTeseIds = new Set(
    teses.filter((t) => String(t.codigo || "").toUpperCase() === "REPORTO").map((t) => t.id),
  );
  const reportoProcessoIds = new Set(
    processos
      .filter(isReportoProcesso)
      .map((p) => p.id),
  );
  const porCliente = new Map<string, CompLike[]>();
  for (const row of comps) {
    const atuais = porCliente.get(row.cliente_id) ?? [];
    atuais.push(row);
    porCliente.set(row.cliente_id, atuais);
  }
  return [...porCliente.values()].flatMap((rows) =>
    filterCompensadoCanonical(rows, { reportoTeseIds, reportoProcessoIds }),
  );
}

/** Últimos `meses` meses (até o corrente), sem buracos. */
export function serieMensal(comps: CompLike[], meses = 12, agora: number = Date.now()): PontoMensal[] {
  const mesCorrente = currentMonthKey(agora);
  const pontos: PontoMensal[] = [];
  const idx = new Map<string, number>();
  for (let i = meses - 1; i >= 0; i--) {
    const k = shiftMonthKey(mesCorrente, -i);
    idx.set(k, pontos.length);
    pontos.push({ mes: k, label: labelMes(k), compensado: 0, honorarios: 0 });
  }
  for (const c of comps) {
    const i = idx.get(String(c.mes_referencia).slice(0, 7));
    if (i === undefined) continue;
    pontos[i].compensado += Number(c.valor_compensado ?? 0);
    pontos[i].honorarios += honorarioDe(c);
  }
  return pontos;
}

function regressao(valores: number[], passos: number): number[] {
  const n = valores.length;
  if (n === 0) return Array.from({ length: passos }, () => 0);
  if (n < 2) return Array.from({ length: passos }, () => Math.max(0, valores[0]));
  const mx = (n - 1) / 2;
  const my = valores.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (valores[i] - my);
    den += (i - mx) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  const a = my - b * mx;
  return Array.from({ length: passos }, (_, k) => Math.max(0, Math.round(a + b * (n + k))));
}

/**
 * Projeta `passos` meses à frente com regressão linear sobre os últimos
 * `janela` meses fechados (o mês corrente, parcial, fica fora da base).
 */
export function projetarMensal(serie: PontoMensal[], passos = 3, janela = 6): PontoMensal[] {
  if (serie.length === 0) return [];
  const fechados = serie.length > 1 ? serie.slice(0, -1) : serie;
  const base = fechados.slice(-janela);
  const comp = regressao(base.map((p) => p.compensado), passos);
  const hon = regressao(base.map((p) => p.honorarios), passos);
  const ultimoMes = serie[serie.length - 1].mes;
  const out: PontoMensal[] = [];
  for (let k = 0; k < passos; k++) {
    const chave = shiftMonthKey(ultimoMes, k + 1);
    out.push({ mes: chave, label: labelMes(chave), compensado: comp[k], honorarios: hon[k], projecao: true });
  }
  return out;
}

export interface ComparativoMensal {
  atual: number;
  anterior: number;
  /** Variação % do mês anterior para o atual (null sem base). */
  variacaoPct: number | null;
  mediaFechados: number;
}

export function comparativoMensal(serie: PontoMensal[], campo: "compensado" | "honorarios" = "compensado"): ComparativoMensal {
  const n = serie.length;
  const atual = n > 0 ? serie[n - 1][campo] : 0;
  const anterior = n > 1 ? serie[n - 2][campo] : 0;
  const fechados = n > 1 ? serie.slice(0, -1) : serie;
  const comValor = fechados.filter((p) => p[campo] > 0);
  const media = comValor.length > 0 ? comValor.reduce((s, p) => s + p[campo], 0) / comValor.length : 0;
  return {
    atual,
    anterior,
    variacaoPct: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null,
    mediaFechados: media,
  };
}

// ───────────────────────────────────────── Carteira por tese

export interface TeseLike {
  id: string;
  codigo?: string | null;
  label?: string | null;
  incluir_no_calculo?: boolean | null;
}

export interface CreditoLike {
  cliente_id: string;
  tese_id: string;
  valor_apurado_inicial: number | null;
  incluir_no_calculo?: boolean | null;
  valor_compensado_manual?: number | null;
}

export interface ProcessoLike {
  id: string;
  cliente_id: string;
  tese: string;
  nome_exibicao?: string | null;
  criado_em: string | null;
  valor_credito?: number | null;
  status_contrato?: string | null;
  status_processo?: string | null;
  categoria?: string | null;
  tipo_recuperacao?: string | null;
}

export interface TeseCarteiraRow {
  tese_id: string;
  codigo: string;
  label: string;
  clientes: number;
  processos: number;
  apurado: number;
  compensado: number;
  saldo: number;
  /** % do apurado já compensado (0–100, pode passar de 100 se compensou mais). */
  pctUtilizado: number;
  /** Participação no apurado da carteira (0–100). */
  share: number;
}

/**
 * Junta crédito apurado (por tese_id), compensações (tese_origem_id) e
 * processos (código da tese) numa linha por tese. Só teses com algum dado
 * entram; ordena por apurado. Compensação sem tese vira "Sem tese vinculada".
 */
export function carteiraPorTese(teses: TeseLike[], creditos: CreditoLike[], comps: CompLike[], processos: ProcessoLike[] = []): TeseCarteiraRow[] {
  const porId = new Map<string, TeseCarteiraRow>();
  const clientesPorTese = new Map<string, Set<string>>();
  const linha = (id: string): TeseCarteiraRow => {
    let row = porId.get(id);
    if (!row) {
      const t = teses.find((x) => x.id === id);
      row = {
        tese_id: id,
        codigo: t?.codigo ?? (id === "__sem_tese__" ? "—" : id.slice(0, 8)),
        label: t?.label ?? (id === "__sem_tese__" ? "Sem tese vinculada" : t?.codigo ?? "Tese"),
        clientes: 0,
        processos: 0,
        apurado: 0,
        compensado: 0,
        saldo: 0,
        pctUtilizado: 0,
        share: 0,
      };
      porId.set(id, row);
      clientesPorTese.set(id, new Set());
    }
    return row;
  };
  for (const c of creditos) {
    if (c.incluir_no_calculo === false) continue;
    const r = linha(c.tese_id);
    r.apurado += Number(c.valor_apurado_inicial ?? 0);
    clientesPorTese.get(c.tese_id)!.add(c.cliente_id);
  }
  for (const c of comps) {
    const id = c.tese_origem_id || "__sem_tese__";
    const r = linha(id);
    r.compensado += Number(c.valor_compensado ?? 0);
    clientesPorTese.get(id)!.add(c.cliente_id);
  }
  const porCodigo = new Map(teses.filter((t) => t.codigo).map((t) => [String(t.codigo).toUpperCase(), t.id]));
  for (const p of processos) {
    const codigo = processoTeseCatalogCodigo(p);
    const id = codigo ? porCodigo.get(String(codigo).toUpperCase()) : undefined;
    if (!id) continue;
    const r = linha(id);
    r.processos += 1;
    clientesPorTese.get(id)!.add(p.cliente_id);
  }
  const rows = [...porId.values()];
  const totalApurado = rows.reduce((s, r) => s + r.apurado, 0);
  for (const r of rows) {
    r.clientes = clientesPorTese.get(r.tese_id)?.size ?? 0;
    r.saldo = r.apurado - r.compensado;
    r.pctUtilizado = r.apurado > 0 ? Math.round((r.compensado / r.apurado) * 100) : 0;
    r.share = totalApurado > 0 ? Math.round((r.apurado / totalApurado) * 1000) / 10 : 0;
  }
  return rows.sort((a, b) => b.apurado - a.apurado || b.compensado - a.compensado);
}

// ───────────────────────────────────────── Geração de teses

export interface PontoGeracao {
  mes: string;
  label: string;
  novos: number;
  clientes: number;
}

/** Processos (teses assinadas/cadastradas) criados por mês nos últimos `meses`. */
export function geracaoTesesPorMes(processos: Pick<ProcessoLike, "cliente_id" | "criado_em">[], meses = 6, agora: number = Date.now()): PontoGeracao[] {
  const mesCorrente = currentMonthKey(agora);
  const pontos: PontoGeracao[] = [];
  const idx = new Map<string, number>();
  const clientes: Set<string>[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const k = shiftMonthKey(mesCorrente, -i);
    idx.set(k, pontos.length);
    pontos.push({ mes: k, label: labelMes(k), novos: 0, clientes: 0 });
    clientes.push(new Set());
  }
  for (const p of processos) {
    if (!p.criado_em) continue;
    const i = idx.get(String(p.criado_em).slice(0, 7));
    if (i === undefined) continue;
    pontos[i].novos += 1;
    clientes[i].add(p.cliente_id);
  }
  pontos.forEach((p, i) => (p.clientes = clientes[i].size));
  return pontos;
}

// ───────────────────────────────────────── Esteira

export interface EsteiraClienteLike {
  id: string;
  empresa?: string | null;
  estagio_esteira: string | null;
  dias_na_etapa?: number | null;
  sla_dias?: number | null;
  atrasado?: boolean | null;
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
  teses_assinadas?: number | null;
  ultima_acao_em?: string | null;
}

export interface EsteiraConfigLike {
  estagio: string;
  label: string;
  sla_dias: number | null;
  ordem: number;
  ativo: boolean;
}

export interface EtapaEsteiraResumo {
  estagio: string;
  label: string;
  sla: number | null;
  clientes: number;
  atrasados: number;
  diasMedios: number | null;
  /** Soma dos dias acima do SLA na etapa. */
  atrasoAcumulado: number;
}

export function clienteAtrasado(c: EsteiraClienteLike, sla: number | null | undefined): boolean {
  if (ESTEIRA_STAGES_TERMINAIS.includes(c.estagio_esteira as EstagioEsteira)) return false;
  if (typeof c.atrasado === "boolean") return c.atrasado;
  if (sla == null) return false;
  return (c.dias_na_etapa ?? 0) > sla;
}

/** Uma linha por etapa ativa (ou com cliente), na ordem da config. */
export function resumoEsteira(clientes: EsteiraClienteLike[], config: EsteiraConfigLike[]): EtapaEsteiraResumo[] {
  const ordenada = [...config].sort((a, b) => a.ordem - b.ordem);
  const configuradas = new Set(ordenada.map((cfg) => cfg.estagio));
  const extras = [...new Set(
    clientes
      .map((c) => c.estagio_esteira || "__sem_etapa__")
      .filter((estagio) => !configuradas.has(estagio)),
  )].map((estagio, index) => ({
    estagio,
    label: estagio === "__sem_etapa__" ? "Sem etapa configurada" : `Etapa não configurada: ${estagio}`,
    sla_dias: null,
    ordem: Number.MAX_SAFE_INTEGER - 100 + index,
    ativo: false,
  }));
  return [...ordenada, ...extras]
    .map((cfg) => {
      const daEtapa = clientes.filter(
        (c) => (c.estagio_esteira || "__sem_etapa__") === cfg.estagio,
      );
      let atrasados = 0;
      let acumulado = 0;
      for (const c of daEtapa) {
        const sla = c.sla_dias ?? cfg.sla_dias;
        if (clienteAtrasado(c, sla)) {
          atrasados += 1;
          acumulado += Math.max(0, (c.dias_na_etapa ?? 0) - (sla ?? 0));
        }
      }
      return {
        estagio: cfg.estagio,
        label: cfg.label,
        sla: cfg.sla_dias,
        clientes: daEtapa.length,
        atrasados,
        diasMedios: daEtapa.length ? Math.round(daEtapa.reduce((s, c) => s + (c.dias_na_etapa ?? 0), 0) / daEtapa.length) : null,
        atrasoAcumulado: acumulado,
      };
    })
    .filter((e) => e.clientes > 0 || config.find((c) => c.estagio === e.estagio)?.ativo);
}

export interface CargaResponsavel {
  responsavel_id: string | null;
  nome: string;
  clientes: number;
  atrasados: number;
  emCompensacao: number;
  semAcao7d: number;
  tesesAssinadas: number;
}

/** Distribuição da esteira por responsável — quem está sobrecarregado e quem tem fila atrasada. */
export function cargaPorResponsavel(clientes: EsteiraClienteLike[], slaPorEtapa: Map<string, number | null> = new Map(), agora: number = Date.now()): CargaResponsavel[] {
  const acc = new Map<string, CargaResponsavel>();
  for (const c of clientes) {
    if (ESTEIRA_STAGES_TERMINAIS.includes(c.estagio_esteira as EstagioEsteira)) continue;
    const key = c.responsavel_id ?? "__sem__";
    const cur = acc.get(key) ?? {
      responsavel_id: c.responsavel_id ?? null,
      nome: c.responsavel_nome ?? (c.responsavel_id ? "Sem nome" : "Sem responsável"),
      clientes: 0,
      atrasados: 0,
      emCompensacao: 0,
      semAcao7d: 0,
      tesesAssinadas: 0,
    };
    cur.clientes += 1;
    if (clienteAtrasado(c, c.sla_dias ?? slaPorEtapa.get(c.estagio_esteira ?? ""))) cur.atrasados += 1;
    if (c.estagio_esteira === "em_compensacao") cur.emCompensacao += 1;
    cur.tesesAssinadas += Number(c.teses_assinadas ?? 0);
    const t = c.ultima_acao_em ? new Date(c.ultima_acao_em).getTime() : NaN;
    if (!Number.isFinite(t) || agora - t > 7 * MS_DIA) cur.semAcao7d += 1;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.atrasados - a.atrasados || b.clientes - a.clientes || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ───────────────────────────────────────── Pulso semanal

export interface HistoricoEsteiraLike {
  cliente_id: string;
  estagio: string;
  entrou_em: string;
  saiu_em: string | null;
  origem?: string | null;
  responsavel_id?: string | null;
}

export interface MovimentoEtapa {
  estagio: string;
  label: string;
  entradas: number;
}

export interface MovimentosEsteira {
  total: number;
  clientes: number;
  concluidos: number;
  porEtapa: MovimentoEtapa[];
}

const LABEL_ETAPA: Record<string, string> = Object.fromEntries(ESTEIRA_STAGES.map((s) => [s.value, s.label]));

/** Entradas em etapas desde `desdeIso` (mais movimento = esteira andando). */
export function movimentosEsteira(historico: HistoricoEsteiraLike[], desdeIso: string, labels: Record<string, string> = LABEL_ETAPA): MovimentosEsteira {
  const desde = new Date(desdeIso).getTime();
  const acc = new Map<string, number>();
  const clientes = new Set<string>();
  let concluidos = 0;
  let total = 0;
  for (const h of historico) {
    if (h.origem !== "sistema") continue;
    const t = new Date(h.entrou_em).getTime();
    if (!Number.isFinite(t) || t < desde) continue;
    total += 1;
    clientes.add(h.cliente_id);
    acc.set(h.estagio, (acc.get(h.estagio) ?? 0) + 1);
    if (h.estagio === "concluido") concluidos += 1;
  }
  const porEtapa = ESTEIRA_STAGES.map((s) => ({ estagio: s.value as EstagioEsteira, label: labels[s.value] ?? s.label, entradas: acc.get(s.value) ?? 0 })).filter((e) => e.entradas > 0);
  return { total, clientes: clientes.size, concluidos, porEtapa };
}

export interface AcaoLike {
  tipo: string;
  usuario_id: string | null;
  created_at: string;
  cliente_id?: string;
}

export const TIPO_ACAO_LABEL: Record<string, string> = {
  esteira: "Movimento na esteira",
  esteira_realocacao: "Realocação na esteira",
  esteira_reset_sla: "SLA reiniciado",
  esteira_sla_reiniciado: "SLA reiniciado",
  compensacao_adicionada: "Compensação lançada",
  compensacao_removida: "Compensação removida",
  comunicado_enviado: "Comunicado enviado",
  responsavel: "Troca de responsável",
  status: "Mudança de status",
  tese_ativa: "Tese em uso alterada",
  processo: "Processo / tese",
  compensacao: "Compensação",
  compensacoes: "Compensação",
  importacao: "Importação",
  observacao: "Observação",
  cadastro: "Cadastro",
  edicao: "Edição",
  mapa: "Mapa de créditos",
};

export function labelTipoAcao(tipo: string): string {
  if (TIPO_ACAO_LABEL[tipo]) return TIPO_ACAO_LABEL[tipo];
  const base = tipo.split(/[_\-.]/).filter(Boolean).join(" ");
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Outro";
}

export interface ContagemRotulada {
  key: string;
  label: string;
  count: number;
}

export function acoesPorTipo(acoes: AcaoLike[]): ContagemRotulada[] {
  const acc = new Map<string, number>();
  for (const a of acoes) acc.set(a.tipo, (acc.get(a.tipo) ?? 0) + 1);
  return [...acc.entries()].map(([key, count]) => ({ key, label: labelTipoAcao(key), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

export function acoesPorUsuario(acoes: AcaoLike[], nomes: Map<string, string>): ContagemRotulada[] {
  const acc = new Map<string, number>();
  for (const a of acoes) {
    const k = a.usuario_id ?? "__sistema__";
    acc.set(k, (acc.get(k) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([key, count]) => ({ key, label: key === "__sistema__" ? "Sistema / automações" : nomes.get(key) ?? "Usuário", count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

// ───────────────────────────────────────── Fila de prioridade

export interface ClientePrioridade {
  id: string;
  empresa: string;
  saldo: number;
  estagio: string;
  estagioLabel: string;
  dias: number;
  atrasado: boolean;
  responsavel: string | null;
  motivo: "atrasado" | "saldo_alto" | "sem_acao";
}

/**
 * Quem destravar primeiro: atrasados no SLA (por dias acima), depois saldo
 * alto parado, depois clientes sem ação registrada há 14 dias.
 */
export function filaPrioridade(
  clientes: EsteiraClienteLike[],
  saldoPorCliente: Map<string, number>,
  config: EsteiraConfigLike[],
  limite = 8,
  agora: number = Date.now(),
): ClientePrioridade[] {
  const labels = new Map(config.map((c) => [c.estagio, c.label]));
  const slas = new Map(config.map((c) => [c.estagio, c.sla_dias]));
  const terminal = new Set(["concluido", "devolutiva_cliente"]);
  const rows: (ClientePrioridade & { peso: number })[] = [];
  for (const c of clientes) {
    if (terminal.has(c.estagio_esteira ?? "")) continue;
    const sla = c.sla_dias ?? slas.get(c.estagio_esteira ?? "") ?? null;
    const dias = c.dias_na_etapa ?? 0;
    const atrasado = clienteAtrasado(c, sla);
    const saldo = saldoPorCliente.get(c.id) ?? 0;
    const t = c.ultima_acao_em ? new Date(c.ultima_acao_em).getTime() : NaN;
    const semAcao = !Number.isFinite(t) || agora - t > 14 * MS_DIA;
    let motivo: ClientePrioridade["motivo"] | null = null;
    let peso = 0;
    if (atrasado) {
      motivo = "atrasado";
      peso = 1_000_000 + (dias - (sla ?? 0)) * 1000 + saldo / 1_000_000;
    } else if (saldo >= 500_000) {
      motivo = "saldo_alto";
      peso = 500_000 + saldo / 1000;
    } else if (semAcao && saldo > 0) {
      motivo = "sem_acao";
      peso = 100_000 + dias;
    }
    if (!motivo) continue;
    rows.push({
      id: c.id,
      empresa: c.empresa ?? "—",
      saldo,
      estagio: c.estagio_esteira ?? "__sem_etapa__",
      estagioLabel: c.estagio_esteira
        ? labels.get(c.estagio_esteira) ?? LABEL_ETAPA[c.estagio_esteira] ?? c.estagio_esteira
        : "Sem etapa configurada",
      dias,
      atrasado,
      responsavel: c.responsavel_nome ?? null,
      motivo,
      peso,
    });
  }
  return rows
    .sort((a, b) => b.peso - a.peso)
    .slice(0, limite)
    .map(({ peso: _peso, ...r }) => r);
}
