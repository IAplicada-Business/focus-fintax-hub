/**
 * Regras da visão de acompanhamento da esteira (Fase 2 — PMO).
 * Puras: recebem linhas de `v_esteira_clientes` + config de SLA e devolvem
 * o que a tabela, o painel de cobrança e os cards precisam mostrar.
 */
import { ESTEIRA_STAGES_TERMINAIS, isEstagioEsteira, slaDiasDaEtapa, type EstagioEsteira } from "@/lib/esteira-constants";
import type { TipoRecuperacao } from "@/lib/tipo-recuperacao";

export type RamoFiltro = TipoRecuperacao | "todas";

export const RAMO_FILTROS: { value: RamoFiltro; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "compensacao", label: "Compensação" },
  { value: "ressarcimento", label: "Ressarcimento" },
  { value: "recuperacao_judicial", label: "Recuperação Judicial" },
];

export interface ClienteRamoFlags {
  tem_ramo_compensacao?: boolean | null;
  tem_ramo_ressarcimento?: boolean | null;
  tem_ramo_judicial?: boolean | null;
}

/**
 * Ramos em que o cliente aparece. Cliente sem processo cadastrado cai em
 * Compensação (esteira v1) — nunca some das três esteiras.
 */
export function ramosDoCliente(c: ClienteRamoFlags): TipoRecuperacao[] {
  const out: TipoRecuperacao[] = [];
  if (c.tem_ramo_compensacao) out.push("compensacao");
  if (c.tem_ramo_ressarcimento) out.push("ressarcimento");
  if (c.tem_ramo_judicial) out.push("recuperacao_judicial");
  return out.length > 0 ? out : ["compensacao"];
}

export function pertenceAoRamo(c: ClienteRamoFlags, filtro: RamoFiltro): boolean {
  if (filtro === "todas") return true;
  return ramosDoCliente(c).includes(filtro);
}

export interface ClienteSlaLike extends ClienteRamoFlags {
  estagio_esteira: string;
  dias_na_etapa?: number | null;
  sla_dias?: number | null;
  data_entrada_estagio?: string | null;
}

export type SlaStatus = "sem_sla" | "no_prazo" | "atencao" | "estourado";

export interface SlaInfo {
  status: SlaStatus;
  sla: number | null;
  dias: number;
  /** Dias que faltam (negativo = dias estourados). null quando sem SLA. */
  restante: number | null;
  /** Data-limite da etapa (entrada + SLA). null quando sem SLA ou sem data. */
  vencimento: Date | null;
}

export const SLA_STATUS_LABEL: Record<SlaStatus, string> = {
  sem_sla: "Sem meta",
  no_prazo: "No prazo",
  atencao: "Atenção",
  estourado: "Estourado",
};

/**
 * Semáforo do SLA:
 *   estourado — passou do prazo (dias > sla)
 *   atencao   — falta ≤ max(1, 20% do SLA) dia(s), inclusive vence hoje.
 *               O dia de entrada nunca é atenção (senão SLA de 1 dia nasceria amarelo).
 *   no_prazo  — o resto
 *   sem_sla   — etapa sem meta (Concluído, Devolutiva)
 */
export function slaInfo(c: ClienteSlaLike, overrides?: Partial<Record<EstagioEsteira, number | null>>): SlaInfo {
  const dias = c.dias_na_etapa ?? 0;
  const sla = c.sla_dias ?? slaDiasDaEtapa(c.estagio_esteira, overrides);
  const entrada = c.data_entrada_estagio ? new Date(c.data_entrada_estagio) : null;
  if (sla == null) {
    return { status: "sem_sla", sla: null, dias, restante: null, vencimento: null };
  }
  const restante = sla - dias;
  const vencimento = entrada && !Number.isNaN(entrada.getTime())
    ? new Date(entrada.getTime() + sla * 86_400_000)
    : null;
  const margemAtencao = Math.max(1, Math.ceil(sla * 0.2));
  const status: SlaStatus =
    restante < 0 ? "estourado" : restante <= margemAtencao && dias > 0 ? "atencao" : "no_prazo";
  return { status, sla, dias, restante, vencimento };
}

export interface EtapaConfigLike {
  estagio: string;
  label: string;
  ordem: number;
  ativo: boolean;
}

/** Próxima etapa ativa na ordem configurada; null para etapa terminal ou última. */
export function proximaEtapa(estagioAtual: string, config: EtapaConfigLike[]): EtapaConfigLike | null {
  if (isEstagioEsteira(estagioAtual) && ESTEIRA_STAGES_TERMINAIS.includes(estagioAtual)) return null;
  const ordenado = [...config].sort((a, b) => a.ordem - b.ordem);
  const idx = ordenado.findIndex((e) => e.estagio === estagioAtual);
  if (idx < 0) return null;
  for (let i = idx + 1; i < ordenado.length; i += 1) {
    const cand = ordenado[i];
    if (!cand.ativo) continue;
    if (isEstagioEsteira(cand.estagio) && cand.estagio === "devolutiva_cliente") continue;
    return cand;
  }
  return null;
}

const fmtData = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Texto curto da próxima ação prevista, pra tabela e pro painel de cobrança. */
export function proximaAcao(c: ClienteSlaLike, config: EtapaConfigLike[]): string {
  const prox = proximaEtapa(c.estagio_esteira, config);
  if (!prox) return "Etapa final — nada previsto";
  const sla = slaInfo(c);
  if (sla.status === "estourado") {
    const atraso = Math.abs(sla.restante ?? 0);
    return `Mover para ${prox.label} — venceu há ${atraso}d`;
  }
  if (sla.status === "sem_sla" || !sla.vencimento) return `Mover para ${prox.label}`;
  if (sla.restante === 0) return `Mover para ${prox.label} — vence hoje`;
  return `Mover para ${prox.label} até ${fmtData(sla.vencimento)}`;
}

