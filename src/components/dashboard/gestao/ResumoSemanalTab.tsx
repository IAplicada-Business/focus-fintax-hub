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
import { Target, ArrowRight, AlertTriangle } from "lucide-react";

export function ResumoSemanalTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-gestao-resumo"],
    queryFn: fetchResumoSemanal,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
    );
  }

  const atencao = data.clientesSemMovimento.length;
  const maxTop = Math.max(...data.topClientes.map((c) => c.valor), 1);

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

      {/* Fila de decisão — quem está parado com saldo */}
      <div className="animate-slide-up delay-2 bg-[rgba(200,0,30,0.04)] border border-[rgba(200,0,30,0.18)] rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[rgba(200,0,30,0.08)] border-b border-[rgba(200,0,30,0.15)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-3.5 h-3.5 text-dash-red flex-shrink-0" />
            <span className="text-[11px] font-bold tracking-[0.8px] uppercase text-dash-red truncate">
              Precisam de ação — saldo sem movimento na semana
            </span>
          </div>
          <span className="text-[11px] font-mono-dm text-dash-red/80 shrink-0">
            {atencao} cliente{atencao !== 1 ? "s" : ""}
          </span>
        </div>

        {atencao === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-35 text-center">
            Nenhum cliente com saldo parado — carteira em movimento.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto px-4 py-3">
            {data.clientesSemMovimento.map((c) => {
              const st = c.status as StatusCompensacao;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="flex-shrink-0 w-[200px] rounded-xl p-3 text-left transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(200,0,30,0.06) 0%, rgba(200,0,30,0.03) 100%)",
                    border: "1px solid rgba(200,0,30,0.15)",
                    boxShadow: "0 2px 8px rgba(200,0,30,0.08)",
                  }}
                >
                  <p className="text-xs font-bold text-ink truncate">{c.empresa}</p>
                  <p className="font-display text-xl font-bold text-dash-red mt-1">
                    {compactCurrency(c.saldo)}
                  </p>
                  <div className="flex items-center justify-between mt-1.5 gap-1">
                    <p className="text-[10px] text-ink-35">{c.dias}d sem update</p>
                    {STATUS_COMPENSACAO_LABELS[st] && (
                      <Badge
                        variant="outline"
                        className={`${STATUS_COMPENSACAO_COLORS[st]} text-[9px] px-1.5 py-0`}
                      >
                        {STATUS_COMPENSACAO_LABELS[st]}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* O que moveu — ranking compacto, não tabela bruta */}
      <div className="animate-slide-up delay-3 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="card-base p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
                Quem moveu a carteira
              </p>
              <h3 className="font-display text-lg font-bold text-navy mt-0.5">
                Top compensações da semana
              </h3>
            </div>
            <Link
              to="/clientes"
              className="text-[11px] font-semibold text-navy/70 hover:text-navy flex items-center gap-1"
            >
              Carteira <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {data.topClientes.length === 0 ? (
            <p className="text-sm text-ink-35 py-6 text-center">
              Sem compensações lançadas nos últimos 7 dias.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.topClientes.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-xs font-semibold text-ink truncate group-hover:underline">
                        <span className="text-ink-35 font-mono-dm mr-2">{i + 1}</span>
                        {c.empresa}
                      </span>
                      <span className="font-display text-sm font-bold text-navy shrink-0">
                        {formatCurrencyBR(c.valor)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[rgba(10,21,100,0.06)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-navy/80 transition-all"
                        style={{ width: `${Math.max(4, (c.valor / maxTop) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-ink-35 mt-1">
                      {c.lancamentos} lançamento{c.lancamentos > 1 ? "s" : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-base p-5 flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">
            Leitura rápida
          </p>
          <h3 className="font-display text-lg font-bold text-navy mt-0.5 mb-4">
            O que olhar agora
          </h3>
          <ul className="space-y-3 flex-1">
            <InsightRow
              tone={atencao > 0 ? "alert" : "ok"}
              title={
                atencao > 0
                  ? `${atencao} com saldo parado`
                  : "Nenhum saldo parado na semana"
              }
              detail={
                atencao > 0
                  ? "Priorize quem tem maior saldo na fila acima."
                  : "Carteira ativa — mantenha o ritmo de lançamentos."
              }
            />
            <InsightRow
              tone={data.totalCompensado > 0 ? "ok" : "muted"}
              title={
                data.totalCompensado > 0
                  ? `${compactCurrency(data.totalCompensado)} compensados`
                  : "Sem volume compensado"
              }
              detail={
                data.clientesEmMovimento > 0
                  ? `${data.clientesEmMovimento} cliente(s) com lançamento.`
                  : "Confira se o fluxo da semana já foi importado."
              }
            />
            {data.processosNovos.length > 0 && (
              <InsightRow
                tone="ok"
                title={`${data.processosNovos.length} tese(s) novas`}
                detail="Novos processos entraram na esteira esta semana."
              />
            )}
            {data.intimacoesNovas > 0 && (
              <InsightRow
                tone="alert"
                title={`${data.intimacoesNovas} intimação(ões)`}
                detail="Tratar prazo antes de virar risco fiscal."
              />
            )}
          </ul>
          <Link
            to="/dashboard"
            className="mt-4 text-[11px] font-semibold text-navy/70 hover:text-navy inline-flex items-center gap-1"
          >
            Ir ao Dashboard operacional <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
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

function InsightRow({
  tone,
  title,
  detail,
}: {
  tone: "alert" | "ok" | "muted";
  title: string;
  detail: string;
}) {
  const dot =
    tone === "alert"
      ? "bg-dash-red"
      : tone === "ok"
        ? "bg-dash-green"
        : "bg-ink-35";
  return (
    <li className="flex gap-3 items-start">
      {tone === "alert" ? (
        <AlertTriangle className="w-3.5 h-3.5 text-dash-red mt-0.5 shrink-0" />
      ) : (
        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
      )}
      <div>
        <p className="text-sm font-semibold text-ink leading-snug">{title}</p>
        <p className="text-xs text-ink-35 mt-0.5">{detail}</p>
      </div>
    </li>
  );
}
