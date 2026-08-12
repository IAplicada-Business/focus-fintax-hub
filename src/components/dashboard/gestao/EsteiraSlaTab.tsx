import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Target, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonKpi } from "@/components/dashboard/SkeletonKpi";
import { useCountUp } from "@/hooks/useCountUp";
import { useEsteiraSla } from "@/hooks/data/useEsteira";
import { ESTEIRA_STAGES, type EstagioEsteira } from "@/lib/esteira-constants";

type Filtro = EstagioEsteira | "atrasados";

const LABEL: Record<EstagioEsteira, string> = Object.fromEntries(
  ESTEIRA_STAGES.map((s) => [s.value, s.label]),
) as Record<EstagioEsteira, string>;

export function EsteiraSlaTab() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>("atrasados");
  const { data, isLoading, isError, error, refetch } = useEsteiraSla();

  const maxAtraso = useMemo(
    () => Math.max(...(data?.projecao.map((p) => p.atrasoAcumuladoDias) ?? [0]), 1),
    [data],
  );

  const fila = useMemo(() => {
    if (!data) return [];
    if (filtro === "atrasados") return data.atrasados;
    return data.clientes.filter((c) => c.estagio_esteira === filtro);
  }, [data, filtro]);

  const animAtrasados = useCountUp(data?.totalAtrasados ?? 0);
  const animNoPrazo = useCountUp(data?.totalNoPrazo ?? 0);
  const atrasoTotal = data?.projecao.reduce((s, p) => s + p.atrasoAcumuladoDias, 0) ?? 0;
  const animAtraso = useCountUp(atrasoTotal);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="card-base px-5 py-10 text-center space-y-3">
        <p className="text-sm font-semibold text-navy">Não foi possível carregar o SLA da esteira</p>
        <p className="text-xs text-ink-35">
          {(error as Error)?.message || "Tente novamente em instantes."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs font-semibold text-navy underline"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="animate-slide-up delay-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
            Atrasados no SLA
          </p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-dash-red">
              {animAtrasados}
            </p>
            <p className="text-xs text-ink-35 mt-1.5">acima do prazo da etapa</p>
          </div>
        </div>
        <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">No prazo</p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-dash-green">
              {animNoPrazo}
            </p>
            <p className="text-xs text-ink-35 mt-1.5">de {data.clientes.length} na esteira</p>
          </div>
        </div>
        <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
            Atraso acumulado
          </p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-navy">
              {animAtraso}d
            </p>
            <p className="text-xs text-ink-35 mt-1.5">soma dos dias acima do SLA</p>
          </div>
        </div>
      </div>

      {/* Cards: médio real vs SLA esperado */}
      <div className="animate-slide-up delay-2 card-base p-5">
        <div className="flex items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
              SLA por etapa
            </p>
            <h3 className="font-display text-lg font-bold text-navy mt-0.5">
              Tempo médio vs meta
            </h3>
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {data.etapas.map((e) => {
            const active = filtro === e.estagio;
            const media = e.tempo_medio_dias ?? e.dias_medios_atuais;
            const acimaMeta =
              e.sla_dias != null && media != null ? Number(media) > e.sla_dias : false;
            return (
              <button
                key={e.estagio}
                type="button"
                onClick={() => setFiltro(e.estagio)}
                className={`rounded-xl px-3 py-3 text-left transition-all border ${
                  active
                    ? "border-navy/30 bg-[rgba(10,21,100,0.06)] shadow-sm"
                    : "border-[rgba(10,21,100,0.08)] bg-white hover:border-navy/20"
                }`}
              >
                <p className="text-[10px] font-semibold text-ink-35 leading-tight min-h-[28px]">
                  {LABEL[e.estagio]}
                </p>
                <p className="font-display text-[28px] font-bold text-navy leading-none mt-1">
                  {e.clientes_na_etapa}
                </p>
                <p className="text-[10px] text-ink-35 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span className={acimaMeta ? "text-dash-red font-semibold" : undefined}>
                    {media != null ? `${media}d méd.` : "—"}
                  </span>
                  {e.sla_dias != null && (
                    <span className="text-ink-35/70">· sla {e.sla_dias}d</span>
                  )}
                </p>
                {e.atrasados > 0 && (
                  <p className="text-[10px] font-semibold text-dash-red mt-1">
                    {e.atrasados} atrasado{e.atrasados > 1 ? "s" : ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Gráfico de projeção de atraso */}
      <div className="animate-slide-up delay-3 card-base p-5">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
            Projeção de atraso
          </p>
          <h3 className="font-display text-lg font-bold text-navy mt-0.5">
            Dias acumulados acima do SLA por etapa
          </h3>
          <p className="text-xs text-ink-35 mt-1">
            Soma de max(0, dias na etapa − SLA) na fila atual — quanto maior a barra, maior o
            backlog de atraso a destravar.
          </p>
        </div>
        <div className="space-y-3">
          {data.projecao
            .filter((p) => p.slaDias != null)
            .map((p) => (
              <div key={p.estagio} className="grid grid-cols-[140px_1fr_64px] gap-3 items-center">
                <p className="text-xs font-medium text-ink truncate">{p.label}</p>
                <div className="h-2.5 rounded-full bg-[rgba(10,21,100,0.06)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      p.atrasoAcumuladoDias > 0 ? "bg-dash-red/80" : "bg-dash-green/70"
                    }`}
                    style={{
                      width: `${Math.max(
                        p.atrasoAcumuladoDias > 0 ? 4 : 0,
                        (p.atrasoAcumuladoDias / maxAtraso) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <p
                  className={`text-xs font-mono-dm tabular-nums text-right ${
                    p.atrasoAcumuladoDias > 0 ? "text-dash-red font-semibold" : "text-ink-35"
                  }`}
                >
                  {p.atrasoAcumuladoDias}d
                </p>
              </div>
            ))}
        </div>
      </div>

      {/* Fila de atrasados / etapa */}
      <div className="animate-slide-up delay-3 bg-[rgba(200,0,30,0.04)] border border-[rgba(200,0,30,0.18)] rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[rgba(200,0,30,0.08)] border-b border-[rgba(200,0,30,0.15)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-3.5 h-3.5 text-dash-red flex-shrink-0" />
            <span className="text-[11px] font-bold tracking-[0.8px] uppercase text-dash-red truncate">
              {filtro === "atrasados"
                ? "Fila de atraso — quem destravar primeiro"
                : `Etapa: ${LABEL[filtro]}`}
            </span>
          </div>
          <span className="text-[11px] font-mono-dm text-dash-red/80 shrink-0">
            {fila.length} cliente{fila.length !== 1 ? "s" : ""}
          </span>
        </div>

        {fila.length === 0 ? (
          <p className="px-5 py-10 text-sm text-ink-35 text-center">
            {filtro === "atrasados"
              ? "Nenhum cliente acima do SLA — esteira saudável."
              : "Nenhum cliente nesta etapa."}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {[...fila]
              .sort((a, b) => (b.dias_na_etapa || 0) - (a.dias_na_etapa || 0))
              .slice(0, 12)
              .map((c) => {
                const atrasado =
                  typeof c.atrasado === "boolean"
                    ? c.atrasado
                    : (c.dias_na_etapa || 0) >
                      (c.sla_dias ?? Number.POSITIVE_INFINITY);
                const sla = c.sla_dias;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="rounded-xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 bg-white border border-[rgba(200,0,30,0.12)] shadow-[0_2px_8px_rgba(200,0,30,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-ink leading-snug line-clamp-2">
                        {c.empresa}
                      </p>
                      {atrasado ? (
                        <Badge
                          variant="outline"
                          className="bg-red-50 text-red-700 border-red-200 text-[9px] shrink-0 gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Atrasado
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] shrink-0"
                        >
                          No prazo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-35 mt-2">
                      {LABEL[c.estagio_esteira as EstagioEsteira] || c.estagio_esteira}
                      {c.responsavel_nome ? ` · ${c.responsavel_nome}` : ""}
                    </p>
                    <div className="flex items-end justify-between mt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-ink-35">Na etapa</p>
                        <p
                          className={`font-display text-2xl font-bold leading-none ${
                            atrasado ? "text-dash-red" : "text-navy"
                          }`}
                        >
                          {c.dias_na_etapa}d
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-ink-35">SLA</p>
                        <p className="font-display text-lg font-bold text-navy leading-none">
                          {sla != null ? `${sla}d` : "—"}
                        </p>
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
