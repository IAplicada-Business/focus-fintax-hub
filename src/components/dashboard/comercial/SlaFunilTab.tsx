import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, Target } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SkeletonKpi } from "@/components/dashboard/SkeletonKpi";
import { useCountUp } from "@/hooks/useCountUp";
import { useAuth } from "@/hooks/useAuth";
import { useLeadsFunil, usePipelineSlaConfig, useUpdatePipelineSlaMeta } from "@/hooks/data/usePipelineSla";
import { resumirSlaFunil, type EtapaFunil } from "@/lib/pipeline-sla";
import { compactCurrency, SEGMENTO_LABELS } from "../dashboard-utils";

type Filtro = EtapaFunil | "atrasados";

/**
 * Aba "SLA do funil" do Dashboard comercial: tempo parado por etapa do
 * pipeline de leads vs meta. Mesmo desenho do "SLA por Etapa" da esteira, mas
 * medindo leads (status_funil). Metas editáveis inline por admin/PMO.
 */
export function SlaFunilTab() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const podeEditar = userRole === "admin" || userRole === "pmo";
  const [filtro, setFiltro] = useState<Filtro>("atrasados");

  const leadsQ = useLeadsFunil();
  const cfgQ = usePipelineSlaConfig();
  const salvarMeta = useUpdatePipelineSlaMeta();

  const resumo = useMemo(
    () => (leadsQ.data && cfgQ.data ? resumirSlaFunil(leadsQ.data, cfgQ.data) : null),
    [leadsQ.data, cfgQ.data],
  );

  const maxAtraso = useMemo(() => Math.max(...(resumo?.etapas.map((e) => e.atrasoAcumulado) ?? [0]), 1), [resumo]);

  const fila = useMemo(() => {
    if (!resumo) return [];
    if (filtro === "atrasados") return resumo.atrasados;
    return resumo.linhas.filter((l) => l.etapa === filtro).sort((a, b) => b.dias - a.dias);
  }, [resumo, filtro]);

  const animAtrasados = useCountUp(resumo?.totalAtrasados ?? 0);
  const animNoPrazo = useCountUp(resumo?.totalNoPrazo ?? 0);
  const animAtraso = useCountUp(resumo?.atrasoAcumulado ?? 0);

  const onMetaBlur = async (etapa: EtapaFunil, raw: string, atual: number | null) => {
    const trimmed = raw.trim();
    const novo = trimmed === "" ? null : Math.max(0, Math.floor(Number(trimmed)));
    if (novo !== null && !Number.isFinite(novo)) return;
    if (novo === atual) return;
    try {
      await salvarMeta.mutateAsync({ etapa, slaDias: novo });
      toast.success("Meta atualizada.");
    } catch {
      /* toastError já disparou */
    }
  };

  if (leadsQ.isLoading || cfgQ.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
    );
  }

  if (leadsQ.isError || !resumo) {
    return (
      <div className="card-base px-5 py-10 text-center space-y-3">
        <p className="text-sm font-semibold text-navy">Não foi possível carregar o SLA do funil</p>
        <p className="text-xs text-ink-35">{(leadsQ.error as Error)?.message || "Tente novamente em instantes."}</p>
        <button type="button" onClick={() => leadsQ.refetch()} className="text-xs font-semibold text-navy underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  const labelDe = (etapa: EtapaFunil) => resumo.etapas.find((e) => e.etapa === etapa)?.label ?? etapa;

  return (
    <div className="space-y-4">
      <div className="animate-slide-up delay-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">Leads atrasados</p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-dash-red">{animAtrasados}</p>
            <p className="text-xs text-ink-35 mt-1.5">acima da meta da etapa</p>
          </div>
        </div>
        <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">No prazo</p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-dash-green">{animNoPrazo}</p>
            <p className="text-xs text-ink-35 mt-1.5">de {resumo.linhas.length} no funil</p>
          </div>
        </div>
        <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">Atraso acumulado</p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-navy">{animAtraso}d</p>
            <p className="text-xs text-ink-35 mt-1.5">soma dos dias acima da meta</p>
          </div>
        </div>
      </div>

      <div className="animate-slide-up delay-2 card-base p-5">
        <div className="flex items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">SLA por etapa do funil</p>
            <h3 className="font-display text-lg font-bold text-navy mt-0.5">Tempo parado vs meta</h3>
            <p className="text-xs text-ink-35 mt-1">
              {podeEditar ? "Edite a meta (dias) direto no card — vale pra todo o time." : "Metas definidas pelo admin/PMO."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFiltro("atrasados")}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-md border transition-colors ${
              filtro === "atrasados"
                ? "bg-[rgba(200,0,30,0.08)] border-[rgba(200,0,30,0.25)] text-dash-red"
                : "bg-white border-[rgba(10,21,100,0.10)] text-ink-60 hover:text-navy"
            }`}
          >
            Ver só atrasados
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {resumo.etapas.map((e) => {
            const active = filtro === e.etapa;
            const acimaMeta = e.sla != null && e.diasMedios != null && e.diasMedios > e.sla;
            return (
              <div
                key={e.etapa}
                className={`rounded-xl px-3 py-3 text-left transition-all border ${
                  active ? "border-navy/30 bg-[rgba(10,21,100,0.06)] shadow-sm" : "border-[rgba(10,21,100,0.08)] bg-white hover:border-navy/20"
                }`}
              >
                <button type="button" onClick={() => setFiltro(e.etapa)} className="w-full text-left">
                  <p className="text-[10px] font-semibold text-ink-35 leading-tight min-h-[28px]">{e.label}</p>
                  <p className="font-display text-[28px] font-bold text-navy leading-none mt-1">{e.leads}</p>
                  <p className="text-[10px] text-ink-35 mt-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span className={acimaMeta ? "text-dash-red font-semibold" : undefined}>
                      {e.diasMedios != null ? `${e.diasMedios}d méd.` : "—"}
                    </span>
                  </p>
                  {e.atrasados > 0 && (
                    <p className="text-[10px] font-semibold text-dash-red mt-1">
                      {e.atrasados} atrasado{e.atrasados > 1 ? "s" : ""}
                    </p>
                  )}
                </button>
                <label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-35">
                  <span>meta</span>
                  {podeEditar ? (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={e.sla ?? ""}
                      placeholder="—"
                      disabled={salvarMeta.isPending}
                      onBlur={(ev) => void onMetaBlur(e.etapa, ev.target.value, e.sla)}
                      onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                      className="h-6 w-14 rounded border border-[rgba(10,21,100,0.15)] bg-white px-1.5 text-right font-mono-dm text-[11px] tabular-nums text-navy focus:outline-none focus:ring-1 focus:ring-navy/40"
                      aria-label={`Meta em dias para ${e.label}`}
                    />
                  ) : (
                    <span className="font-mono-dm tabular-nums text-navy">{e.sla != null ? `${e.sla}d` : "sem meta"}</span>
                  )}
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="animate-slide-up delay-3 card-base p-5">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">Backlog de atraso</p>
          <h3 className="font-display text-lg font-bold text-navy mt-0.5">Dias acumulados acima da meta por etapa</h3>
        </div>
        <div className="space-y-3">
          {resumo.etapas
            .filter((e) => e.sla != null)
            .map((e) => (
              <div key={e.etapa} className="grid grid-cols-[140px_1fr_64px] gap-3 items-center">
                <p className="text-xs font-medium text-ink truncate">{e.label}</p>
                <div className="h-2.5 rounded-full bg-[rgba(10,21,100,0.06)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${e.atrasoAcumulado > 0 ? "bg-dash-red/80" : "bg-dash-green/70"}`}
                    style={{ width: `${Math.max(e.atrasoAcumulado > 0 ? 4 : 0, (e.atrasoAcumulado / maxAtraso) * 100)}%` }}
                  />
                </div>
                <p className={`text-xs font-mono-dm tabular-nums text-right ${e.atrasoAcumulado > 0 ? "text-dash-red font-semibold" : "text-ink-35"}`}>
                  {e.atrasoAcumulado}d
                </p>
              </div>
            ))}
        </div>
      </div>

      <div className="animate-slide-up delay-3 bg-[rgba(200,0,30,0.04)] border border-[rgba(200,0,30,0.18)] rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[rgba(200,0,30,0.08)] border-b border-[rgba(200,0,30,0.15)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-3.5 h-3.5 text-dash-red flex-shrink-0" />
            <span className="text-[11px] font-bold tracking-[0.8px] uppercase text-dash-red truncate">
              {filtro === "atrasados" ? "Leads atrasados — quem destravar primeiro" : `Etapa: ${labelDe(filtro)}`}
            </span>
          </div>
          <span className="text-[11px] font-mono-dm text-dash-red/80 shrink-0">
            {fila.length} lead{fila.length !== 1 ? "s" : ""}
          </span>
        </div>

        {fila.length === 0 ? (
          <p className="px-5 py-10 text-sm text-ink-35 text-center">
            {filtro === "atrasados" ? "Nenhum lead acima da meta — funil saudável." : "Nenhum lead nesta etapa."}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {fila.slice(0, 12).map((l) => {
              const atrasado = l.sla.status === "estourado";
              return (
                <button
                  key={l.lead.id}
                  type="button"
                  onClick={() => navigate(`/pipeline?etapa=${l.etapa}`)}
                  className="rounded-xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 bg-white border border-[rgba(200,0,30,0.12)] shadow-[0_2px_8px_rgba(200,0,30,0.06)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-ink leading-snug line-clamp-2">{l.lead.empresa}</p>
                    {atrasado ? (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[9px] shrink-0 gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Atrasado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] shrink-0">
                        No prazo
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-35 mt-2">
                    {l.label}
                    {l.lead.segmento ? ` · ${SEGMENTO_LABELS[l.lead.segmento] ?? l.lead.segmento}` : ""}
                    {Number(l.lead.potencial ?? 0) > 0 ? ` · ${compactCurrency(Number(l.lead.potencial))}` : ""}
                  </p>
                  <div className="flex items-end justify-between mt-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-35">Na etapa</p>
                      <p className={`font-display text-2xl font-bold leading-none ${atrasado ? "text-dash-red" : "text-navy"}`}>{l.dias}d</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-ink-35">Meta</p>
                      <p className="font-display text-lg font-bold text-navy leading-none">{l.sla.sla != null ? `${l.sla.sla}d` : "—"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {fila.length > 12 && (
          <p className="px-4 pb-3 text-[11px] text-ink-35 text-center">
            Mostrando os 12 mais críticos · {fila.length - 12} restantes
          </p>
        )}
      </div>
    </div>
  );
}
