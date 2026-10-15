/**
 * Regras puras da equipe comercial (SDR / closer) usadas nos selects, badges
 * e filtros do Pipeline e da Fila de Leads.
 */
export const CARGOS_COMERCIAIS = [
  { value: "sdr", label: "SDR" },
  { value: "closer", label: "Closer" },
] as const;

export type CargoComercial = (typeof CARGOS_COMERCIAIS)[number]["value"];

export const CARGO_COMERCIAL_LABEL: Record<CargoComercial, string> = { sdr: "SDR", closer: "Closer" };

export const CARGO_COMERCIAL_COLORS: Record<CargoComercial, string> = {
  sdr: "bg-amber-100 text-amber-800 border-amber-200",
  closer: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

export interface MembroEquipeComercial {
  user_id: string;
  full_name: string | null;
  cargo_comercial: string | null;
}

export function isCargoComercial(v: unknown): v is CargoComercial {
  return v === "sdr" || v === "closer";
}

export function sdrsDaEquipe<T extends MembroEquipeComercial>(equipe: T[]): T[] {
  return equipe.filter((m) => m.cargo_comercial === "sdr");
}

export function closersDaEquipe<T extends MembroEquipeComercial>(equipe: T[]): T[] {
  return equipe.filter((m) => m.cargo_comercial === "closer");
}

/** "Ágatha Souza Lima" → "AL"; vazio → "?". */
export function iniciais(nome: string | null | undefined): string {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Primeiro nome, para caber no card. */
export function primeiroNome(nome: string | null | undefined): string {
  return String(nome ?? "").trim().split(/\s+/)[0] ?? "";
}

export function nomeDoMembro(equipe: MembroEquipeComercial[], userId: string | null | undefined): string | null {
  if (!userId) return null;
  return equipe.find((m) => m.user_id === userId)?.full_name ?? null;
}

/**
 * Filtro "Responsável": "todos", "sem" (nem SDR nem closer) ou o user_id de
 * alguém da equipe — casa tanto em sdr_id quanto em closer_id.
 */
export type FiltroResponsavel = "todos" | "sem" | string;

export function filtrarPorResponsavel<T extends { sdr_id?: string | null; closer_id?: string | null }>(
  leads: T[],
  filtro: FiltroResponsavel,
): T[] {
  if (filtro === "todos") return leads;
  if (filtro === "sem") return leads.filter((l) => !l.sdr_id && !l.closer_id);
  return leads.filter((l) => l.sdr_id === filtro || l.closer_id === filtro);
}
