import { useNavigate } from "react-router-dom";
import { Panel, LinkMore, InlineEmpty } from "../ui/primitives";
import { corAvatar, iniciais } from "@/lib/esteira-acompanhamento";
import type { CargaResponsavel } from "@/lib/operacional-analytics";
import { cn } from "@/lib/utils";

/** Quem carrega o quê na esteira: clientes, atrasados, em compensação e sem ação na semana. */
export function CargaTime({ carga }: { carga: CargaResponsavel[] }) {
  const navigate = useNavigate();
  const max = Math.max(...carga.map((c) => c.clientes), 1);
  return (
    <Panel
      eyebrow="Time"
      title="Carga por responsável"
      subtitle="Clientes na esteira, atrasados no SLA e sem ação registrada há 7 dias"
      action={<LinkMore onClick={() => navigate("/esteira/organizar")}>Realocar</LinkMore>}
      flush
      className="h-full"
    >
      {carga.length === 0 ? (
        <InlineEmpty>Nenhum cliente na esteira.</InlineEmpty>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[1px] text-ink-35 border-b border-ink-06">
              <th className="text-left px-5 py-2">Responsável</th>
              <th className="text-right px-2 py-2">Clientes</th>
              <th className="text-right px-2 py-2">Atrasados</th>
              <th className="text-right px-2 py-2">Compensando</th>
              <th className="text-right px-5 py-2">Sem ação 7d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-06">
            {carga.map((c) => (
              <tr key={c.responsavel_id ?? "__sem__"} className="hover:bg-ink-03 transition-colors">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", !c.responsavel_id && "bg-ink-35")} style={c.responsavel_id ? { background: corAvatar(c.nome) } : undefined}>
                      {c.responsavel_id ? iniciais(c.nome) : "?"}
                    </span>
                    <div className="min-w-0">
                      <p className={cn("font-semibold truncate", c.responsavel_id ? "text-ink" : "text-ink-35 italic")}>{c.nome}</p>
                      <div className="h-1 w-24 rounded-full bg-ink-06 overflow-hidden mt-1">
                        <div className="h-full rounded-full bg-navy/60" style={{ width: `${(c.clientes / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="text-right px-2 py-2.5 font-mono-dm font-bold tabular-nums text-navy">{c.clientes}</td>
                <td className={cn("text-right px-2 py-2.5 font-mono-dm font-bold tabular-nums", c.atrasados > 0 ? "text-dash-red" : "text-ink-35")}>{c.atrasados}</td>
                <td className="text-right px-2 py-2.5 font-mono-dm tabular-nums text-dash-green">{c.emCompensacao}</td>
                <td className={cn("text-right px-5 py-2.5 font-mono-dm tabular-nums", c.semAcao7d > 0 ? "text-dash-amber font-semibold" : "text-ink-35")}>{c.semAcao7d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
