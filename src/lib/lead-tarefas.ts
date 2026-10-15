/**
 * Tarefas e lembretes do card do lead (tabela `lead_tarefas`). Regras puras:
 * status pelo vencimento, ordenação, agrupamento, atalhos de data e o resumo
 * que vira badge no kanban. Quem busca/grava é `leadTarefasService`.
 */

export const TIPOS_TAREFA = [
  { value: "follow_up", label: "Follow-up" },
  { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "outro", label: "Outro" },
] as const;

export type TipoTarefa = (typeof TIPOS_TAREFA)[number]["value"];

export const TIPO_TAREFA_LABEL: Record<string, string> = Object.fromEntries(TIPOS_TAREFA.map((t) => [t.value, t.label]));

export interface LeadTarefa {
  id: string;
  lead_id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  vence_em: string;
  responsavel_id: string | null;
  concluida_em: string | null;
  criado_por: string | null;
  criado_em: string | null;
}

export type StatusTarefa = "atrasada" | "hoje" | "proxima" | "concluida";

export const STATUS_TAREFA_ORDEM: StatusTarefa[] = ["atrasada", "hoje", "proxima", "concluida"];

export const STATUS_TAREFA_LABEL: Record<StatusTarefa, string> = {
  atrasada: "Atrasadas",
  hoje: "Hoje",
  proxima: "Próximas",
  concluida: "Concluídas",
};

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Atrasada = venceu e não foi concluída (inclusive mais cedo hoje: o horário
 * marcado já passou). Hoje = vence ainda hoje. Próxima = depois de hoje.
 */
export function statusTarefa(t: Pick<LeadTarefa, "vence_em" | "concluida_em">, agora: Date = new Date()): StatusTarefa {
  if (t.concluida_em) return "concluida";
  const vence = new Date(t.vence_em);
  if (Number.isNaN(vence.getTime())) return "proxima";
  if (vence.getTime() < agora.getTime()) return "atrasada";
  if (mesmoDia(vence, agora)) return "hoje";
  return "proxima";
}

/** Abertas pela data de vencimento (mais urgente primeiro); concluídas da mais recente pra mais antiga. */
export function ordenarTarefas<T extends Pick<LeadTarefa, "vence_em" | "concluida_em">>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => {
    const ca = a.concluida_em ? 1 : 0;
    const cb = b.concluida_em ? 1 : 0;
    if (ca !== cb) return ca - cb;
    if (a.concluida_em && b.concluida_em) return String(b.concluida_em).localeCompare(String(a.concluida_em));
    return new Date(a.vence_em).getTime() - new Date(b.vence_em).getTime();
  });
}

export function agruparTarefas<T extends Pick<LeadTarefa, "vence_em" | "concluida_em">>(
  tarefas: T[],
  agora: Date = new Date(),
): Record<StatusTarefa, T[]> {
  const out: Record<StatusTarefa, T[]> = { atrasada: [], hoje: [], proxima: [], concluida: [] };
  for (const t of ordenarTarefas(tarefas)) out[statusTarefa(t, agora)].push(t);
  return out;
}

export function contarAbertas(tarefas: Pick<LeadTarefa, "concluida_em">[]): number {
  return tarefas.filter((t) => !t.concluida_em).length;
}

// ───────────────────────────────────────── Atalhos de vencimento

export const PRESETS_VENCIMENTO = [
  { id: "amanha", label: "Amanhã 9h", dias: 1 },
  { id: "3d", label: "+3 dias", dias: 3 },
  { id: "7d", label: "+7 dias", dias: 7 },
  { id: "15d", label: "+15 dias", dias: 15 },
  { id: "30d", label: "+30 dias", dias: 30 },
] as const;

export type PresetVencimento = (typeof PRESETS_VENCIMENTO)[number]["id"];

/** Hora padrão dos atalhos: início do expediente, pra o lembrete cair cedo. */
export const HORA_PADRAO_TAREFA = 9;

