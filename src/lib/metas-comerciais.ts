/**
 * Metas mensais da equipe comercial (Lote 3A). Regras puras: o service busca
 * realizado (RPC `metas_comerciais_realizado`) e metas (`metas_comerciais`);
 * aqui só se consolida meta × realizado por SDR e para a equipe.
 *
 * Convenção do "realizado" (acordada com a Janaina em 08/10/2026 e aplicada
 * na RPC a partir de `lead_historico`):
 *   · reunião AGENDADA  = lead movido PARA a etapa `apresentacao`;
 *   · reunião REALIZADA = lead que SAIU de `apresentacao` para uma etapa
 *     posterior (triagem, contrato_emitido, contrato_assinado, ganho) ou para
 *     `follow_up` (a reunião aconteceu, o lead só não fechou na hora);
 *   · `apresentacao` → `perdido` = reunião não realizada (não conta);
 *   · linhas de anotação (de_etapa = para_etapa, ex.: tarefas do card) não
 *     contam como movimento;
 *   · leads novos = criados no mês; contratos = entrou em `contrato_emitido`.
 * Dono do número é `leads.sdr_id`; leads sem SDR aparecem numa linha própria.
 */
import { monthKeyBrt, shiftMonthKey } from "@/lib/month-key";
import { MESES_CURTOS } from "@/lib/competencia-select";

export const METRICAS_META = ["reunioes_agendadas", "reunioes_realizadas", "leads_novos", "contratos"] as const;
export type MetricaMeta = (typeof METRICAS_META)[number];

export const METRICA_META_LABEL: Record<MetricaMeta, string> = {
  reunioes_agendadas: "Reuniões agendadas",
  reunioes_realizadas: "Reuniões realizadas",
  leads_novos: "Leads novos",
  contratos: "Contratos",
};

export const METRICA_META_LABEL_CURTO: Record<MetricaMeta, string> = {
  reunioes_agendadas: "Agendadas",
  reunioes_realizadas: "Realizadas",
  leads_novos: "Leads novos",
  contratos: "Contratos",
};

export type EscopoMeta = "sdr" | "equipe";

/** Linha de `metas_comerciais` (mes = `YYYY-MM-01`). */
export interface MetaComercialRow {
  escopo: EscopoMeta;
  user_id: string | null;
  mes: string;
  reunioes_agendadas: number | null;
  reunioes_realizadas: number | null;
  leads_novos: number | null;
  contratos: number | null;
}

/** Linha da RPC `metas_comerciais_realizado` (user_id null = leads sem SDR). */
export interface RealizadoSdrRow {
  user_id: string | null;
  full_name: string | null;
  reunioes_agendadas: number;
  reunioes_realizadas: number;
  leads_novos: number;
  contratos: number;
}

export interface ValorMeta {
  meta: number | null;
  realizado: number;
  /** % de atingimento (realizado / meta); null sem meta. */
  pct: number | null;
}

export interface LinhaMetaSdr {
  user_id: string | null;
  nome: string;
  /** Linha "Sem SDR" (leads sem dono) — não recebe meta. */
  semSdr: boolean;
  metricas: Record<MetricaMeta, ValorMeta>;
}

export interface ConsolidadoMetas {
  linhas: LinhaMetaSdr[];
  /** Totais da equipe: realizado = soma de todas as linhas (inclusive sem SDR). */
  equipe: LinhaMetaSdr;
  /** true quando a meta da equipe veio da linha escopo='equipe' (e não da soma das SDRs). */
  metaEquipeExplicita: boolean;
}

export const NOME_SEM_SDR = "Sem SDR";

// ───────────────────────────────────────── Mês

/** Mês corrente `YYYY-MM` no calendário de negócio (America/Sao_Paulo). */
export function mesChave(agora: Date | number = Date.now()): string {
  return monthKeyBrt(agora);
}

/** `YYYY-MM` → `YYYY-MM-01` (valor de `metas_comerciais.mes` e `p_mes` da RPC). */
export function mesParaData(chave: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(chave);
  if (!m) throw new Error(`Competência inválida: ${chave}`);
  return `${m[1]}-${m[2]}-01`;
}

/** `YYYY-MM-01` (ou `YYYY-MM`) → `YYYY-MM`. */
export function dataParaMes(valor: string | null | undefined): string {
  return String(valor ?? "").slice(0, 7);
}

/** "2026-10" → "Out/2026". */
export function mesLabel(chave: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(chave);
  if (!m) return chave;
  const nome = MESES_CURTOS.find((x) => x.v === m[2])?.label ?? m[2];
  return `${nome}/${m[1]}`;
}

export function mesAnterior(chave: string): string {
  return shiftMonthKey(chave, -1);
}

// ───────────────────────────────────────── Atingimento

/** % de atingimento arredondado; null sem meta (ou meta zero: não dá pra dividir). */
export function atingimentoPct(realizado: number, meta: number | null | undefined): number | null {
  if (meta == null || !Number.isFinite(meta) || meta <= 0) return null;
  return Math.round((realizado / meta) * 100);
}

