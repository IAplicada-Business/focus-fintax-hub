import { memo } from "react";
import { Link, type NavigateFunction } from "react-router-dom";
import { compactCurrency, type MonthBar, type ClientRank, MONTH_ABBR } from "../dashboard-utils";
import { SkeletonKpi } from "../SkeletonKpi";
import { SkeletonChart } from "../SkeletonChart";
import { SkeletonTable } from "../SkeletonTable";
import { KpiStripOperacional } from "./KpiStripOperacional";
import { ProjectionBand } from "./ProjectionBand";
import { ChartEvolucao } from "./ChartEvolucao";
import { DistribuicaoSaldo } from "./DistribuicaoSaldo";
import { UrgencyClients } from "./UrgencyClients";
import { RankingTable } from "./RankingTable";
import { BottomStripOperacional } from "./BottomStripOperacional";

interface Props {
  kpiLoading: boolean;
  chartLoading: boolean;
  opClientes: number;
  opTotalAtivos: number;
  opCompensado: number;
  opHonorarios: number;
  opSaldo: number;
  opEconomia: number;
  monthlyBars: MonthBar[];
  topCompensado: ClientRank[];
  topSaldo: ClientRank[];
  navigate: NavigateFunction;
  intimacoesPendentes: number;
  intimacoesVencendo: number;
}

