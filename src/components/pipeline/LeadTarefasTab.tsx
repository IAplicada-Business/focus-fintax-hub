import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useEquipeComercial } from "@/hooks/data/useEquipeComercial";
import { useConcluirTarefa, useCriarTarefa, useExcluirTarefa, useLeadTarefas } from "@/hooks/data/useLeadTarefas";
import {
  PRESETS_VENCIMENTO,
  STATUS_TAREFA_LABEL,
  STATUS_TAREFA_ORDEM,
  TIPOS_TAREFA,
  TIPO_TAREFA_LABEL,
  agruparTarefas,
  combinarDataHora,
  formatarVencimento,
  paraInputData,
  paraInputHora,
  vencimentoDoPreset,
  type PrefillTarefa,
  type StatusTarefa,
  type TipoTarefa,
} from "@/lib/lead-tarefas";
import { primeiroNome } from "@/lib/equipe-comercial";
import { cn } from "@/lib/utils";

const SEM_RESPONSAVEL = "__nenhum";

interface Props {
  leadId: string;
  /** Abre o formulário já preenchido (ex.: atalho "Mover para Follow-up"). Trocar a referência reabre. */
  prefill?: PrefillTarefa | null;
  readOnly?: boolean;
  /** Chamado após criar/concluir/excluir — o painel recarrega o histórico (o trigger grava lá). */
  onAlterado?: () => void;
}

const GRUPO_TITULO_CLS: Record<StatusTarefa, string> = {
  atrasada: "text-dash-red",
  hoje: "text-dash-amber",
  proxima: "text-navy",
  concluida: "text-ink-35",
};

/**
 * Aba "Tarefas" do card do lead: agenda follow-ups/lembretes com data, hora e
 * responsável, e lista o que está atrasado, para hoje, próximo e concluído.
 */
