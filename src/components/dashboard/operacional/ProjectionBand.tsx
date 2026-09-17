import { compactCurrency } from "../dashboard-utils";

interface Props {
  projAnual: number;
  projHonAnual: number;
  prazoSaldo: number;
  honFuturosSaldo: number;
  avgMensal: number;
  opSaldo: number;
  periodLabel: string;
}

export function ProjectionBand({ projAnual, projHonAnual, prazoSaldo, honFuturosSaldo, avgMensal, opSaldo, periodLabel }: Props) {
  const items = [
    { label: "Projeção anual", val: compactCurrency(projAnual), sub: "compensado se ritmo mantido", colorClass: "text-red-300" },
    null,
    { label: "Honorários projetados / ano", val: compactCurrency(projHonAnual), sub: "receita estimada AGF FinTax", colorClass: "text-emerald-300" },
    null,
    { label: "Prazo do saldo atual", val: `${prazoSaldo.toFixed(1)} meses`, sub: "ao ritmo médio atual", colorClass: "text-amber-300" },
    null,
    { label: "Honorários futuros no saldo", val: compactCurrency(honFuturosSaldo), sub: `sobre os ${compactCurrency(opSaldo)} identificados`, colorClass: "text-emerald-300" },
    null,
    { label: "Média mensal realizada", val: compactCurrency(avgMensal), sub: periodLabel, colorClass: "text-white" },
  ];

  return (
    <div className="animate-slide-up delay-2 relative overflow-hidden rounded-2xl px-6 py-3.5 grid grid-cols-[1fr_1px_1fr_1px_1fr_1px_1fr_1px_1fr] mb-3.5 items-center" style={{ background: 'linear-gradient(135deg, #08111d 0%, #1c3150 100%)', boxShadow: '0 8px 32px rgba(8,17,29,0.25)' }}>
      <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-white/10" />
      {items.map((item, i) => {
        if (!item) return <div key={i} className="w-px bg-[rgba(255,255,255,0.12)] self-stretch" />;
        const isFirst = i === 0;
        const isLast = i === 8;
        return (
          <div key={i} className={`px-5 ${isFirst ? "text-left" : isLast ? "text-right" : "text-center"}`}>
            <div className="text-[9px] font-bold tracking-[1.8px] uppercase text-[rgba(255,255,255,0.45)] mb-[5px]">{item.label}</div>
            <div className={`font-display text-[22px] font-bold leading-none ${item.colorClass}`}>{item.val}</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.45)] mt-[3px]">{item.sub}</div>
          </div>
        );
      })}
    </div>
  );
}
