/**
 * Regras puras do quadro (kanban) do pipeline: agrupamento por etapa, resumo
 * de coluna com SLA, busca, persistência das colunas recolhidas e ligação
 * lead ↔ conversa do atendimento.
 */
import { PIPELINE_STAGES, STAGE_MERGE_MAP } from "@/lib/pipeline-constants";
import { diasNaEtapaLead, type LeadFunilLike } from "@/lib/pipeline-sla";
import { slaInfo, type SlaInfo } from "@/lib/esteira-acompanhamento";
import { phoneDigits } from "@/lib/phone-match";

export const COLAPSO_STORAGE_KEY = "pipeline.colapsadas";

export interface LeadBoardLike extends LeadFunilLike {
  nome?: string | null;
  cnpj?: string | null;
  whatsapp?: string | null;
  segmento?: string | null;
  origem?: string | null;
}

export function etapaDoLead(status: string | null | undefined): string {
  const raw = (status ?? "").trim() || "novo";
  return STAGE_MERGE_MAP[raw] ?? raw;
}

export function agruparPorEtapa<T extends LeadBoardLike>(
  leads: T[],
  stages: readonly { value: string }[] = PIPELINE_STAGES,
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const s of stages) map[s.value] = [];
  const fallback = stages[0]?.value ?? "novo";
  for (const l of leads) {
    const etapa = etapaDoLead(l.status_funil);
    (map[etapa] ?? map[fallback]).push(l);
  }
  return map;
}

export interface ResumoColuna {
  total: number;
  potencial: number;
  atrasados: number;
  vencendo: number;
}

/** SLA de um lead na etapa (mesma régua do Dashboard: `pipeline_sla_config`). */
export function slaDoLead(lead: LeadFunilLike, slaDias: number | null | undefined, agora: number = Date.now()): SlaInfo {
  const dias = diasNaEtapaLead(lead, agora);
  return slaInfo({ estagio_esteira: etapaDoLead(lead.status_funil), dias_na_etapa: dias, sla_dias: slaDias ?? null });
}

export function resumoColuna(leads: LeadFunilLike[], slaDias: number | null | undefined, agora: number = Date.now()): ResumoColuna {
  let potencial = 0;
  let atrasados = 0;
  let vencendo = 0;
  for (const l of leads) {
    potencial += Number(l.potencial ?? 0);
    const s = slaDoLead(l, slaDias, agora);
    if (s.status === "estourado") atrasados += 1;
    else if (s.status === "atencao") vencendo += 1;
  }
  return { total: leads.length, potencial, atrasados, vencendo };
}

/** Busca por empresa, contato, CNPJ ou WhatsApp (dígitos). */
export function filtrarLeadsBusca<T extends LeadBoardLike>(leads: T[], termo: string): T[] {
  const q = termo.trim().toLocaleLowerCase("pt-BR");
  if (!q) return leads;
  const digitos = q.replace(/\D/g, "");
  return leads.filter((l) => {
    const texto = `${l.empresa ?? ""} ${l.nome ?? ""}`.toLocaleLowerCase("pt-BR");
    if (texto.includes(q)) return true;
    if (digitos.length >= 3) {
      if (phoneDigits(l.cnpj).includes(digitos)) return true;
      if (phoneDigits(l.whatsapp).includes(digitos)) return true;
    }
    return false;
  });
}

export function etapasVazias(grouped: Record<string, unknown[]>): string[] {
  return Object.entries(grouped)
    .filter(([, arr]) => arr.length === 0)
    .map(([k]) => k);
}

// ───────────────────────────────────────── Persistência das colunas recolhidas

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function lerColapsadas(storage: StorageLike | null | undefined, chave = COLAPSO_STORAGE_KEY): Set<string> {
  try {
    const raw = storage?.getItem(chave);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function salvarColapsadas(set: Set<string>, storage: StorageLike | null | undefined, chave = COLAPSO_STORAGE_KEY): void {
  try {
    storage?.setItem(chave, JSON.stringify([...set]));
  } catch {
    /* storage indisponível */
  }
}

// ───────────────────────────────────────── Ligação com o atendimento

export interface ConversaIndexavel {
  telefone: string;
  bot_ativo: boolean;
  ultima_em: string | null;
  ultima_direcao: "entrada" | "saida" | null;
  ultima_texto?: string | null;
}

/** Índice por sufixo de 11 dígitos (DDD + número), mesma regra de `phonesMatch`. */
export function indexarConversas<T extends ConversaIndexavel>(conversas: T[]): Map<string, T> {
  const idx = new Map<string, T>();
  for (const c of conversas) {
    const d = phoneDigits(c.telefone);
    if (!d) continue;
    const chave = d.length > 11 ? d.slice(-11) : d;
    const prev = idx.get(chave);
    if (!prev || String(c.ultima_em ?? "") > String(prev.ultima_em ?? "")) idx.set(chave, c);
  }
  return idx;
}

export function conversaDoLead<T extends ConversaIndexavel>(whatsapp: string | null | undefined, indice: Map<string, T>): T | null {
  const d = phoneDigits(whatsapp);
  if (!d) return null;
  const chave = d.length > 11 ? d.slice(-11) : d;
  return indice.get(chave) ?? null;
}

export type EstadoConversa = "sem_conversa" | "robo" | "aguardando_lead" | "aguardando_nos";

/** Estado da conversa do lead para o indicador do card. */
export function estadoConversa(conversa: ConversaIndexavel | null): EstadoConversa {
  if (!conversa) return "sem_conversa";
  if (conversa.bot_ativo) return "robo";
  if (conversa.ultima_direcao === "entrada") return "aguardando_nos";
  return "aguardando_lead";
}
