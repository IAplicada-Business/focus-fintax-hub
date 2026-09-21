/**
 * Regras puras do Dashboard comercial: séries semanais, projeção linear,
 * pipeline ponderado, conversão entre etapas, origem dos leads e pulso do
 * atendimento. Sem Supabase aqui — quem busca é o service; quem testa é o vitest.
 */
import { STAGE_MERGE_MAP } from "@/lib/pipeline-constants";

const MS_DIA = 86_400_000;

export interface LeadAnalitico {
  id: string;
  status_funil?: string | null;
  criado_em?: string | null;
  status_funil_atualizado_em?: string | null;
  segmento?: string | null;
  regime_tributario?: string | null;
  score_lead?: number | null;
  origem?: string | null;
  /** Potencial máximo do relatório (0 quando não há diagnóstico). */
  potencial?: number | null;
}

export interface HistoricoLeadLike {
  lead_id: string;
  para_etapa: string;
  criado_em: string | null;
}

export const ETAPAS_PERDIDAS = new Set(["perdido", "nao_vai_fazer"]);

export function etapaUnificada(status: string | null | undefined): string {
  const raw = (status ?? "").trim() || "novo";
  return STAGE_MERGE_MAP[raw] ?? raw;
}

export function leadAtivo(l: Pick<LeadAnalitico, "status_funil">): boolean {
  return !ETAPAS_PERDIDAS.has(etapaUnificada(l.status_funil));
}

/** Coluna final do funil: leads realmente convertidos, não a carteira inteira. */
export function clientesConvertidosNoFunil(
  leads: Pick<LeadAnalitico, "status_funil">[],
): number {
  return leads.filter((lead) => etapaUnificada(lead.status_funil) === "cliente_ativo").length;
}

// ───────────────────────────────────────── Série semanal (novos × conversões)

export interface PontoSemanal {
  /** Segunda-feira da semana, `YYYY-MM-DD`. */
  semana: string;
  /** `dd/mm` da segunda-feira. */
  label: string;
  novos: number;
  contratos: number;
  clientes: number;
  projecao?: boolean;
}

/** Segunda-feira 00:00 (horário local) da semana que contém `d`. */
export function inicioSemana(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0 = domingo
  const diff = dow === 0 ? 6 : dow - 1;
  out.setDate(out.getDate() - diff);
  return out;
}

