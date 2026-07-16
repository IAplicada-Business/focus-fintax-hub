import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { compactCurrency } from "@/components/dashboard/dashboard-utils";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { fetchResumoSemanal } from "@/services/gestaoDashboardService";
import {
  STATUS_COMPENSACAO_LABELS,
  STATUS_COMPENSACAO_COLORS,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import { SkeletonKpi } from "../SkeletonKpi";
import { useCountUp } from "@/hooks/useCountUp";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

export function ResumoSemanalTab() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard-gestao-resumo"],
    queryFn: fetchResumoSemanal,
    staleTime: 30_000,
  });

  const saldoParadoTotal = useMemo(
    () => (data?.clientesSemMovimento ?? []).reduce((s, c) => s + c.saldo, 0),
    [data],
  );

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
        <p className="text-sm font-semibold text-navy">Não foi possível carregar o pulso da semana</p>
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

  const atencao = data.clientesSemMovimento.length;
  const maxTop = Math.max(...data.topClientes.map((c) => c.valor), 1);
  const maxSaldo = Math.max(...data.clientesSemMovimento.map((c) => c.saldo), 1);

  return (
    <div className="space-y-4">
      <KpiStrip
        compensado={data.totalCompensado}
        emMovimento={data.clientesEmMovimento}
        lancamentos={data.comps.length}
        atencao={atencao}
      />

      {data.intimacoesNovas > 0 && (
        <div className="flex items-center justify-between px-5 py-3 rounded-xl border border-destructive/15 bg-destructive/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-sm font-semibold text-foreground">
              {data.intimacoesNovas} intimação{data.intimacoesNovas > 1 ? "ões" : ""} nova
              {data.intimacoesNovas > 1 ? "s" : ""} na semana
            </span>
          </div>
          <Link to="/intimacoes" className="text-xs font-bold text-destructive hover:underline">
            Ver intimações →
          </Link>
        </div>
      )}

      {/* Faixa de contexto — compacta, sem card vazio */}
      <div className="animate-slide-up delay-2 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-ink-60">
        <span>
          <strong className="text-navy">{atencao}</strong> com saldo parado
          {atencao > 0 && (
            <>
              {" "}
              · <strong className="text-dash-red">{compactCurrency(saldoParadoTotal)}</strong> parado
            </>
          )}
        </span>
        <span className="text-ink-35">·</span>
        <span>
          <strong className="text-navy">{data.clientesEmMovimento}</strong> em movimento esta semana
        </span>
        {data.processosNovos.length > 0 && (
          <>
            <span className="text-ink-35">·</span>
            <span>
              <strong className="text-navy">{data.processosNovos.length}</strong> tese(s) nova(s)
            </span>
          </>
        )}
      </div>

      {/* Duas colunas densas — lista vertical, sem scroll lateral */}
      <div className="animate-slide-up delay-3 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <section className="card-base overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-[rgba(10,21,100,0.06)] flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-dash-red">
                Prioridade
              </p>
              <h3 className="font-display text-lg font-bold text-navy mt-0.5">
                Saldo sem movimento
              </h3>
            </div>
            <span className="text-[11px] font-mono-dm text-ink-35 shrink-0">
              {atencao} cliente{atencao !== 1 ? "s" : ""}
            </span>
          </div>

          {atencao === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-35 text-center">
              Nenhum cliente com saldo parado — carteira em movimento.
            </p>
          ) : (
            <ul className="divide-y divide-[rgba(10,21,100,0.06)]">
              {data.clientesSemMovimento.map((c, i) => {
                const st = c.status as StatusCompensacao;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/clientes/${c.id}`)}
                      className="w-full px-5 py-3 text-left hover:bg-[rgba(200,0,30,0.03)] transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-[11px] font-mono-dm text-ink-35 shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-semibold text-ink truncate group-hover:underline">
                              {c.empresa}
                            </p>
                            {STATUS_COMPENSACAO_LABELS[st] && (
                              <Badge
                                variant="outline"
                                className={`${STATUS_COMPENSACAO_COLORS[st]} text-[9px] px-1.5 py-0 shrink-0`}
                              >
                                {STATUS_COMPENSACAO_LABELS[st]}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-[rgba(200,0,30,0.08)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-dash-red/70"
                              style={{ width: `${Math.max(6, (c.saldo / maxSaldo) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-ink-35 mt-1">{c.dias}d sem atualização</p>
                        </div>
                        <p className="font-display text-base font-bold text-dash-red shrink-0 tabular-nums">
                          {compactCurrency(c.saldo)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card-base overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-[rgba(10,21,100,0.06)] flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
                Movimento
              </p>
              <h3 className="font-display text-lg font-bold text-navy mt-0.5">
                Top da semana
              </h3>
            </div>
            <Link
              to="/clientes"
              className="text-[11px] font-semibold text-navy/70 hover:text-navy flex items-center gap-1 shrink-0"
            >
              Carteira <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {data.topClientes.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-35 text-center">
              Sem compensações lançadas nos últimos 7 dias.
            </p>
          ) : (
            <ul className="divide-y divide-[rgba(10,21,100,0.06)]">
              {data.topClientes.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="w-full px-5 py-3 text-left hover:bg-[rgba(10,21,100,0.03)] transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-[11px] font-mono-dm text-ink-35 shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink truncate group-hover:underline">
                          {c.empresa}
                        </p>
                        <div className="mt-1.5 h-1 rounded-full bg-[rgba(10,21,100,0.06)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-navy/75"
                            style={{ width: `${Math.max(6, (c.valor / maxTop) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-ink-35 mt-1">
                          {c.lancamentos} lançamento{c.lancamentos > 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="font-display text-base font-bold text-navy shrink-0 tabular-nums">
                        {formatCurrencyBR(c.valor)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function KpiStrip({
  compensado,
  emMovimento,
  lancamentos,
  atencao,
}: {
  compensado: number;
  emMovimento: number;
  lancamentos: number;
  atencao: number;
}) {
  const animComp = useCountUp(compensado);
  const animMov = useCountUp(emMovimento);
  const animAten = useCountUp(atencao);

  const kpis = [
    {
      label: "Compensado na semana",
      value: compactCurrency(animComp),
      sub: `${lancamentos} lançamento${lancamentos !== 1 ? "s" : ""}`,
      color: "text-dash-green",
    },
    {
      label: "Clientes em movimento",
      value: String(animMov),
      sub: "com compensação nos 7 dias",
      color: "text-navy",
    },
    {
      label: "Precisam de ação",
      value: String(animAten),
      sub: "saldo sem movimento",
      color: atencao > 0 ? "text-dash-red" : "text-navy",
    },
  ];

  return (
    <div
      role="region"
      aria-label="KPIs da semana"
      className="animate-slide-up delay-1 grid grid-cols-1 sm:grid-cols-3 gap-4"
    >
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="card-base p-5 relative flex flex-col justify-between min-h-[110px]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35 mb-2">
            {kpi.label}
          </p>
          <div>
            <p className={`font-display text-[40px] font-bold leading-none ${kpi.color}`}>
              {kpi.value}
            </p>
            <p className="text-xs text-ink-35 mt-1.5">{kpi.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