export function LeadTarefasTab({ leadId, prefill, readOnly = false, onAlterado }: Props) {
  const { user } = useAuth();
  const { data: tarefas = [], isLoading } = useLeadTarefas(leadId);
  const { data: equipe = [] } = useEquipeComercial();
  const criar = useCriarTarefa();
  const concluir = useConcluirTarefa();
  const excluir = useExcluirTarefa();

  const [formAberto, setFormAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoTarefa>("follow_up");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("09:00");
  const [responsavel, setResponsavel] = useState<string>(SEM_RESPONSAVEL);
  const [descricao, setDescricao] = useState("");

  const abrirForm = (p?: PrefillTarefa | null) => {
    const vence = p?.vence_em ?? vencimentoDoPreset("amanha");
    setTitulo(p?.titulo ?? "");
    setTipo(p?.tipo ?? "follow_up");
    setData(paraInputData(vence));
    setHora(paraInputHora(vence));
    setResponsavel(user?.id ?? SEM_RESPONSAVEL);
    setDescricao("");
    setFormAberto(true);
  };

  useEffect(() => {
    if (prefill && !readOnly) abrirForm(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Fecha o formulário ao trocar de lead, pra não gravar no lead errado.
  useEffect(() => {
    setFormAberto(false);
  }, [leadId]);

  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of equipe) m.set(p.user_id, p.full_name ?? "Sem nome");
    return m;
  }, [equipe]);
  const nomeResponsavel = (id: string | null) => {
    if (!id) return "sem responsável";
    if (id === user?.id) return "você";
    return primeiroNome(nomes.get(id)) || "outro usuário";
  };
  // O usuário logado pode não ser SDR/closer (ex.: admin) — aparece como "Eu".
  const opcoesResponsavel = useMemo(() => {
    const lista = equipe.map((p) => ({ value: p.user_id, label: p.full_name ?? "Sem nome" }));
    if (user?.id && !lista.some((o) => o.value === user.id)) lista.unshift({ value: user.id, label: "Eu" });
    return lista;
  }, [equipe, user?.id]);

  const venceEm = combinarDataHora(data, hora);
  const podeSalvar = titulo.trim().length > 0 && !!venceEm && !criar.isPending;

  const salvar = async () => {
    if (!venceEm || !titulo.trim()) return;
    await criar.mutateAsync({
      lead_id: leadId,
      titulo,
      tipo,
      vence_em: venceEm.toISOString(),
      responsavel_id: responsavel === SEM_RESPONSAVEL ? null : responsavel,
      descricao,
    });
    setFormAberto(false);
    onAlterado?.();
  };

  const alternarConcluida = async (id: string, concluida: boolean) => {
    await concluir.mutateAsync({ id, concluida });
    onAlterado?.();
  };

  const remover = async (id: string) => {
    await excluir.mutateAsync(id);
    onAlterado?.();
  };

  const agora = new Date();
  const grupos = agruparTarefas(tarefas, agora);

  return (
    <div className="space-y-4">
      {!readOnly && !formAberto && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => abrirForm()}>
          <Plus className="h-4 w-4 mr-1" /> Nova tarefa
        </Button>
      )}

      {!readOnly && formAberto && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
          <div>
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Retomar contato" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoTarefa)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_TAREFA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Responsável</Label>
              <Select value={responsavel} onValueChange={setResponsavel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {opcoesResponsavel.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Quando</Label>
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data" />
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Hora" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS_VENCIMENTO.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    const d = vencimentoDoPreset(p.id);
                    setData(paraInputData(d));
                    setHora(paraInputHora(d));
                  }}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-ink-06 bg-white hover:border-navy/40 hover:text-navy text-ink-60 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {!venceEm && data && <p className="text-[11px] text-destructive mt-1">Data ou hora inválida.</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Descrição (opcional)</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="O que falar, contexto da última conversa..." />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setFormAberto(false)} disabled={criar.isPending}>
              Cancelar
            </Button>
            <Button size="sm" className="flex-1" onClick={salvar} disabled={!podeSalvar}>
              <CalendarClock className="h-4 w-4 mr-1" /> {criar.isPending ? "Salvando..." : "Agendar tarefa"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Carregando tarefas...</p>
      ) : tarefas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma tarefa agendada para este lead.</p>
      ) : (
        STATUS_TAREFA_ORDEM.filter((s) => grupos[s].length > 0).map((status) => (
          <section key={status} aria-label={STATUS_TAREFA_LABEL[status]}>
            <h4 className={cn("text-[10px] font-bold uppercase tracking-[1px] mb-1.5", GRUPO_TITULO_CLS[status])}>
              {STATUS_TAREFA_LABEL[status]} ({grupos[status].length})
            </h4>
            <ul className="space-y-1.5">
              {grupos[status].map((t) => {
                const concluida = !!t.concluida_em;
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-2.5",
                      status === "atrasada" ? "border-dash-red/30 bg-dash-red/[0.04]" : "border-ink-06 bg-white",
                    )}
                  >
                    <Checkbox
                      checked={concluida}
                      disabled={readOnly || concluir.isPending}
                      onCheckedChange={(v) => alternarConcluida(t.id, v === true)}
                      aria-label={concluida ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium leading-tight", concluida && "line-through text-muted-foreground")}>{t.titulo}</p>
                      <p className="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-1.5">
                        <span className={cn("font-semibold tabular-nums", status === "atrasada" ? "text-dash-red" : status === "hoje" ? "text-dash-amber" : "text-ink-60")}>
                          {formatarVencimento(t.vence_em, agora)}
                        </span>
                        <span className="text-ink-35">· {TIPO_TAREFA_LABEL[t.tipo] ?? t.tipo} · {nomeResponsavel(t.responsavel_id)}</span>
                      </p>
                      {t.descricao && <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-line">{t.descricao}</p>}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => remover(t.id)}
                        disabled={excluir.isPending}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-ink-35 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Excluir tarefa"
                        aria-label={`Excluir ${t.titulo}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