function chaveDia(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function labelDia(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Novos leads por semana de criação e conversões por semana em que o lead
 * entrou em Contrato Emitido / Cliente Ativo (via lead_historico). Semanas
 * sem evento aparecem zeradas; a última é a semana corrente.
 */
export function serieSemanalLeads(
  leads: Pick<LeadAnalitico, "id" | "criado_em">[],
  historico: HistoricoLeadLike[],
  semanas = 12,
  agora: number = Date.now(),
): PontoSemanal[] {
  const fim = inicioSemana(new Date(agora));
  const pontos: PontoSemanal[] = [];
  const indice = new Map<string, number>();
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(fim);
    d.setDate(fim.getDate() - i * 7);
    const chave = chaveDia(d);
    indice.set(chave, pontos.length);
    pontos.push({ semana: chave, label: labelDia(d), novos: 0, contratos: 0, clientes: 0 });
  }
  const bucket = (iso: string | null | undefined) => {
    if (!iso) return -1;
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return -1;
    return indice.get(chaveDia(inicioSemana(t))) ?? -1;
  };
  for (const l of leads) {
    const i = bucket(l.criado_em);
    if (i >= 0) pontos[i].novos += 1;
  }
  // Conta a primeira entrada de cada lead em cada etapa-alvo (mover de volta e de novo não duplica).
  const vistos = new Set<string>();
  const ordenado = [...historico].sort((a, b) => String(a.criado_em ?? "").localeCompare(String(b.criado_em ?? "")));
  for (const h of ordenado) {
    const etapa = etapaUnificada(h.para_etapa);
    if (etapa !== "contrato_emitido" && etapa !== "cliente_ativo") continue;
    const k = `${h.lead_id}:${etapa}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const i = bucket(h.criado_em);
    if (i < 0) continue;
    if (etapa === "contrato_emitido") pontos[i].contratos += 1;
    else pontos[i].clientes += 1;
  }
  return pontos;
}

// ───────────────────────────────────────── Projeção linear

/**
 * Regressão linear simples sobre o índice; devolve `passos` valores futuros
 * (nunca negativos, arredondados). Com menos de 2 pontos repete o último.
 */
export function projetarLinear(valores: number[], passos: number, decimais = 0): number[] {
  const n = valores.length;
  if (passos <= 0) return [];
  if (n === 0) return Array.from({ length: passos }, () => 0);
  const ultimo = valores[n - 1];
  if (n < 2) return Array.from({ length: passos }, () => Math.max(0, ultimo));
  const mediaX = (n - 1) / 2;
  const mediaY = valores.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mediaX) * (valores[i] - mediaY);
    den += (i - mediaX) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  const a = mediaY - b * mediaX;
  const f = 10 ** decimais;
  return Array.from({ length: passos }, (_, k) => {
    const y = a + b * (n + k);
    return Math.max(0, Math.round(y * f) / f);
  });
}

/** Acrescenta `passos` semanas projetadas (novos e contratos) ao fim da série. */
export function projetarSerieSemanal(serie: PontoSemanal[], passos = 4): PontoSemanal[] {
  if (serie.length === 0) return [];
  // A semana corrente está incompleta: projeta a partir das fechadas.
  const fechadas = serie.length > 1 ? serie.slice(0, -1) : serie;
  const novos = projetarLinear(fechadas.map((p) => p.novos), passos);
  const contratos = projetarLinear(fechadas.map((p) => p.contratos), passos);
  const ultima = new Date(serie[serie.length - 1].semana + "T00:00:00");
  const out: PontoSemanal[] = [];
  for (let k = 0; k < passos; k++) {
    const d = new Date(ultima);
    d.setDate(ultima.getDate() + (k + 1) * 7);
    out.push({ semana: chaveDia(d), label: labelDia(d), novos: novos[k], contratos: contratos[k], clientes: 0, projecao: true });
  }
  return out;
}

/** Média das últimas `n` semanas fechadas (ignora a corrente quando há mais de uma). */
export function ritmoSemanal(serie: PontoSemanal[], campo: "novos" | "contratos" | "clientes", n = 4): number {
  if (serie.length === 0) return 0;
  const fechadas = serie.length > 1 ? serie.slice(0, -1) : serie;
  const janela = fechadas.slice(-n);
  if (janela.length === 0) return 0;
  return Math.round((janela.reduce((s, p) => s + p[campo], 0) / janela.length) * 10) / 10;
}

// ───────────────────────────────────────── Pipeline ponderado

/** Probabilidade de fechamento por etapa (snapshot do funil). */
export const PROBABILIDADE_ETAPA: Record<string, number> = {
  novo: 0.1,
  qualificado: 0.25,
  em_negociacao: 0.45,
  levantamento_teses: 0.45,
  em_apresentacao: 0.65,
  contrato_emitido: 0.85,
};

export interface EtapaPonderada {
  etapa: string;
  leads: number;
  potencial: number;
  probabilidade: number;
  ponderado: number;
}

export interface PipelinePonderado {
  total: number;
  potencial: number;
  porEtapa: EtapaPonderada[];
}

export function pipelinePonderado(leads: LeadAnalitico[], probabilidades: Record<string, number> = PROBABILIDADE_ETAPA): PipelinePonderado {
  const acc = new Map<string, EtapaPonderada>();
  for (const l of leads) {
    const etapa = etapaUnificada(l.status_funil);
    if (ETAPAS_PERDIDAS.has(etapa) || etapa === "cliente_ativo") continue;
    const prob = probabilidades[etapa] ?? 0;
    const cur = acc.get(etapa) ?? { etapa, leads: 0, potencial: 0, probabilidade: prob, ponderado: 0 };
    const pot = Number(l.potencial ?? 0);
    cur.leads += 1;
    cur.potencial += pot;
    cur.ponderado += pot * prob;
    acc.set(etapa, cur);
  }
  const porEtapa = [...acc.values()].sort((a, b) => b.probabilidade - a.probabilidade);
  return {
    total: porEtapa.reduce((s, e) => s + e.ponderado, 0),
    potencial: porEtapa.reduce((s, e) => s + e.potencial, 0),
    porEtapa,
  };
}

// ───────────────────────────────────────── Conversão entre etapas (snapshot)

export interface EtapaFunilConversao<T extends { count: number }> {
  row: T;
  /** Leads nesta etapa ou além dela. */
  acumulado: number;
  /** % de quem chegou aqui que já está na etapa seguinte ou além (null na última). */
  taxaProxima: number | null;
}

/**
 * Num funil-fotografia a conversão etapa→etapa é "quem está daqui pra frente"
 * dividido por "quem está da etapa anterior pra frente". Ordem = ordem do array.
 */
export function taxasConversaoFunil<T extends { count: number }>(funil: T[]): EtapaFunilConversao<T>[] {
  const acumulados: number[] = [];
  let soma = 0;
  for (let i = funil.length - 1; i >= 0; i--) {
    soma += funil[i].count;
    acumulados[i] = soma;
  }
  return funil.map((row, i) => {
    const prox = acumulados[i + 1];
    const taxa = prox === undefined ? null : acumulados[i] > 0 ? Math.round((prox / acumulados[i]) * 100) : 0;
    return { row, acumulado: acumulados[i], taxaProxima: taxa };
  });
}

// ───────────────────────────────────────── Origem

export const ORIGEM_LEAD_LABEL: Record<string, string> = {
  manual: "Manual",
  referencia: "Referência",
  prospeccao_ativa: "Prospecção ativa",
  meta_ads: "Meta Ads",
  formulario_lp: "Formulário LP",
  formulario: "Formulário LP",
  calculadora: "Calculadora RT",
  nao_informado: "Não informada",
};

export interface OrigemRow {
  origem: string;
  label: string;
  leads: number;
  potencial: number;
  convertidos: number;
}

export function leadsPorOrigem(leads: LeadAnalitico[]): OrigemRow[] {
  const acc = new Map<string, OrigemRow>();
  for (const l of leads) {
    const origem = (l.origem ?? "").trim() || "nao_informado";
    const cur = acc.get(origem) ?? { origem, label: ORIGEM_LEAD_LABEL[origem] ?? origem, leads: 0, potencial: 0, convertidos: 0 };
    cur.leads += 1;
    cur.potencial += Number(l.potencial ?? 0);
    const etapa = etapaUnificada(l.status_funil);
    if (etapa === "cliente_ativo" || etapa === "contrato_emitido") cur.convertidos += 1;
    acc.set(origem, cur);
  }
  return [...acc.values()].sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label, "pt-BR"));
}

// ───────────────────────────────────────── Atendimento (inbox WhatsApp)

export interface ConversaLike {
  telefone: string;
  bot_ativo: boolean;
  ultima_em: string | null;
  ultima_direcao: "entrada" | "saida" | null;
}

export interface ResumoAtendimento {
  total: number;
  comRobo: number;
  humanas: number;
  /** Última mensagem foi do lead e ninguém respondeu há mais de `horasLimite`. */
  aguardandoResposta: number;
  /** Conversas com mensagem nas últimas 24h. */
  ativas24h: number;
  /** Telefones aguardando resposta, do mais antigo para o mais recente. */
  filaResposta: { telefone: string; horas: number; bot_ativo: boolean }[];
}

export function resumoAtendimento(conversas: ConversaLike[], agora: number = Date.now(), horasLimite = 4): ResumoAtendimento {
  const fila: ResumoAtendimento["filaResposta"] = [];
  let comRobo = 0;
  let ativas24h = 0;
  for (const c of conversas) {
    if (c.bot_ativo) comRobo += 1;
    const t = c.ultima_em ? new Date(c.ultima_em).getTime() : NaN;
    const horas = Number.isFinite(t) ? (agora - t) / 3_600_000 : NaN;
    if (Number.isFinite(horas) && horas <= 24) ativas24h += 1;
    if (c.ultima_direcao === "entrada" && Number.isFinite(horas) && horas > horasLimite) {
      fila.push({ telefone: c.telefone, horas: Math.floor(horas), bot_ativo: c.bot_ativo });
    }
  }
  fila.sort((a, b) => b.horas - a.horas);
  return {
    total: conversas.length,
    comRobo,
    humanas: conversas.length - comRobo,
    aguardandoResposta: fila.length,
    ativas24h,
    filaResposta: fila,
  };
}

// ───────────────────────────────────────── Tempo até etapa

/** Dias médios entre a criação do lead e a primeira entrada em `etapa`; null sem amostra. */
export function tempoMedioAteEtapa(
  leads: Pick<LeadAnalitico, "id" | "criado_em">[],
  historico: HistoricoLeadLike[],
  etapa = "contrato_emitido",
): number | null {
  const criado = new Map(leads.map((l) => [l.id, l.criado_em ? new Date(l.criado_em).getTime() : NaN]));
  const primeira = new Map<string, number>();
  for (const h of historico) {
    if (etapaUnificada(h.para_etapa) !== etapa || !h.criado_em) continue;
    const t = new Date(h.criado_em).getTime();
    if (!Number.isFinite(t)) continue;
    const prev = primeira.get(h.lead_id);
    if (prev === undefined || t < prev) primeira.set(h.lead_id, t);
  }
  const amostras: number[] = [];
  for (const [leadId, t] of primeira) {
    const c = criado.get(leadId);
    if (c === undefined || !Number.isFinite(c) || t < c) continue;
    amostras.push((t - c) / MS_DIA);
  }
  if (amostras.length === 0) return null;
  return Math.round((amostras.reduce((s, v) => s + v, 0) / amostras.length) * 10) / 10;
}

/** Leads parados na etapa `etapa` há mais de `dias` (fallback: criação). */
export function leadsParados(leads: LeadAnalitico[], etapa: string, dias: number, agora: number = Date.now()) {
  return leads
    .filter((l) => etapaUnificada(l.status_funil) === etapa)
    .map((l) => {
      const ref = l.status_funil_atualizado_em || l.criado_em;
      const t = ref ? new Date(ref).getTime() : NaN;
      const d = Number.isFinite(t) ? Math.floor((agora - t) / MS_DIA) : 0;
      return { lead: l, dias: d };
    })
    .filter((x) => x.dias > dias)
    .sort((a, b) => b.dias - a.dias);
}
