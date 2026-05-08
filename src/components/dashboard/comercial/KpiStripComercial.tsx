import { compactCurrency } from "../dashboard-utils";
import { useCountUp } from "@/hooks/useCountUp";

interface Props {
  comLeads: number;
  comNewWeek: number;
  trendDiff: number;
  comPotencial: number;
  comContratos: number;
  comTaxaConversao: number;
}

export function KpiStripComercial({ comLeads, comNewWeek, trendDiff, comPotencial, comContratos, comTaxaConversao }: Props) {
  const animLeads = useCountUp(comLeads);
  const animNew = useCountUp(comNewWeek);
  const animPotencial = useCountUp(comPotencial);
  const animContratos = useCountUp(comContratos);
  const animConversao = useCountUp(comTaxaConversao);

  const kpis = [
    { label: "Leads no pipeline", value: String(animLeads), sub: "excluindo perdidos", colorClass: "text-navy" },
    { label: "Novos esta semana", value: String(animNew), sub: "leads captados (7d)", colorClass: "text-navy", trend: trendDiff },
    { label: "Potencial total", value: compactCurrency(animPotencial), sub: "soma do potencial máx.", colorClass: "text-dash-red" },
    { label: "Contratos emitidos", value: String(animContratos), sub: "aguardando assinatura", colorClass: "text-dash-amber" },
    { label: "Taxa de conversão", value: `${animConversao}%`, sub: "leads → clientes ativos", colorClass: comTaxaConversao > 50 ? "text-dash-green" : comTaxaConversao >= 20 ? "text-dash-amber" : "text-navy" },
  ];

  return (
    <div role="region" aria-label="KPIs comerciais" className="animate-slide-up delay-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-5 w-full">
      {kpis.map((kpi, i) => (
        <div key={i} role="status" aria-label={`${kpi.label}: ${kpi.value}`} className="card-base p-5 relative flex flex-col justify-between min-h-[110px]">
          {kpi.trend !== undefined && kpi.trend !== 0 && (
            <span className={`absolute top-3 right-3 text-[10px] font-semibold font-mono-dm tabular-nums ${kpi.trend > 0 ? "text-dash-green" : "text-dash-red"}`}>
              {kpi.trend > 0 ? "↑" : "↓"} {kpi.trend > 0 ? "+" : ""}{kpi.trend} vs sem. ant.
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
