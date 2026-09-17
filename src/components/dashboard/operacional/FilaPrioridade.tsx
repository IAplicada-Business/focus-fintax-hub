import { useNavigate } from "react-router-dom";
import { Target } from "lucide-react";
import { Panel, LinkMore, InlineEmpty } from "../ui/primitives";
import { compactCurrency } from "../dashboard-utils";
import type { ClientePrioridade } from "@/lib/operacional-analytics";
import { cn } from "@/lib/utils";

const MOTIVO: Record<ClientePrioridade["motivo"], { label: string; cls: string }> = {
  atrasado: { label: "Atrasado no SLA", cls: "bg-dash-red/10 text-dash-red border-dash-red/20" },
  saldo_alto: { label: "Saldo alto parado", cls: "bg-gold/15 text-gold-deep border-gold/30" },
  sem_acao: { label: "Sem ação há 14d", cls: "bg-dash-amber/10 text-dash-amber border-dash-amber/20" },
};

/** Quem destravar primeiro: atrasados no SLA, saldo alto parado e clientes sem ação. */
export function FilaPrioridade({ fila }: { fila: ClientePrioridade[] }) {
  const navigate = useNavigate();
  return (
    <Panel
      eyebrow="Prioridade"
      title="Quem destravar primeiro"
      subtitle="Atrasados no SLA vêm antes, depois saldo alto parado, depois clientes sem ação registrada"
      action={<LinkMore onClick={() => navigate("/esteira?tab=cobranca")}>Cobrança do dia</LinkMore>}
      flush
    >
      {fila.length === 0 ? (
        <InlineEmpty>
          <span className="inline-flex items-center gap-2"><Target className="w-4 h-4" /> Nada travado — esteira saudável.</span>
        </InlineEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-[1px] text-ink-35 border-b border-ink-06">
                <th className="text-left px-5 py-2 w-8">#</th>
                <th className="text-left px-2 py-2">Cliente</th>
                <th className="text-left px-2 py-2">Motivo</th>
                <th className="text-left px-2 py-2">Etapa</th>
                <th className="text-right px-2 py-2">Na etapa</th>
                <th className="text-right px-2 py-2">Saldo</th>
                <th className="text-left px-5 py-2">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-06">
              {fila.map((c, i) => {
                const m = MOTIVO[c.motivo];
                return (
                  <tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)} className="cursor-pointer hover:bg-ink-03 transition-colors group">
                    <td className="px-5 py-2.5 font-mono-dm text-ink-35 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-2.5 font-semibold text-ink group-hover:underline max-w-[260px] truncate">{c.empresa}</td>
                    <td className="px-2 py-2.5"><span className={cn("inline-flex rounded-full border px-2 py-[2px] text-[10px] font-bold whitespace-nowrap", m.cls)}>{m.label}</span></td>
                    <td className="px-2 py-2.5 text-ink-60 whitespace-nowrap">{c.estagioLabel}</td>
                    <td className={cn("px-2 py-2.5 text-right font-mono-dm font-bold tabular-nums", c.atrasado ? "text-dash-red" : "text-navy")}>{c.dias}d</td>
                    <td className="px-2 py-2.5 text-right font-mono-dm font-bold tabular-nums text-navy">{c.saldo > 0 ? compactCurrency(c.saldo) : "—"}</td>
                    <td className="px-5 py-2.5 text-ink-60 whitespace-nowrap">{c.responsavel ?? <span className="text-ink-35 italic">sem responsável</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
