import { useState } from "react";
import { FunnelRow, compactCurrency } from "../dashboard-utils";
import type { NavigateFunction } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  funnelData: FunnelRow[];
  maxFunnelCount: number;
  totalFunnelCount: number;
  totalFunnelPotencial: number;
  navigate: NavigateFunction;
}

export function FunilComercial({ funnelData, maxFunnelCount, totalFunnelCount, totalFunnelPotencial, navigate }: Props) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  return (
    <div className="card-base overflow-hidden h-full flex flex-col">
        <div className="px-5 pt-3 pb-2.5 border-b border-[rgba(10,21,100,0.06)] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold tracking-[0.8px] uppercase text-navy">Funil comercial</div>
            <div className="text-[11px] text-ink-35 mt-0.5">clique em uma etapa para filtrar o pipeline</div>
          </div>
        </div>

        {funnelData.map((f) => {
          const isContrato = f.stage === "contrato_emitido" && f.count > 0;
          const isCliente = f.stage === "cliente_ativo";

          return (
            <div
              key={f.stage}
              onClick={() => navigate(f.stage === "cliente_ativo" ? "/clientes" : `/pipeline?etapa=${f.stage}`)}
              className={cn(
                "flex items-center px-5 py-3 cursor-pointer transition-colors duration-150",
                isContrato
                  ? hoveredRow === f.stage ? "bg-[rgba(251,191,36,0.12)]" : "bg-[rgba(251,191,36,0.06)]"
                  : hoveredRow === f.stage ? "bg-[rgba(10,21,100,0.03)]" : "bg-transparent"
              )}
              onMouseEnter={() => setHoveredRow(f.stage)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              <div className="w-1 h-6 rounded-full flex-shrink-0 mr-4" style={{ background: f.color }} />
              <span className={cn(
                "min-w-0 truncate text-sm pr-3 w-[170px] shrink-0",
                isContrato ? "font-bold text-[#b45309]" : isCliente ? "font-semibold text-[#0f7b4e]" : "font-medium text-ink"
              )}>{f.label}</span>
              <span className={cn(
                "font-mono-dm tabular-nums text-[15px] font-bold flex-shrink-0 w-9 text-right",
                isContrato ? "text-[#b45309]" : isCliente ? "text-[#0f7b4e]" : "text-navy"
              )}>{f.count}</span>
              <span className={cn(
                "font-mono-dm tabular-nums text-[11px] font-semibold flex-shrink-0 w-[112px] text-right whitespace-nowrap pl-2 pr-3",
                isContrato ? "text-[#b45309]" : "text-[#0f7b4e]"
              )}>{f.potencial > 0 ? compactCurrency(f.potencial) : "—"}</span>
              <div className="flex-1 min-w-[60px]">
                <div className="h-1.5 bg-[rgba(15,17,23,0.08)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ background: f.color, width: `${(f.count / maxFunnelCount) * 100}%` }} />
                </div>
              </div>
              <span className={cn(
                "flex-shrink-0 w-[22px] text-right text-[10px] ml-2",
                isContrato ? "text-[#b45309] font-bold" : "text-[rgba(15,17,23,0.3)]"
              )}>
                {isContrato ? "!" : "→"}
              </span>
            </div>
          );
        })}

        {/* Total row */}
        <div className="mt-auto flex items-center px-5 py-3 bg-[rgba(10,21,100,0.03)] border-t-2 border-[rgba(10,21,100,0.08)]">
          <span className="text-[10px] font-bold tracking-[1px] uppercase text-ink-35 flex-1 min-w-0 pl-5">Total do pipeline</span>
          <span className="font-display text-[18px] font-bold text-navy w-9 text-right shrink-0">{totalFunnelCount}</span>
          <span className="font-mono-dm tabular-nums text-[13px] font-bold text-dash-green w-[112px] text-right whitespace-nowrap shrink-0 pl-2 pr-3">{compactCurrency(totalFunnelPotencial)}</span>
          <div className="flex-1 min-w-[60px]" />
          <div className="w-[22px]" />
        </div>
    </div>
  );
}
