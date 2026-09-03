interface Props {
  segmentoData: { segmento: string; label: string; count: number }[];
  maxSegCount: number;
}

/**
 * Ranking de leads por segmento. É uma comparação de magnitude de uma única
 * medida (quantidade), então todas as barras usam o mesmo tom — cor por
 * categoria aqui só criaria identidade falsa entre segmentos.
 */
export function SegmentoCard({ segmentoData, maxSegCount }: Props) {
  return (
    <div className="card-base overflow-hidden flex flex-col">
      <div className="px-[18px] pt-3 pb-2.5 border-b border-[rgba(10,21,100,0.10)]">
        <div className="text-[11px] font-bold tracking-[0.8px] uppercase text-navy">Distribuição por segmento</div>
      </div>
      <div className="flex flex-1 flex-col justify-around gap-1 px-[18px] py-3">
        {segmentoData.map((s) => (
          <div key={s.segmento} className="flex items-center gap-2.5">
            <span className="w-[120px] shrink-0 truncate text-xs font-medium text-ink-60" title={s.label}>{s.label}</span>
            <div className="h-1.5 flex-1 min-w-[40px] overflow-hidden rounded-full bg-ink-12">
              <div
                className="h-full rounded-full bg-navy transition-all duration-700"
                style={{ width: `${Math.max((s.count / maxSegCount) * 100, 3)}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono-dm text-[11px] font-semibold tabular-nums text-navy">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
