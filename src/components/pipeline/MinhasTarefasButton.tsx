import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatarVencimento, statusTarefa, type LeadTarefa } from "@/lib/lead-tarefas";
import { cn } from "@/lib/utils";

/** Chave de sessão: o aviso de atrasadas aparece uma vez por aba do navegador, não a cada visita ao Pipeline. */
export const LEMBRETE_SESSAO_KEY = "pipeline.lembrete-tarefas";

interface Props {
  /** Minhas tarefas abertas que vencem hoje ou já venceram (ordenadas). */
  tarefas: LeadTarefa[];
  /** Nome da empresa por lead_id (os leads já carregados no Pipeline). */
  empresaDoLead: (leadId: string) => string;
  onAbrirLead: (leadId: string) => void;
}

/**
 * Lembrete do Pipeline: botão "Minhas tarefas" com o número do que vence hoje
 * ou está atrasado, popover com a lista (clique abre o card do lead na aba
 * Tarefas) e um toast único por sessão quando há tarefa atrasada.
 */
export function MinhasTarefasButton({ tarefas, empresaDoLead, onAbrirLead }: Props) {
  const [aberto, setAberto] = useState(false);
  const agora = new Date();
  const atrasadas = tarefas.filter((t) => statusTarefa(t, agora) === "atrasada").length;

  useEffect(() => {
    if (atrasadas === 0) return;
    let jaAvisou = false;
    try {
      jaAvisou = sessionStorage.getItem(LEMBRETE_SESSAO_KEY) === "1";
      sessionStorage.setItem(LEMBRETE_SESSAO_KEY, "1");
    } catch {
      /* storage indisponível: avisa mesmo assim */
    }
    if (jaAvisou) return;
    toast.warning(
      atrasadas === 1 ? "Você tem 1 tarefa de follow-up atrasada" : `Você tem ${atrasadas} tarefas de follow-up atrasadas`,
      { action: { label: "Ver", onClick: () => setAberto(true) } },
    );
  }, [atrasadas]);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9", atrasadas > 0 && "border-dash-red/40 text-dash-red hover:text-dash-red")}
          title="Minhas tarefas que vencem hoje ou estão atrasadas"
        >
          <AlarmClock className="h-3.5 w-3.5 mr-1" /> Minhas tarefas
          {tarefas.length > 0 && (
            <span className={cn("ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-[18px] tabular-nums text-white", atrasadas > 0 ? "bg-dash-red" : "bg-dash-amber")}>
              {tarefas.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-semibold text-navy">Minhas tarefas</p>
          <p className="text-[11px] text-ink-35">Vencendo hoje ou atrasadas</p>
        </div>
        {tarefas.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nada pendente pra hoje.</p>
        ) : (
          <ul className="max-h-[320px] overflow-y-auto divide-y">
            {tarefas.map((t) => {
              const atrasada = statusTarefa(t, agora) === "atrasada";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAberto(false);
                      onAbrirLead(t.lead_id);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-ink-03 transition-colors"
                  >
                    <p className="text-xs font-semibold text-navy truncate">{empresaDoLead(t.lead_id)}</p>
                    <p className="text-[11px] text-ink-60 truncate">{t.titulo}</p>
                    <p className={cn("text-[10px] font-semibold tabular-nums", atrasada ? "text-dash-red" : "text-dash-amber")}>
                      {atrasada ? "Atrasada · " : ""}
                      {formatarVencimento(t.vence_em, agora)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