export const OperationalView = memo(function OperationalView({ kpiLoading, chartLoading, opClientes, opTotalAtivos, opCompensado, opHonorarios, opSaldo, opEconomia, monthlyBars, topCompensado, topSaldo, navigate, intimacoesPendentes, intimacoesVencendo }: Props) {
  // Projections
  const numMonths = monthlyBars.length || 1;
  const avgMensal = opCompensado / numMonths;
  const projAnual = avgMensal * 12;
  const taxaHon = opCompensado > 0 ? opHonorarios / opCompensado : 0;
  const projHonAnual = projAnual * taxaHon;
  const prazoSaldo = avgMensal > 0 ? opSaldo / avgMensal : 0;
  const honFuturosSaldo = opSaldo * taxaHon;

  const periodLabel = monthlyBars.length >= 2
    ? `${monthlyBars[0]?.label} — ${monthlyBars[monthlyBars.length - 1]?.label}`
    : monthlyBars[0]?.label ?? "—";

  const lastMonth = monthlyBars.length >= 1 ? monthlyBars[monthlyBars.length - 1]?.valor ?? 0 : 0;
  const prevMonth = monthlyBars.length >= 2 ? monthlyBars[monthlyBars.length - 2]?.valor ?? 0 : 0;
  const trendPct = prevMonth > 0 ? Math.round(((lastMonth - prevMonth) / prevMonth) * 100) : 0;

  const insightVar = monthlyBars.length >= 2 ? `${trendPct > 0 ? "+" : ""}${trendPct}%` : "—";
  const insightVarLabel = monthlyBars.length >= 2
    ? `Var. ${monthlyBars[monthlyBars.length - 2]?.label?.split("/")[0]?.toLowerCase()}→${monthlyBars[monthlyBars.length - 1]?.label?.split("/")[0]?.toLowerCase()}`
    : "Variação";

  // All rankings merged
  const allRankings: ClientRank[] = [...topCompensado];
  topSaldo.forEach((s) => {
    if (!allRankings.find(r => r.id === s.id)) allRankings.push(s);
  });

  const saldoAbove1M = allRankings.filter(r => r.saldo >= 1000000);
  const saldo500kTo1M = allRankings.filter(r => r.saldo >= 500000 && r.saldo < 1000000);
  const saldoBelow500k = allRankings.filter(r => r.saldo > 0 && r.saldo < 500000);
  const saldoZero = allRankings.filter(r => r.saldo <= 0);

  const distBands = [
    { label: "Acima de R$1M", count: saldoAbove1M.length, total: saldoAbove1M.reduce((s, r) => s + r.saldo, 0), color: "var(--dash-red)", fontWeight: 700 },
    { label: "R$500k – R$1M", count: saldo500kTo1M.length, total: saldo500kTo1M.reduce((s, r) => s + r.saldo, 0), color: "var(--dash-amber)", fontWeight: 500 },
    { label: "Até R$500k", count: saldoBelow500k.length, total: saldoBelow500k.reduce((s, r) => s + r.saldo, 0), color: "var(--navy)", fontWeight: 500 },
    { label: "Saldo zerado", count: saldoZero.length, total: 0, color: "var(--ink-35)", fontWeight: 500 },
  ];
  const maxDistCount = Math.max(...distBands.map(d => d.count), 1);

  const urgencyClients = [...allRankings].filter(r => r.saldo >= 1000000).sort((a, b) => b.saldo - a.saldo).slice(0, 5);
  const fullRanking = [...allRankings].sort((a, b) => b.compensado - a.compensado).slice(0, 8);

  const nextMonthLabel = (() => {
    if (!monthlyBars.length) return "PROJ";
    const last = monthlyBars[monthlyBars.length - 1].month;
    const [y, m] = last.split("-").map(Number);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    const mk = String(nm).padStart(2, "0");
    return `${(MONTH_ABBR[mk] ?? mk).toUpperCase()}/${String(ny).slice(2)} ≈`;
  })();

  return (
    <>
      {kpiLoading ? <SkeletonKpi /> : (
        <KpiStripOperacional
          opClientes={opClientes} opTotalAtivos={opTotalAtivos} opCompensado={opCompensado}
          opHonorarios={opHonorarios} opEconomia={opEconomia} opSaldo={opSaldo}
          periodLabel={periodLabel} trendPct={trendPct} taxaHon={taxaHon}
        />
      )}

      {intimacoesPendentes > 0 && (
        <div className="flex items-center justify-between px-5 py-3 rounded-xl border border-destructive/15 bg-destructive/[0.04] mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-sm font-semibold text-foreground">
              {intimacoesPendentes} intimações fiscais pendentes
            </span>
            {intimacoesVencendo > 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                {intimacoesVencendo} vencem em 15 dias
              </span>
            )}
          </div>
          <Link to="/intimacoes" className="text-xs font-bold text-destructive hover:underline">
            Ver todas →
          </Link>
        </div>
      )}

      {chartLoading ? (
        <>
          <SkeletonChart />
          <div className="mt-3.5"><SkeletonTable /></div>
        </>
      ) : (
        <>
          <ProjectionBand
            projAnual={projAnual} projHonAnual={projHonAnual} prazoSaldo={prazoSaldo}
            honFuturosSaldo={honFuturosSaldo} avgMensal={avgMensal} opSaldo={opSaldo} periodLabel={periodLabel}
          />

          <div className="animate-slide-up delay-3 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-4">
            <ChartEvolucao
              monthlyBars={monthlyBars} avgMensal={avgMensal} nextMonthLabel={nextMonthLabel}
              periodLabel={periodLabel} trendPct={trendPct} taxaHon={taxaHon}
              insightVar={insightVar} insightVarLabel={insightVarLabel}
            />
            <DistribuicaoSaldo
              opClientes={opClientes} distBands={distBands} maxDistCount={maxDistCount}
              prazoSaldo={prazoSaldo} honFuturosSaldo={honFuturosSaldo} opSaldo={opSaldo} taxaHon={taxaHon}
            />
          </div>

          <UrgencyClients urgencyClients={urgencyClients} taxaHon={taxaHon} navigate={navigate} />
          <RankingTable fullRanking={fullRanking} numMonths={numMonths} navigate={navigate} />

          <BottomStripOperacional
            opClientes={opClientes} opCompensado={opCompensado} opHonorarios={opHonorarios}
            opEconomia={opEconomia} opSaldo={opSaldo} numMonths={numMonths}
            prazoSaldo={prazoSaldo} projHonAnual={projHonAnual}
          />
        </>
      )}
    </>
  );
});
