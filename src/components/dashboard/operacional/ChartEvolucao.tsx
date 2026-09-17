import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { MonthBar, compactCurrency, fullCurrency } from "../dashboard-utils";
import { EmptyState } from "@/components/EmptyState";

interface Props {
  monthlyBars: MonthBar[];
  avgMensal: number;
  nextMonthLabel: string;
  periodLabel: string;
  trendPct: number;
  taxaHon: number;
  insightVar: string;
  insightVarLabel: string;
}

export function ChartEvolucao({ monthlyBars, avgMensal, nextMonthLabel, periodLabel, trendPct, taxaHon, insightVar, insightVarLabel }: Props) {
  return (
    <div className="card-base overflow-hidden">
      <div className="px-[18px] pt-3 pb-2.5 border-b border-[rgba(8,17,29,0.10)] flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-[0.8px] uppercase text-navy">Evolução mensal — compensações realizadas</div>
          <div className="text-[11px] text-ink-35 mt-0.5">receita da AGF FinTax vs economia bruta dos clientes</div>
        </div>
        <span className="inline-flex items-center bg-[rgba(8,17,29,0.08)] rounded-[5px] px-2 py-[2px] text-[10px] font-semibold text-navy font-mono-dm tabular-nums">{periodLabel}</span>
      </div>

      {monthlyBars.length === 0 ? (
        <EmptyState icon={<TrendingUp size={20} className="text-ink-35" />} title="Nenhuma compensação registrada" subtitle="O gráfico de evolução aparecerá aqui." />
      ) : (
        <>
          <div className="px-[18px] pt-2.5 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...monthlyBars, { month: "proj", label: nextMonthLabel, valor: avgMensal, honorarios: 0, isProjection: true }]} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-12)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--ink-35)", fontFamily: "'DM Mono', monospace", fontWeight: 500 } as any} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink-35)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => compactCurrency(v)} width={60} />
                <RechartsTooltip formatter={(v: number) => fullCurrency(v)} />
                <Bar dataKey="valor" name="Compensado" fill="var(--navy)" radius={[3, 3, 0, 0]} maxBarSize={36} label={{ position: "top" as const, fontSize: 9, fill: "var(--ink-60)", fontFamily: "'DM Mono', monospace", formatter: (v: number) => compactCurrency(v) }} />
                <Bar dataKey="honorarios" name="Honorários" fill="var(--dash-red)" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.65} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex gap-3.5 px-[18px] py-2 pb-3">
            <div className="flex items-center gap-[5px] text-[10px] text-ink-60">
              <div className="w-2 h-2 rounded-sm bg-navy" />Compensado
            </div>
            <div className="flex items-center gap-[5px] text-[10px] text-ink-60">
              <div className="w-2 h-2 rounded-sm bg-dash-red opacity-65" />Honorários AGF
            </div>
            <div className="flex items-center gap-[5px] text-[10px] text-ink-60">
              <div className="w-2 h-2 rounded-sm border-2 border-dashed border-navy bg-transparent" />Projeção
            </div>
          </div>
          {/* Insight strip */}
          <div className="grid grid-cols-3 border-t border-[rgba(8,17,29,0.10)]">
            <div className="px-3.5 py-2.5 border-r border-[rgba(8,17,29,0.10)] text-center">
              <div className={`font-display text-lg font-bold leading-none ${trendPct < 0 ? "text-dash-red" : trendPct > 0 ? "text-dash-green" : "text-navy"}`}>{insightVar}</div>
              <div className="text-[9px] text-ink-35 tracking-[0.8px] uppercase mt-[3px] font-semibold">{insightVarLabel}</div>
            </div>
            <div className="px-3.5 py-2.5 border-r border-[rgba(8,17,29,0.10)] text-center">
              <div className="font-display text-lg font-bold text-navy leading-none">{(taxaHon * 100).toFixed(1)}%</div>
              <div className="text-[9px] text-ink-35 tracking-[0.8px] uppercase mt-[3px] font-semibold">Taxa hon. média</div>
            </div>
            <div className="px-3.5 py-2.5 text-center">
              <div className="font-display text-lg font-bold text-dash-green leading-none">{compactCurrency(avgMensal)}</div>
              <div className="text-[9px] text-ink-35 tracking-[0.8px] uppercase mt-[3px] font-semibold">Média mensal</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
