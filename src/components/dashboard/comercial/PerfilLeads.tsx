import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Panel, BarList, Eyebrow } from "../ui/primitives";
import { compactCurrency, SCORE_VAL_COLOR } from "../dashboard-utils";
import type { RegimeMixKey, RegimeMixRow } from "@/lib/regime-mix";
import { cn } from "@/lib/utils";

const COR_REGIME: Record<RegimeMixKey, string> = {
  lucro_real: "#08111d",
  lucro_presumido: "#c6964f",
  simples: "#1c3150",
  nao_informado: "#b8b8b8",
};

interface Props {
  regimeMix: RegimeMixRow[];
  segmentoData: { segmento: string; label: string; count: number }[];
  scoreDistribution: Record<string, number>;
  motor: { tesesAtivas: number; diagnosticos: number };
}

/**
 * Perfil da carteira de leads em um card só (antes eram três): regime ×
 * cobertura do motor, segmento e score. Mesma leitura, um terço da altura.
 */
export function PerfilLeads({ regimeMix, segmentoData, scoreDistribution, motor }: Props) {
  const totalRegime = regimeMix.reduce((s, r) => s + r.leads, 0);
  const semCobertura = regimeMix.filter((r) => r.teses === 0 && r.leads > 0);
  const scores = [
    { key: "A", label: "A — alto potencial" },
    { key: "B", label: "B — médio" },
    { key: "C", label: "C — regular" },
    { key: "D", label: "D — mínimo" },
  ];
  const maxScore = Math.max(...scores.map((s) => scoreDistribution[s.key] ?? 0), 1);

  return (
    <Panel
      eyebrow="Perfil da carteira de leads"
      title="Regime, segmento e qualidade"
      subtitle={`${motor.tesesAtivas} teses ativas no motor · ${motor.diagnosticos} diagnósticos gerados${semCobertura.length ? ` · ${semCobertura.map((r) => r.label).join(" e ")} sem tese que cubra` : ""}`}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <Eyebrow className="mb-3">Regime tributário × cobertura do motor</Eyebrow>
          {totalRegime === 0 ? (
            <p className="text-xs text-ink-35 italic">Sem leads ativos.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-[96px] h-[96px] shrink-0" role="img" aria-label={`Leads por regime: ${regimeMix.map((r) => `${r.label} ${r.leads}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={regimeMix} dataKey="leads" nameKey="label" cx="50%" cy="50%" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                      {regimeMix.map((r) => <Cell key={r.key} fill={COR_REGIME[r.key]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(v: number, _n, item) => [`${v} · ${compactCurrency((item?.payload as RegimeMixRow)?.potencial ?? 0)}`, (item?.payload as RegimeMixRow)?.label ?? ""]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="font-display text-lg font-extrabold text-navy leading-none">{totalRegime}</span>
                </div>
              </div>
              <ul className="flex-1 min-w-0 space-y-1.5">
                {regimeMix.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COR_REGIME[r.key] }} />
                    <span className="flex-1 min-w-0 truncate text-ink-60 font-medium">{r.label}</span>
                    {r.teses !== null && (
                      <span className={cn("shrink-0 rounded px-1.5 py-[1px] text-[9px] font-bold uppercase", r.teses === 0 ? "bg-dash-red/10 text-dash-red" : "bg-gold/15 text-gold-deep")} title={r.teses === 0 ? "Nenhuma tese ativa cobre este regime" : `${r.teses} tese(s) elegíveis`}>
                        {r.teses === 0 ? "sem tese" : `${r.teses} tese${r.teses !== 1 ? "s" : ""}`}
                      </span>
                    )}
                    <span className="w-6 text-right font-mono-dm font-bold tabular-nums text-navy">{r.leads}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div>
          <Eyebrow className="mb-3">Segmento</Eyebrow>
          {segmentoData.length === 0 ? (
            <p className="text-xs text-ink-35 italic">Sem leads ativos.</p>
          ) : (
            <BarList labelWidth={110} rows={segmentoData.slice(0, 6).map((s) => ({ key: s.segmento, label: s.label, value: s.count }))} />
          )}
        </div>
        <div>
          <Eyebrow className="mb-3">Qualidade (score)</Eyebrow>
          <ul className="space-y-2">
            {scores.map((s) => {
              const v = scoreDistribution[s.key] ?? 0;
              return (
                <li key={s.key} className="flex items-center gap-2.5">
                  <span className="w-[112px] shrink-0 text-xs font-medium text-ink-60 truncate">{s.label}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-ink-06 overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max((v / maxScore) * 100, v > 0 ? 3 : 0)}%`, background: SCORE_VAL_COLOR[s.key] }} />
                  </span>
                  <span className="w-6 text-right font-mono-dm text-[11px] font-bold tabular-nums" style={{ color: SCORE_VAL_COLOR[s.key] }}>{v}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
