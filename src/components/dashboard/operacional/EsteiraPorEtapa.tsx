import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { Panel, LinkMore } from "../ui/primitives";
import type { EtapaEsteiraResumo } from "@/lib/operacional-analytics";
import { cn } from "@/lib/utils";

/** Onde os clientes estão na esteira, com atrasados e tempo médio vs SLA por etapa. */
export function EsteiraPorEtapa({ etapas }: { etapas: EtapaEsteiraResumo[] }) {
  const navigate = useNavigate();
  const total = etapas.reduce((s, e) => s + e.clientes, 0);
  const atrasados = etapas.reduce((s, e) => s + e.atrasados, 0);
  const max = Math.max(...etapas.map((e) => e.clientes), 1);
  return (
    <Panel
      eyebrow="Esteira"
      title="Onde os clientes estão"
      subtitle={`${total} clientes na esteira · ${atrasados} acima do SLA · clique para abrir a etapa`}
      action={<LinkMore onClick={() => navigate("/esteira?tab=acompanhamento")}>Abrir esteira</LinkMore>}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {etapas.map((e) => {
          const acima = e.sla != null && e.diasMedios != null && e.diasMedios > e.sla;
          return (
            <button
              key={e.estagio}
              type="button"
              onClick={() => navigate(`/esteira?tab=acompanhamento&etapa=${e.estagio}`)}
              className={cn(
                "rounded-xl px-3 py-3 text-left border transition-all hover:-translate-y-0.5 hover:shadow-soft",
                e.atrasados > 0 ? "border-dash-red/25 bg-dash-red/[0.03]" : "border-ink-06 bg-white hover:border-gold/40",
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35 leading-tight min-h-[26px]">{e.label}</p>
              <p className="font-display text-[26px] font-extrabold text-navy leading-none mt-1 tabular-nums">{e.clientes}</p>
              <div className="mt-2 h-1 rounded-full bg-ink-06 overflow-hidden">
                <div className={cn("h-full rounded-full", e.atrasados > 0 ? "bg-dash-red/70" : "bg-navy/70")} style={{ width: `${(e.clientes / max) * 100}%` }} />
              </div>
              <p className="text-[10px] text-ink-35 mt-1.5 flex items-center gap-1 tabular-nums">
                <Clock className="w-3 h-3" />
                <span className={acima ? "text-dash-red font-semibold" : undefined}>{e.diasMedios != null ? `${e.diasMedios}d méd.` : "—"}</span>
                {e.sla != null && <span className="text-ink-35/70">· sla {e.sla}d</span>}
              </p>
              {e.atrasados > 0 && <p className="text-[10px] font-semibold text-dash-red mt-1">{e.atrasados} atrasado{e.atrasados > 1 ? "s" : ""} · {e.atrasoAcumulado}d acum.</p>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
