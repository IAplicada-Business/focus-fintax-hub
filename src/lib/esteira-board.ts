import { slaInfo, type ClienteSlaLike, type SlaInfo } from "@/lib/esteira-acompanhamento";
import { isEstagioEsteira } from "@/lib/esteira-constants";

/**
 * Lógica pura do quadro (kanban) da Esteira Administrativa — compartilhada
 * entre a tela /esteira e o painel "Onde os clientes estão" do dashboard.
 */

export const ESTEIRA_COLAPSO_KEY = "esteira.colapsadas";
export const DASH_ESTEIRA_VIEW_KEY = "dash.esteira.view";

export type DashEsteiraView = "etapas" | "kanban";

/** Sem preferência salva, o dashboard abre no resumo compacto. */
export function parseDashEsteiraView(value: string | null | undefined): DashEsteiraView {
  return value === "kanban" ? "kanban" : "etapas";
}

export interface EsteiraBoardStage {
  value: string;
  label: string;
}

export interface EsteiraCardLike extends ClienteSlaLike {
  id: string;
  empresa?: string | null;
  responsavel_nome?: string | null;
  /** Já calculado pela view do banco quando presente. */
  atrasado?: boolean | null;
}

/** Agrupa por etapa na ordem das colunas; só usa fallback quando não há coluna explícita. */
export function agruparEsteiraPorEtapa<T extends EsteiraCardLike>(
  clientes: T[],
  stages: readonly EsteiraBoardStage[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const s of stages) map[s.value] = [];
  const fallback = map["__sem_etapa__"] ? "__sem_etapa__" : map["triagem"] ? "triagem" : stages[0]?.value;
  for (const c of clientes) {
    const etapa = c.estagio_esteira || (map["__sem_etapa__"] ? "__sem_etapa__" : fallback);
    if (etapa && map[etapa]) map[etapa].push(c);
    else if (fallback && map[fallback]) map[fallback].push(c);
  }
  return map;
}

export interface ResumoEtapaEsteira {
  total: number;
  atrasados: number;
  vencendo: number;
  semResponsavel: number;
}

export function resumoEtapaEsteira(clientes: EsteiraCardLike[], slaEtapa: number | null | undefined): ResumoEtapaEsteira {
  let atrasados = 0;
  let vencendo = 0;
  let semResponsavel = 0;
  for (const c of clientes) {
    const info = slaDoClienteEsteira(c, slaEtapa);
    if (info.status === "estourado") atrasados += 1;
    else if (info.status === "atencao") vencendo += 1;
    if (!c.responsavel_nome || c.responsavel_nome.trim() === "") semResponsavel += 1;
  }
  return { total: clientes.length, atrasados, vencendo, semResponsavel };
}

/**
 * SLA do card: respeita o `atrasado` já calculado pela view (fonte de verdade
 * do banco) e usa o SLA da etapa vindo da config quando o cliente não traz o seu.
 */
export function slaDoClienteEsteira(c: EsteiraCardLike, slaEtapa: number | null | undefined): SlaInfo {
  // `slaEtapa` definido (mesmo null) é a config e manda; undefined = caller
  // não sabe e o helper cai nos defaults por etapa.
  const overrides = slaEtapa !== undefined && isEstagioEsteira(c.estagio_esteira) ? { [c.estagio_esteira]: slaEtapa } : undefined;
  const base = slaInfo({ ...c, sla_dias: c.sla_dias ?? undefined }, overrides);
  if (typeof c.atrasado === "boolean" && c.atrasado && base.status !== "estourado") {
    return { ...base, status: "estourado" };
  }
  return base;
}

/** Atrasados primeiro, depois quem está há mais tempo na etapa. */
export function ordenarCardsEsteira<T extends EsteiraCardLike>(clientes: T[], slaEtapa: number | null | undefined): T[] {
  const peso = (c: T) => {
    const s = slaDoClienteEsteira(c, slaEtapa).status;
    return s === "estourado" ? 0 : s === "atencao" ? 1 : 2;
  };
  return [...clientes].sort((a, b) => {
    const d = peso(a) - peso(b);
    if (d !== 0) return d;
    return (b.dias_na_etapa ?? 0) - (a.dias_na_etapa ?? 0);
  });
}
