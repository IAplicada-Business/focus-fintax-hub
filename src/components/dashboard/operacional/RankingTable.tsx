import type { NavigateFunction } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { compactCurrency, fullCurrency, type ClientRank } from "../dashboard-utils";
import { EmptyState } from "@/components/EmptyState";

interface Props {
  fullRanking: ClientRank[];
  numMonths: number;
  navigate: NavigateFunction;
}

export function RankingTable({ fullRanking, numMonths, navigate }: Props) {
  return (
    <div className="animate-slide-up delay-5 card-base overflow-hidden mb-3.5">
      <div className="px-[18px] pt-3 pb-2.5 border-b border-[rgba(10,21,100,0.10)] flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-[0.8px] uppercase text-navy">Ranking de compensações</div>
          <div className="text-[11px] text-ink-35 mt-0.5">economia bruta acumulada · {numMonths} meses · % do crédito identificado utilizado</div>
        </div>
      </div>
      <table className="w-full border-collapse" aria-label="Ranking de compensações por cliente">
        <thead>
          <tr>
            {["#", "Empresa", "Total compensado", "Honorários", "Economia líquida", "% utilizado", "Progresso", "Saldo restante"].map((h, i) => (
              <th key={i} className={`px-3 py-3 text-[9px] font-bold tracking-[1.4px] uppercase text-ink-35 border-b border-[rgba(10,21,100,0.08)] bg-transparent ${i === 7 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fullRanking.map((c, i) => {
            const pctUsed = c.identificado > 0 ? Math.round((c.compensado / c.identificado) * 100) : 0;
            const econLiquida = c.compensado - c.honorarios;
            return (
              <tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)} className={`cursor-pointer transition-colors duration-100 hover:bg-[rgba(10,21,100,0.025)] ${i % 2 === 0 ? "bg-[rgba(10,21,100,0.012)]" : ""}`}>
                <td className="px-3 py-2 text-[10px] text-ink-35 font-mono-dm tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 text-xs font-semibold text-ink max-w-[170px] overflow-hidden text-ellipsis whitespace-nowrap">{c.empresa}</td>
                <td className="px-3 py-2 font-mono-dm tabular-nums font-bold text-dash-green text-xs">{fullCurrency(c.compensado)}</td>
                <td className="px-3 py-2 font-mono-dm tabular-nums font-normal text-ink-35 text-[10px]">{fullCurrency(c.honorarios)}</td>
                <td className="px-3 py-2 font-mono-dm tabular-nums font-semibold text-navy text-[11px]">{fullCurrency(econLiquida)}</td>
                <td className="px-3 py-2 font-mono-dm tabular-nums font-normal text-ink-35 text-[10px]">{pctUsed}%</td>
                <td className="px-3 py-2">
                  <span className="w-[50px] h-1 bg-ink-12 rounded-sm overflow-hidden inline-block">
                    <span className="h-full rounded-sm bg-dash-green block" style={{ width: `${Math.min(pctUsed, 100)}%` }} />
                  </span>
                </td>
                <td className={`px-3 py-2 text-right font-mono-dm tabular-nums font-bold text-xs ${c.saldo > 500000 ? "text-dash-red" : "text-ink-35"}`}>
                  {c.saldo > 0 ? compactCurrency(c.saldo) : fullCurrency(0)}
                </td>
              </tr>
            );
          })}
          {fullRanking.length === 0 && (
            <tr><td colSpan={8}><EmptyState icon={<BarChart3 size={20} className="text-ink-35" />} title="Nenhuma compensação registrada" subtitle="Os dados aparecerão aqui conforme compensações forem lançadas." /></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