export type TomAtingimento = "green" | "amber" | "red" | "muted";

/** ≥100% verde; ≥70% âmbar (ainda dá tempo); abaixo vermelho; sem meta neutro. */
export function tomAtingimento(pct: number | null): TomAtingimento {
  if (pct == null) return "muted";
  if (pct >= 100) return "green";
  if (pct >= 70) return "amber";
  return "red";
}

export function labelAtingimento(v: Pick<ValorMeta, "meta" | "realizado" | "pct">): string {
  if (v.meta == null) return `${v.realizado} · sem meta`;
  return `${v.realizado}/${v.meta} · ${v.pct ?? 0}%`;
}

// ───────────────────────────────────────── Consolidação

export interface MembroSdrLike {
  user_id: string;
  full_name: string | null;
  cargo_comercial?: string | null;
}

function valorZerado(): ValorMeta {
  return { meta: null, realizado: 0, pct: null };
}

function metricasZeradas(): Record<MetricaMeta, ValorMeta> {
  return {
    reunioes_agendadas: valorZerado(),
    reunioes_realizadas: valorZerado(),
    leads_novos: valorZerado(),
    contratos: valorZerado(),
  };
}

function temRealizado(r: RealizadoSdrRow): boolean {
  return METRICAS_META.some((k) => Number(r[k] ?? 0) > 0);
}

/**
 * Junta realizado (RPC) e metas (tabela) por SDR. Entram na lista: todas as
 * SDRs ativas (`equipe`, para a gestora conseguir lançar meta de quem ainda
 * não moveu nada), quem tem realizado ou meta no mês e, por último, a linha
 * "Sem SDR" quando houver leads sem dono com movimento.
 *
 * Meta da equipe: a linha escopo='equipe' quando existir; senão a soma das
 * metas das SDRs (null quando nenhuma tem meta). Realizado da equipe é
 * sempre a soma de todas as linhas, inclusive sem SDR.
 */
export function consolidarMetas(
  realizado: RealizadoSdrRow[],
  metas: MetaComercialRow[],
  equipe: MembroSdrLike[] = [],
): ConsolidadoMetas {
  const porSdr = new Map<string, LinhaMetaSdr>();
  const garantir = (userId: string, nome: string | null) => {
    let linha = porSdr.get(userId);
    if (!linha) {
      linha = { user_id: userId, nome: (nome ?? "").trim() || "Sem nome", semSdr: false, metricas: metricasZeradas() };
      porSdr.set(userId, linha);
    } else if (linha.nome === "Sem nome" && nome?.trim()) {
      linha.nome = nome.trim();
    }
    return linha;
  };

  for (const m of equipe) {
    if (m.cargo_comercial && m.cargo_comercial !== "sdr") continue;
    garantir(m.user_id, m.full_name);
  }

  let semSdr: LinhaMetaSdr | null = null;
  for (const r of realizado) {
    if (r.user_id == null) {
      if (!temRealizado(r)) continue;
      semSdr = { user_id: null, nome: NOME_SEM_SDR, semSdr: true, metricas: metricasZeradas() };
      for (const k of METRICAS_META) semSdr.metricas[k].realizado = Number(r[k] ?? 0);
      continue;
    }
    const linha = garantir(r.user_id, r.full_name);
    for (const k of METRICAS_META) linha.metricas[k].realizado += Number(r[k] ?? 0);
  }

  let metaEquipe: MetaComercialRow | null = null;
  for (const m of metas) {
    if (m.escopo === "equipe" || m.user_id == null) {
      metaEquipe = m;
      continue;
    }
    const linha = garantir(m.user_id, null);
    for (const k of METRICAS_META) linha.metricas[k].meta = m[k] ?? null;
  }

  const linhas = [...porSdr.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  for (const l of linhas) {
    for (const k of METRICAS_META) l.metricas[k].pct = atingimentoPct(l.metricas[k].realizado, l.metricas[k].meta);
  }
  if (semSdr) linhas.push(semSdr);

  const equipeLinha: LinhaMetaSdr = { user_id: null, nome: "Equipe", semSdr: false, metricas: metricasZeradas() };
  for (const k of METRICAS_META) {
    const v = equipeLinha.metricas[k];
    v.realizado = linhas.reduce((s, l) => s + l.metricas[k].realizado, 0);
    if (metaEquipe && metaEquipe[k] != null) {
      v.meta = metaEquipe[k];
    } else {
      const metasSdr = linhas.filter((l) => !l.semSdr && l.metricas[k].meta != null).map((l) => l.metricas[k].meta as number);
      v.meta = metasSdr.length > 0 ? metasSdr.reduce((s, x) => s + x, 0) : null;
    }
    v.pct = atingimentoPct(v.realizado, v.meta);
  }

  return { linhas, equipe: equipeLinha, metaEquipeExplicita: metaEquipe != null };
}

/** Campo de meta digitado → inteiro ≥ 0, ou null quando apagado/inválido. */
export function normalizarMetaDigitada(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Math.floor(Number(t.replace(",", ".")));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