/** Data do atalho às 9h (hora local), contando dias corridos a partir de hoje. */
export function vencimentoDoPreset(preset: PresetVencimento, agora: Date = new Date()): Date {
  const dias = PRESETS_VENCIMENTO.find((p) => p.id === preset)?.dias ?? 1;
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), HORA_PADRAO_TAREFA, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` local, pro `<input type="date">`. */
export function paraInputData(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `HH:MM` local, pro `<input type="time">`. */
export function paraInputHora(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Junta data + hora dos inputs em horário local; null se inválido. Hora vazia = 9h. */
export function combinarDataHora(data: string, hora: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.trim());
  if (!m) return null;
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  const horas = h ? Number(h[1]) : HORA_PADRAO_TAREFA;
  const minutos = h ? Number(h[2]) : 0;
  if (horas > 23 || minutos > 59) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), horas, minutos, 0, 0);
  // Rejeita 31/02 e afins (o Date "rola" pro mês seguinte).
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** "Hoje 14:00", "Amanhã 09:00", "Ontem 09:00", "22/10 09:00" (com ano se for outro ano). */
export function formatarVencimento(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hora = paraInputHora(d);
  const amanha = new Date(agora);
  amanha.setDate(agora.getDate() + 1);
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (mesmoDia(d, agora)) return `Hoje ${hora}`;
  if (mesmoDia(d, amanha)) return `Amanhã ${hora}`;
  if (mesmoDia(d, ontem)) return `Ontem ${hora}`;
  const data = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return d.getFullYear() === agora.getFullYear() ? `${data} ${hora}` : `${data}/${d.getFullYear()} ${hora}`;
}

/** Data curta pro badge do kanban ("22/10"). */
export function formatarDataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// ───────────────────────────────────────── Follow-up

export interface PrefillTarefa {
  titulo: string;
  tipo: TipoTarefa;
  vence_em: Date;
}

/** Formulário aberto pelo atalho "Mover para Follow-up": retomar contato em 7 dias. */
export function prefillFollowUp(agora: Date = new Date()): PrefillTarefa {
  return { titulo: "Retomar contato", tipo: "follow_up", vence_em: vencimentoDoPreset("7d", agora) };
}

// ───────────────────────────────────────── Kanban e lembrete

export interface ResumoTarefasLead {
  /** Status da tarefa aberta mais urgente. */
  status: Exclude<StatusTarefa, "concluida">;
  /** Tarefa aberta mais urgente (menor vencimento). */
  proxima: LeadTarefa;
  abertas: number;
}

/** lead_id → tarefa aberta mais urgente, pro badge do card. Concluídas são ignoradas. */
export function resumoTarefasPorLead(tarefas: LeadTarefa[], agora: Date = new Date()): Map<string, ResumoTarefasLead> {
  const out = new Map<string, ResumoTarefasLead>();
  for (const t of ordenarTarefas(tarefas.filter((x) => !x.concluida_em))) {
    const cur = out.get(t.lead_id);
    if (cur) {
      cur.abertas += 1;
      continue;
    }
    out.set(t.lead_id, { status: statusTarefa(t, agora) as ResumoTarefasLead["status"], proxima: t, abertas: 1 });
  }
  return out;
}

/** Tarefas abertas do usuário que vencem hoje ou já venceram (o que o lembrete cobra). */
export function tarefasParaLembrete<T extends LeadTarefa>(tarefas: T[], userId: string | null | undefined, agora: Date = new Date()): T[] {
  if (!userId) return [];
  return ordenarTarefas(
    tarefas.filter((t) => t.responsavel_id === userId && !t.concluida_em && statusTarefa(t, agora) !== "proxima"),
  );
}

/**
 * Linhas de lead_historico com de_etapa = para_etapa são anotações (o trigger
 * de lead_tarefas grava "Tarefa criada/concluída" assim), não movimento de
 * etapa — quem conta conversão ou reunião deve ignorá-las.
 */
export function ehAnotacaoHistorico(h: { de_etapa?: string | null; para_etapa: string }): boolean {
  return h.de_etapa != null && h.de_etapa === h.para_etapa;
}