/** Ordena pelo SLA mais estourado primeiro; sem meta vai pro fim. */
export function ordenarPorSla<T extends ClienteSlaLike>(clientes: T[]): T[] {
  return [...clientes].sort((a, b) => {
    const sa = slaInfo(a);
    const sb = slaInfo(b);
    const ra = sa.restante ?? Number.POSITIVE_INFINITY;
    const rb = sb.restante ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return (b.dias_na_etapa ?? 0) - (a.dias_na_etapa ?? 0);
  });
}

export type FaixaAtraso = "todas" | "estourado" | "atencao" | "no_prazo";

export const FAIXAS_ATRASO: { value: FaixaAtraso; label: string }[] = [
  { value: "todas", label: "Todos" },
  { value: "estourado", label: "Estourados" },
  { value: "atencao", label: "Vencendo" },
  { value: "no_prazo", label: "No prazo" },
];

export function pertenceAFaixa(c: ClienteSlaLike, faixa: FaixaAtraso): boolean {
  if (faixa === "todas") return true;
  return slaInfo(c).status === faixa;
}

// ---------------------------------------------------------------------------
// Painel de cobrança — o que cada responsável precisa fechar hoje/amanhã
// ---------------------------------------------------------------------------

export type Urgencia = "estourado" | "hoje" | "amanha";

export interface ClienteCobrancaLike extends ClienteSlaLike {
  id: string;
  empresa: string;
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
}

export interface ItemCobranca<T extends ClienteCobrancaLike = ClienteCobrancaLike> {
  cliente: T;
  urgencia: Urgencia;
  sla: SlaInfo;
  acao: string;
}

export interface GrupoCobranca<T extends ClienteCobrancaLike = ClienteCobrancaLike> {
  responsavel_id: string | null;
  nome: string;
  itens: ItemCobranca<T>[];
  estourados: number;
  hoje: number;
  amanha: number;
}

export function urgenciaDe(sla: SlaInfo): Urgencia | null {
  if (sla.status === "estourado") return "estourado";
  if (sla.restante === 0) return "hoje";
  if (sla.restante === 1) return "amanha";
  return null;
}

/**
 * Agrupa por responsável só o que vence hoje, amanhã ou já estourou.
 * "Sem responsável" vem primeiro (é o primeiro problema a resolver), depois
 * quem tem mais pendência. Dentro do grupo, estourado > hoje > amanhã.
 */
export function agruparPorResponsavel<T extends ClienteCobrancaLike>(
  clientes: T[],
  config: EtapaConfigLike[],
): GrupoCobranca<T>[] {
  const peso: Record<Urgencia, number> = { estourado: 0, hoje: 1, amanha: 2 };
  const grupos = new Map<string, GrupoCobranca<T>>();
  for (const c of clientes) {
    const sla = slaInfo(c);
    const urgencia = urgenciaDe(sla);
    if (!urgencia) continue;
    const key = c.responsavel_id ?? "__sem__";
    let g = grupos.get(key);
    if (!g) {
      g = {
        responsavel_id: c.responsavel_id ?? null,
        nome: c.responsavel_id ? c.responsavel_nome ?? "Sem nome" : "Sem responsável",
        itens: [],
        estourados: 0,
        hoje: 0,
        amanha: 0,
      };
      grupos.set(key, g);
    }
    g.itens.push({ cliente: c, urgencia, sla, acao: proximaAcao(c, config) });
    if (urgencia === "estourado") g.estourados += 1;
    else if (urgencia === "hoje") g.hoje += 1;
    else g.amanha += 1;
  }
  const lista = [...grupos.values()];
  for (const g of lista) {
    g.itens.sort((a, b) => {
      if (peso[a.urgencia] !== peso[b.urgencia]) return peso[a.urgencia] - peso[b.urgencia];
      return (a.sla.restante ?? 0) - (b.sla.restante ?? 0);
    });
  }
  lista.sort((a, b) => {
    if (a.responsavel_id === null) return -1;
    if (b.responsavel_id === null) return 1;
    return b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, "pt-BR");
  });
  return lista;
}

const URGENCIA_TEXTO: Record<Urgencia, (sla: SlaInfo) => string> = {
  estourado: (sla) => `venceu há ${Math.abs(sla.restante ?? 0)}d`,
  hoje: () => "vence hoje",
  amanha: () => "vence amanhã",
};

export function urgenciaTexto(item: ItemCobranca): string {
  return URGENCIA_TEXTO[item.urgencia](item.sla);
}

/** Texto puro (WhatsApp) do que um responsável precisa fechar. */
export function resumoCobrancaTexto(grupo: GrupoCobranca, labelEtapa: (estagio: string) => string): string {
  const linhas = [`Pendências na esteira — ${grupo.nome}`, ""];
  for (const item of grupo.itens) {
    linhas.push(`• ${item.cliente.empresa} — ${labelEtapa(item.cliente.estagio_esteira)} (${urgenciaTexto(item)})`);
  }
  linhas.push("", `Total: ${grupo.itens.length} · ${grupo.estourados} estourado(s), ${grupo.hoje} hoje, ${grupo.amanha} amanhã`);
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Avatar por iniciais (não há foto em profiles — Fase posterior)
// ---------------------------------------------------------------------------

export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const PALETA_AVATAR = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-orange-100 text-orange-800",
];

/** Cor determinística por nome — a mesma pessoa tem sempre a mesma cor. */
export function corAvatar(nome: string | null | undefined): string {
  const s = nome ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETA_AVATAR[h % PALETA_AVATAR.length];
}
