import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { compactCurrency } from "@/components/dashboard/dashboard-utils";
import {
  ETAPA_LABEL,
  fetchCicloSla,
  type EtapaCiclo,
} from "@/services/gestaoDashboardService";
import { SkeletonKpi } from "../SkeletonKpi";
import { useCountUp } from "@/hooks/useCountUp";
import { Badge } from "@/components/ui/badge";
import { Target, Clock } from "lucide-react";

const ETAPAS: EtapaCiclo[] = [
  "cadastrado",
  "com_processo",
  "com_credito",
  "tese_ativa",
  "compensando",
  "compensado",
];

const SLA_DIAS: Partial<Record<EtapaCiclo, number>> = {
  cadastrado: 7,
  com_processo: 15,
  com_credito: 30,
  tese_ativa: 30,
  compensando: 45,
};

export function CicloSlaTab() {
  const navigate = useNavigate();
  const [filtroEtapa, setFiltroEtapa] = useState<EtapaCiclo | "atrasados">("atrasados");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-gestao-ciclo"],
    queryFn: fetchCicloSla,
    staleTime: 30_000,
  });

  const porEtapa = useMemo(() => {
    if (!data) return {} as Record<EtapaCiclo, number>;
    const m = {} as Record<EtapaCiclo, number>;
    for (const e of ETAPAS) m[e] = 0;
    for (const c of data.clientes) m[c.etapa] = (m[c.etapa] || 0) + 1;
    return m;
  }, [data]);

  const maxEtapa = useMemo(
    () => Math.max(...ETAPAS.map((e) => porEtapa[e] || 0), 1),
    [porEtapa],
  );

  const fila = useMemo(() => {
    if (!data) return [];
    if (filtroEtapa === "atrasados") return data.clientes.filter((c) => c.atrasado);
    return data.clientes.filter((c) => c.etapa === filtroEtapa);
  }, [data, filtroEtapa]);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
    );
  }

  const noPrazo = data.clientes.length - data.atrasados;
  const animAtrasados = useCountUp(data.atrasados);
  const animNoPrazo = useCountUp(Math.max(0, noPrazo));
  const tempoComp = data.tempoMedioDias.compensando;

  return (
    <div className="space-y-4">
      {/* KPIs — mesma linguagem do Dashboard */}
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
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
            No prazo
          </p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-dash-green">
              {animNoPrazo}
            </p>
            <p className="text-xs text-ink-35 mt-1.5">de {data.clientes.length} na carteira</p>
          </div>
        </div>
        <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
            Tempo médio · compensando
          </p>
          <div>
            <p className="font-display text-[40px] font-bold leading-none text-navy">
              {tempoComp != null ? `${tempoComp}d` : "—"}
            </p>
            <p className="text-xs text-ink-35 mt-1.5">
              SLA da etapa: {SLA_DIAS.compensando}d
            </p>
          </div>
        </div>
      </div>

      {/* Funil visual do ciclo — clicável */}
      <div className="animate-slide-up delay-2 card-base p-5">
        <div className="flex items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
              Esteira da carteira
            </p>
            <h3 className="font-display text-lg font-bold text-navy mt-0.5">
              Onde estão os clientes
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setFiltroEtapa("atrasados")}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-md border transition-colors ${
              filtroEtapa === "atrasados"
                ? "bg-[rgba(200,0,30,0.08)] border-[rgba(200,0,30,0.25)] text-dash-red"
                : "bg-white border-[rgba(10,21,100,0.10)] text-ink-60 hover:text-navy"
            }`}
          >
            Ver só atrasados
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {ETAPAS.map((e) => {
            const count = porEtapa[e] || 0;
            const avg = data.tempoMedioDias[e];
            const sla = SLA_DIAS[e];
            const active = filtroEtapa === e;
            const atrasadosNaEtapa = data.clientes.filter((c) => c.etapa === e && c.atrasado).length;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setFiltroEtapa(e)}
                className={`rounded-xl px-3 py-3 text-left transition-all border ${
                  active
                    ? "border-navy/30 bg-[rgba(10,21,100,0.06)] shadow-sm"
                    : "border-[rgba(10,21,100,0.08)] bg-white hover:border-navy/20"
                }`}
              >
                <p className="text-[10px] font-semibold text-ink-35 leading-tight min-h-[28px]">
                  {ETAPA_LABEL[e]}
                </p>
                <p className="font-display text-[28px] font-bold text-navy leading-none mt-1">
                  {count}
                </p>
                <div className="mt-2 h-1 rounded-full bg-[rgba(10,21,100,0.06)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-navy/70"
                    style={{ width: `${(count / maxEtapa) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-ink-35 mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {avg != null ? `${avg}d méd.` : "—"}
                  {sla != null && <span className="text-ink-35/70">· sla {sla}d</span>}
                </p>
                {atrasadosNaEtapa > 0 && (
                  <p className="text-[10px] font-semibold text-dash-red mt-1">
                    {atrasadosNaEtapa} atrasado{atrasadosNaEtapa > 1 ? "s" : ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fila de ação — cards, não tabela densa */}
      <div className="animate-slide-up delay-3 bg-[rgba(200,0,30,0.04)] border border-[rgba(200,0,30,0.18)] rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[rgba(200,0,30,0.08)] border-b border-[rgba(200,0,30,0.15)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-3.5 h-3.5 text-dash-red flex-shrink-0" />
            <span className="text-[11px] font-bold tracking-[0.8px] uppercase text-dash-red truncate">
              {filtroEtapa === "atrasados"
                ? "Fila de atraso — quem destravar primeiro"
                : `Etapa: ${ETAPA_LABEL[filtroEtapa]}`}
            </span>
          </div>
          <span className="text-[11px] font-mono-dm text-dash-red/80 shrink-0">
            {fila.length} cliente{fila.length !== 1 ? "s" : ""}
          </span>
        </div>

        {fila.length === 0 ? (
          <p className="px-5 py-10 text-sm text-ink-35 text-center">
            {filtroEtapa === "atrasados"
              ? "Nenhum cliente acima do SLA — esteira saudável."
              : "Nenhum cliente nesta etapa."}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {fila.slice(0, 12).map((c) => (
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
                  {c.atrasado ? (
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-700 border-red-200 text-[9px] shrink-0"
                    >
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
                  {ETAPA_LABEL[c.etapa]}
                  {c.teseAtiva ? ` · ${c.teseAtiva}` : ""}
                </p>
                <div className="flex items-end justify-between mt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink-35">Na etapa</p>
                    <p
                      className={`font-display text-2xl font-bold leading-none ${
                        c.atrasado ? "text-dash-red" : "text-navy"
                      }`}
                    >
                      {c.diasNaEtapa}d
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-ink-35">Saldo</p>
                    <p className="font-display text-lg font-bold text-navy leading-none">
                      {compactCurrency(c.saldo)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {fila.length > 12 && (
          <p className="px-4 pb-3 text-[11px] text-ink-35 text-center">
            Mostrando os 12 mais críticos · {fila.length - 12} restantes na etapa
          </p>
        )}
      </div>
    </div>
  );
}
