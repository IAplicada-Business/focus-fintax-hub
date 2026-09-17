import { SCORE_VAL_COLOR } from "../dashboard-utils";

interface Props {
  scoreDistribution: Record<string, number>;
}

export function QualidadeCarteira({ scoreDistribution }: Props) {
  return (
    <div className="card-base overflow-hidden">
      <div className="px-[18px] pt-3 pb-2.5 border-b border-[rgba(8,17,29,0.10)]">
        <div className="text-[11px] font-bold tracking-[0.8px] uppercase text-navy">Qualidade da carteira</div>
      </div>
      <div className="px-3.5 py-2">
        {[
          { key: "A", label: "Score A — alto potencial", dotColor: "#c8001e" },
          { key: "B", label: "Score B — médio", dotColor: "#b45309" },
          { key: "C", label: "Score C — regular", dotColor: "#ca8a04" },
          { key: "D", label: "Score D — mínimo", dotColor: "rgba(15,17,23,0.25)" },
        ].map(s => (
          <div key={s.key} className="flex items-center justify-between py-[7px] border-b border-[rgba(0,0,0,0.04)]">
            <span className="text-xs font-medium text-ink-60 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dotColor }} />
              {s.label}
            </span>
            <span className="font-display text-lg font-bold" style={{ color: SCORE_VAL_COLOR[s.key] }}>{scoreDistribution[s.key] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
