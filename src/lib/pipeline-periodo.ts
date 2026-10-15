/**
 * Filtro de período do Pipeline (Lote 3A): recorta os leads pela data de
 * criação. Separado de `dashboard-period.ts` porque aquele gira em torno de
 * competências de compensação; aqui o que importa é "quando o lead entrou".
 * Os limites são em horário local do navegador, como os demais números da
 * tela (ex.: "Novos hoje").
 */
import { MESES_CURTOS } from "@/lib/competencia-select";

export type PeriodoPipeline =
  | { tipo: "tudo" }
  | { tipo: "este_mes" }
  | { tipo: "mes_passado" }
  | { tipo: "30d" }
  | { tipo: "90d" }
  | { tipo: "mes"; mes: string };

export type TipoPeriodoPipeline = PeriodoPipeline["tipo"];

export const PERIODO_PIPELINE_OPCOES: { value: TipoPeriodoPipeline; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "este_mes", label: "Este mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "mes", label: "Escolher mês" },
];

export const PERIODO_PIPELINE_STORAGE_KEY = "focus.pipeline.periodo";
export const PERIODO_PIPELINE_PADRAO: PeriodoPipeline = { tipo: "tudo" };

const MS_DIA = 86_400_000;
const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function chaveMesLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Primeiro instante do mês `YYYY-MM` e do mês seguinte (horário local). */
function limitesDoMes(chave: string): { inicio: number; fim: number } | null {
  const m = MES_RE.exec(chave);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]) - 1;
  return { inicio: new Date(ano, mes, 1).getTime(), fim: new Date(ano, mes + 1, 1).getTime() };
}

export interface IntervaloPeriodo {
  /** Inclusivo (ms); null = sem limite inferior. */
  inicio: number | null;
  /** Exclusivo (ms); null = sem limite superior. */
  fim: number | null;
}

export function intervaloPeriodo(periodo: PeriodoPipeline, agora: number = Date.now()): IntervaloPeriodo {
  const hoje = new Date(agora);
  switch (periodo.tipo) {
    case "tudo":
      return { inicio: null, fim: null };
    case "este_mes":
      return limitesDoMes(chaveMesLocal(hoje)) ?? { inicio: null, fim: null };
    case "mes_passado": {
      const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      return limitesDoMes(chaveMesLocal(anterior)) ?? { inicio: null, fim: null };
    }
    case "30d":
      return { inicio: agora - 30 * MS_DIA, fim: null };
    case "90d":
      return { inicio: agora - 90 * MS_DIA, fim: null };
    case "mes":
      // Mês inválido/vazio (ano escolhido antes do mês) não esconde nada.
      return limitesDoMes(periodo.mes) ?? { inicio: null, fim: null };
  }
}

export function dentroDoPeriodo(iso: string | null | undefined, intervalo: IntervaloPeriodo): boolean {
  if (intervalo.inicio == null && intervalo.fim == null) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (intervalo.inicio != null && t < intervalo.inicio) return false;
  if (intervalo.fim != null && t >= intervalo.fim) return false;
  return true;
}

export function filtrarPorPeriodo<T extends { criado_em?: string | null }>(
  leads: T[],
  periodo: PeriodoPipeline,
  agora: number = Date.now(),
): T[] {
  if (periodo.tipo === "tudo") return leads;
  const intervalo = intervaloPeriodo(periodo, agora);
  return leads.filter((l) => dentroDoPeriodo(l.criado_em, intervalo));
}

export function periodoLabel(periodo: PeriodoPipeline): string {
  if (periodo.tipo === "mes") {
    const m = MES_RE.exec(periodo.mes);
    if (!m) return "Escolher mês";
    return `${MESES_CURTOS.find((x) => x.v === m[2])?.label ?? m[2]}/${m[1]}`;
  }
  return PERIODO_PIPELINE_OPCOES.find((o) => o.value === periodo.tipo)?.label ?? "Tudo";
}

export function isTipoPeriodoPipeline(v: unknown): v is TipoPeriodoPipeline {
  return PERIODO_PIPELINE_OPCOES.some((o) => o.value === v);
}

/** Troca o tipo mantendo o mês escolhido quando volta pra "Escolher mês". */
export function trocarTipoPeriodo(atual: PeriodoPipeline, tipo: TipoPeriodoPipeline, agora: number = Date.now()): PeriodoPipeline {
  if (tipo === "mes") {
    const mes = atual.tipo === "mes" && MES_RE.test(atual.mes) ? atual.mes : chaveMesLocal(new Date(agora));
    return { tipo: "mes", mes };
  }
  return { tipo };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Lê o período salvo; qualquer coisa inválida cai no padrão ("Tudo"). */
export function lerPeriodoPipeline(storage: StorageLike | null | undefined): PeriodoPipeline {
  try {
    const raw = storage?.getItem(PERIODO_PIPELINE_STORAGE_KEY);
    if (!raw) return PERIODO_PIPELINE_PADRAO;
    const parsed = JSON.parse(raw) as { tipo?: unknown; mes?: unknown };
    if (!isTipoPeriodoPipeline(parsed?.tipo)) return PERIODO_PIPELINE_PADRAO;
    if (parsed.tipo === "mes") {
      return typeof parsed.mes === "string" && MES_RE.test(parsed.mes) ? { tipo: "mes", mes: parsed.mes } : PERIODO_PIPELINE_PADRAO;
    }
    return { tipo: parsed.tipo };
  } catch {
    return PERIODO_PIPELINE_PADRAO;
  }
}

export function salvarPeriodoPipeline(storage: StorageLike | null | undefined, periodo: PeriodoPipeline): void {
  try {
    storage?.setItem(PERIODO_PIPELINE_STORAGE_KEY, JSON.stringify(periodo));
  } catch {
    /* storage indisponível (modo privado, cota) — o filtro continua só na sessão */
  }
}
