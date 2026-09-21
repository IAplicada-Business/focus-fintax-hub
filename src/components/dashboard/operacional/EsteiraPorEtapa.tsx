import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, KanbanSquare, LayoutGrid } from "lucide-react";
import { Panel, LinkMore } from "../ui/primitives";
import type { EsteiraClienteLike, EtapaEsteiraResumo } from "@/lib/operacional-analytics";
import {
  DASH_ESTEIRA_VIEW_KEY,
  agruparEsteiraPorEtapa,
  ordenarCardsEsteira,
  parseDashEsteiraView,
  slaDoClienteEsteira,
  type DashEsteiraView,
} from "@/lib/esteira-board";
import { corAvatar, iniciais } from "@/lib/esteira-acompanhamento";
import { cn } from "@/lib/utils";

interface Props {
  etapas: EtapaEsteiraResumo[];
  /** Clientes da esteira para a visão em quadro. */
  clientes: EsteiraClienteLike[];
}

const MAX_CARDS_POR_COLUNA = 6;

/**
 * Onde os clientes estão na esteira. Duas leituras da mesma informação:
 * "Etapas" (cartões por etapa com atrasados e tempo médio vs SLA) e
 * "Kanban" (colunas com os clientes de cada etapa, atrasados primeiro).
 */
export function EsteiraPorEtapa({ etapas, clientes }: Props) {
  const navigate = useNavigate();
  const [view, setView] = useState<DashEsteiraView>(() => {
    try {
      return parseDashEsteiraView(localStorage.getItem(DASH_ESTEIRA_VIEW_KEY));
    } catch {
      return "kanban";
    }
  });
  const trocarView = (v: DashEsteiraView) => {
    setView(v);
    try {
      localStorage.setItem(DASH_ESTEIRA_VIEW_KEY, v);
    } catch {
      /* storage indisponível */
    }
  };

  const total = etapas.reduce((s, e) => s + e.clientes, 0);
  const atrasados = etapas.reduce((s, e) => s + e.atrasados, 0);
  const etapasComClientes = etapas.filter((etapa) => etapa.clientes > 0);
  const baseConcentrada =
    total > 1 &&
    etapasComClientes.length === 1 &&
    etapasComClientes[0].clientes === total;

  return (
    <Panel
      eyebrow="Esteira"
      title="Onde os clientes estão"
      subtitle={
        baseConcentrada
          ? `${total} clientes · 100% em ${etapasComClientes[0].label} · base requer revisão`
          : `${total} clientes na esteira · ${atrasados} acima do SLA · clique para abrir a etapa`
      }
      action={
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Formato da esteira" className="flex rounded-full border border-ink-06 bg-white p-0.5">
            {(
              [
                { value: "kanban", label: "Kanban", icon: KanbanSquare },
                { value: "etapas", label: "Etapas", icon: LayoutGrid },
              ] as { value: DashEsteiraView; label: string; icon: typeof LayoutGrid }[]
            ).map((opt) => {
              const ativo = view === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => trocarView(opt.value)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors",
                    ativo ? "bg-navy text-white font-semibold" : "font-medium text-ink-60 hover:text-navy",
                  )}
                >
                  <opt.icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <LinkMore onClick={() => navigate(view === "kanban" ? "/esteira?tab=kanban" : "/esteira?tab=acompanhamento")}>Abrir esteira</LinkMore>
        </div>
      }
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
      {view === "kanban" ? <MiniKanban etapas={etapas} clientes={clientes} onEtapa={(e) => navigate(`/esteira?tab=kanban&etapa=${e}`)} onCliente={(id) => navigate(`/clientes/${id}`)} /> : <GradeEtapas etapas={etapasComClientes} ocultarAtrasos={baseConcentrada} onEtapa={(e) => navigate(`/esteira?tab=acompanhamento&etapa=${e}`)} />}
    </Panel>
  );
}

function GradeEtapas({ etapas, ocultarAtrasos, onEtapa }: { etapas: EtapaEsteiraResumo[]; ocultarAtrasos: boolean; onEtapa: (estagio: string) => void }) {
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
              <p className="text-[10px] text-ink-35">{e.diasMedios != null ? `${e.diasMedios}d méd.` : "sem histórico"}{e.sla != null ? ` · SLA ${e.sla}d` : ""}</p>
            </div>
            <div className="h-1.5 rounded-full bg-ink-06 overflow-hidden">
              <div className={cn("h-full rounded-full", e.atrasados > 0 ? "bg-dash-red/70" : "bg-navy/70")} style={{ width: `${(e.clientes / max) * 100}%` }} />
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-extrabold text-navy tabular-nums">{e.clientes}</p>
              {!ocultarAtrasos && e.atrasados > 0 && <p className="text-[9px] font-semibold text-dash-red">{e.atrasados} acima do SLA</p>}
              {ocultarAtrasos && acima && <p className="text-[9px] font-semibold text-dash-amber">SLA a revisar</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MiniKanban({ etapas, clientes, onEtapa, onCliente }: { etapas: EtapaEsteiraResumo[]; clientes: EsteiraClienteLike[]; onEtapa: (estagio: string) => void; onCliente: (id: string) => void }) {
  const grouped = useMemo(() => agruparEsteiraPorEtapa(clientes.map((c) => ({ ...c, id: c.id })), etapas.map((e) => ({ value: e.estagio, label: e.label }))), [clientes, etapas]);

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {etapas.map((e) => {
        const todos = ordenarCardsEsteira(grouped[e.estagio] ?? [], e.sla);
        const visiveis = todos.slice(0, MAX_CARDS_POR_COLUNA);
        const restantes = todos.length - visiveis.length;
        return (
          <div key={e.estagio} className={cn("flex-1 min-w-[168px] max-w-[260px] rounded-xl border flex flex-col", e.atrasados > 0 ? "border-dash-red/25 bg-dash-red/[0.02]" : "border-ink-06 bg-ink-03/60")}>
            <button type="button" onClick={() => onEtapa(e.estagio)} className="px-2.5 pt-2.5 pb-2 border-b border-ink-06 text-left hover:bg-white/60 rounded-t-xl transition-colors">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[10px] font-bold uppercase tracking-[0.8px] text-navy truncate">{e.label}</p>
                <span className="font-display text-sm font-extrabold text-navy tabular-nums">{e.clientes}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-ink-35 tabular-nums flex items-center gap-1">
                {e.sla != null ? `meta ${e.sla}d` : "sem meta"}
                {e.atrasados > 0 && <span className="ml-auto font-bold text-dash-red">{e.atrasados} atrasado{e.atrasados > 1 ? "s" : ""}</span>}
              </p>
            </button>
            <div className="flex flex-col gap-1.5 p-1.5 min-h-[56px]">
              {visiveis.length === 0 && <p className="text-[10px] text-ink-35 text-center py-3">Nenhum cliente</p>}
              {visiveis.map((c) => {
                const sla = slaDoClienteEsteira(c, e.sla);
                const atrasado = sla.status === "estourado";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onCliente(c.id)}
                    className={cn(
                      "w-full text-left rounded-lg border bg-white px-2 py-1.5 transition-all hover:shadow-soft hover:-translate-y-px",
                      atrasado ? "border-dash-red/30" : sla.status === "atencao" ? "border-dash-amber/30" : "border-ink-06",
                    )}
                    title={c.responsavel_nome ? `Responsável: ${c.responsavel_nome}` : "Sem responsável"}
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="flex-1 text-[11px] font-semibold text-navy truncate leading-tight">{c.empresa ?? "—"}</p>
                      {atrasado && <AlertTriangle className="h-3 w-3 text-dash-red shrink-0" aria-hidden />}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1.5">
                      <span
                        className={cn(
                          "h-4 w-4 rounded-full text-[8px] font-bold inline-flex items-center justify-center shrink-0",
                          c.responsavel_nome ? corAvatar(c.responsavel_nome) : "border border-dashed border-dash-amber text-dash-amber",
                        )}
                      >
                        {c.responsavel_nome ? iniciais(c.responsavel_nome) : "?"}
                      </span>
                      <span className={cn("text-[10px] tabular-nums font-semibold", atrasado ? "text-dash-red" : sla.status === "atencao" ? "text-dash-amber" : "text-ink-35")}>
                        {sla.dias}d{sla.sla != null ? `/${sla.sla}d` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
              {restantes > 0 && (
                <button type="button" onClick={() => onEtapa(e.estagio)} className="text-[10px] font-semibold text-gold-deep hover:underline py-1">
                  +{restantes} na etapa →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
