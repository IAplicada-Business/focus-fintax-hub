import { compactCurrency } from "../dashboard-utils";
import { useCountUp } from "@/hooks/useCountUp";

interface Props {
  opClientes: number;
  opTotalAtivos: number;
  opCompensado: number;
  opHonorarios: number;
  opEconomia: number;
  opSaldo: number;
  periodLabel: string;
  trendPct: number;
  taxaHon: number;
}

export function KpiStripOperacional({ opClientes, opTotalAtivos, opCompensado, opHonorarios, opEconomia, opSaldo, periodLabel, trendPct, taxaHon }: Props) {
  const animClientes = useCountUp(opClientes);
  const animCompensado = useCountUp(opCompensado);
  const animHonorarios = useCountUp(opHonorarios);
  const animEconomia = useCountUp(opEconomia);
  const animSaldo = useCountUp(opSaldo);

  const kpis = [
    { label: "Clientes compensando", value: String(animClientes), sub: `de ${opTotalAtivos} ativos`, colorClass: "text-navy" },
    { label: "Total compensado", value: compactCurrency(animCompensado), sub: periodLabel, colorClass: "text-dash-green", trend: trendPct !== 0 ? trendPct : undefined },
    { label: "Honorários gerados", value: compactCurrency(animHonorarios), sub: `taxa média ${(taxaHon * 100).toFixed(1)}%`, colorClass: "text-navy" },
    { label: "Economia líquida clientes", value: compactCurrency(animEconomia), sub: "líquido de honorários", colorClass: "text-dash-green" },
    { label: "Saldo de créditos", value: compactCurrency(animSaldo), sub: "disponível para compensar", colorClass: "text-dash-red" },
  ];

  return (
    <div role="region" aria-label="KPIs operacionais" className="animate-slide-up delay-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-5 w-full">
      {kpis.map((kpi, i) => (
        <div key={i} role="status" aria-label={`${kpi.label}: ${kpi.value}`} className="card-base p-5 relative flex flex-col justify-between min-h-[110px]">
          {kpi.trend !== undefined && kpi.trend !== 0 && (
            <span className={`absolute top-3 right-3 text-[10px] font-semibold font-mono-dm tabular-nums ${kpi.trend > 0 ? "text-dash-green" : "text-dash-red"}`}>
              {kpi.trend > 0 ? "↑" : "↓"} {kpi.trend > 0 ? "+" : ""}{kpi.trend}%
            </span>
          )}
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35 mb-2">{kpi.label}</p>
          <div>
            <p className={`font-display text-[40px] font-bold leading-none ${kpi.colorClass}`}>{kpi.value}</p>
            <p className="text-xs text-ink-35 mt-1.5">{kpi.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
