import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Panel, LinkMore } from "../ui/primitives";
import type { EtapaEsteiraResumo } from "@/lib/operacional-analytics";
import { cn } from "@/lib/utils";

interface Props {
  etapas: EtapaEsteiraResumo[];
}

/**
 * Distribuição da carteira pelas etapas da esteira. O quadro (kanban) e a
 * tabela vivem em /esteira, onde há largura para operar; aqui o dashboard
 * mostra só a leitura agregada de cada etapa.
 */
export function EsteiraPorEtapa({ etapas }: Props) {
  const navigate = useNavigate();

  const total = etapas.reduce((s, e) => s + e.clientes, 0);
  const atrasados = etapas.reduce((s, e) => s + e.atrasados, 0);
  const comClientes = etapas.filter((etapa) => etapa.clientes > 0);
  const vazias = etapas.filter((etapa) => etapa.clientes === 0);
  const baseConcentrada =
    total > 1 && comClientes.length === 1 && comClientes[0].clientes === total;

  return (
    <Panel
      eyebrow="Esteira"
      title="Onde os clientes estão"
      subtitle={
        baseConcentrada
          ? `${total} clientes · 100% em ${comClientes[0].label} · base requer revisão`
          : `${total} clientes na esteira · ${atrasados} acima do SLA · clique para abrir a etapa`
      }
      action={<LinkMore onClick={() => navigate("/esteira?tab=kanban")}>Abrir esteira</LinkMore>}
      className="h-full"
    >
      {baseConcentrada && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-dash-amber/30 bg-dash-amber/[0.06] px-3 py-2 text-[11px] text-ink-60">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dash-amber" />
          <span>
            Distribuição concentrada em uma única etapa. Os dias acima do SLA refletem
            cadastro legado e não são tratados como atraso operacional até a base ser revisada.
          </span>
        </div>
      )}

      {comClientes.length === 0 ? (
        <p className="py-8 text-center text-xs italic text-ink-35">Nenhum cliente na esteira.</p>
      ) : (
        <GradeEtapas
          etapas={comClientes}
          ocultarAtrasos={baseConcentrada}
          onEtapa={(estagio) => navigate(`/esteira?tab=kanban&etapa=${estagio}`)}
        />
      )}

      {vazias.length > 0 && (
        <p className="mt-3 border-t border-ink-06 pt-2.5 text-[10px] leading-snug text-ink-35">
          <span className="font-bold uppercase tracking-[0.8px]">Sem cliente</span>{" "}
          {vazias.map((etapa) => etapa.label).join(" · ")}
        </p>
      )}
    </Panel>
  );
}

function GradeEtapas({
  etapas,
  ocultarAtrasos,
  onEtapa,
}: {
  etapas: EtapaEsteiraResumo[];
  ocultarAtrasos: boolean;
  onEtapa: (estagio: string) => void;
}) {
  const max = Math.max(...etapas.map((e) => e.clientes), 1);
  return (
    <div className="space-y-1.5">
      {etapas.map((e) => {
        const acima = e.sla != null && e.diasMedios != null && e.diasMedios > e.sla;
        return (
          <button
            key={e.estagio}
            type="button"
            onClick={() => onEtapa(e.estagio)}
            className={cn(
              "grid w-full grid-cols-[minmax(120px,1fr)_minmax(100px,2fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-gold/40 hover:bg-ink-03",
              !ocultarAtrasos && e.atrasados > 0 ? "border-dash-red/25" : "border-ink-06",
            )}
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-60">{e.label}</p>
              <p className="text-[10px] text-ink-35">
                {e.diasMedios != null ? `${e.diasMedios}d méd.` : "sem histórico"}
                {e.sla != null ? ` · SLA ${e.sla}d` : ""}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-06">
              <div
                className={cn("h-full rounded-full", !ocultarAtrasos && e.atrasados > 0 ? "bg-dash-red/70" : "bg-navy/70")}
                style={{ width: `${(e.clientes / max) * 100}%` }}
              />
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-extrabold tabular-nums text-navy">{e.clientes}</p>
              {!ocultarAtrasos && e.atrasados > 0 && (
                <p className="text-[9px] font-semibold text-dash-red">{e.atrasados} acima do SLA</p>
              )}
              {ocultarAtrasos && acima && <p className="text-[9px] font-semibold text-dash-amber">SLA a revisar</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
