import { compactCurrency } from "../dashboard-utils";
import { AlertTriangle } from "lucide-react";

interface DistBand {
  label: string;
  count: number;
  total: number;
  color: string;
  fontWeight: number;
}

interface Props {
  opClientes: number;
  distBands: DistBand[];
  maxDistCount: number;
  prazoSaldo: number;
  honFuturosSaldo: number;
  opSaldo: number;
  taxaHon: number;
}

export function DistribuicaoSaldo({ opClientes, distBands, maxDistCount, prazoSaldo, honFuturosSaldo, opSaldo, taxaHon }: Props) {
  return (
    <div className="card-base overflow-hidden flex flex-col">
      <div className="px-[18px] pt-3 pb-2.5 border-b border-[rgba(8,17,29,0.10)]">
        <div className="text-[11px] font-bold tracking-[0.8px] uppercase text-navy">Distribuição do saldo</div>
        <div className="text-[11px] text-ink-35 mt-0.5">{opClientes} clientes · por faixa de saldo restante</div>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        {distBands.map((d, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="text-[11px] w-[110px] shrink-0" style={{ fontWeight: d.fontWeight, color: d.color }}>{d.label}</span>
            <div className="flex-1 h-1.5 bg-ink-12 rounded-[3px] overflow-hidden">
              <div className="h-full rounded-[3px]" style={{ background: d.color, width: `${(d.count / maxDistCount) * 100}%` }} />
            </div>
            <span className="font-mono-dm tabular-nums text-[11px] font-bold w-5 text-right shrink-0" style={{ color: d.color }}>{d.count}</span>
            <span className="font-mono-dm tabular-nums text-[10px] w-[52px] text-right shrink-0" style={{ color: d.total > 0 ? d.color : "var(--ink-35)" }}>{d.total > 0 ? compactCurrency(d.total) : "—"}</span>
          </div>
        ))}
      </div>

      {/* Strategic callout */}
      {prazoSaldo > 0 && prazoSaldo < 9 && (
        <div className="mx-3.5 mb-3.5 bg-[rgba(200,0,30,0.04)] border border-[rgba(200,0,30,0.15)] rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-bold tracking-[1px] uppercase text-dash-red mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Atenção estratégica</div>
          <div className="text-[11px] text-ink-60 leading-[1.5]">
            Ao ritmo atual, o saldo identificado se esgota em <strong className="text-dash-red">{prazoSaldo.toFixed(1)} meses</strong>. Para manter a receita, é preciso onboardar novos clientes ou levantar novas teses para a carteira atual.
          </div>
        </div>
      )}

      {/* Honorários futuros */}
      <div className="border-t border-[rgba(8,17,29,0.10)] px-3.5 py-2.5 flex justify-between items-center bg-[rgba(15,123,78,0.10)] mt-auto">
        <div>
          <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-dash-green">Honorários futuros estimados</div>
          <div className="text-[10px] text-ink-60 mt-0.5">sobre o saldo restante · taxa {(taxaHon * 100).toFixed(1)}%</div>
        </div>
        <div className="font-display text-[22px] font-bold text-dash-green">{compactCurrency(honFuturosSaldo)}</div>
      </div>
    </div>
  );
}
