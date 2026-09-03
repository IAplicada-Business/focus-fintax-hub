import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { compactCurrency } from "../dashboard-utils";
import type { RegimeMixKey, RegimeMixRow } from "@/lib/regime-mix";

interface Props {
  regimeMix: RegimeMixRow[];
}

/**
 * Cor segue a entidade (regime), nunca a posição — paleta categórica validada
 * (scripts/validate_palette.js: lightness, chroma, CVD e normal-vision ok).
 */
const COR: Record<RegimeMixKey, string> = {
  lucro_real: "#2a78d6",
  lucro_presumido: "#eb6834",
  simples: "#1baf7a",
  nao_informado: "#eda100",
};

/**
 * Card lateral do Dashboard comercial: mix de leads por regime tributário e
 * quantas teses ativas do motor cobrem cada regime. Regime com lead e zero
 * tese = pipeline sem produto pra vender — é o alerta que o comercial precisa.
 */
export function MixRegime({ regimeMix }: Props) {
  const total = regimeMix.reduce((s, r) => s + r.leads, 0);
  const semCobertura = regimeMix.filter((r) => r.teses === 0 && r.leads > 0);

  return (
    <div className="card-base overflow-hidden">
      <div className="px-[18px] pt-3 pb-2.5 border-b border-[rgba(10,21,100,0.10)]">
        <div className="text-[11px] font-bold tracking-[0.8px] uppercase text-navy">Mix por regime tributário</div>
        <div className="text-[11px] text-ink-35 mt-0.5">leads ativos · teses do motor que cobrem cada regime</div>
      </div>

      {total === 0 ? (
        <EmptyState icon={<PieIcon size={20} className="text-ink-35" />} title="Sem leads ativos" subtitle="O mix aparece conforme os leads entram." />
      ) : (
        <div className="px-3.5 py-3">
          <div className="relative h-[150px]" role="img" aria-label={`Leads por regime: ${regimeMix.map((r) => `${r.label} ${r.leads}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={regimeMix}
                  dataKey="leads"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={66}
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {regimeMix.map((r) => (
                    <Cell key={r.key} fill={COR[r.key]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(v: number, _n, item) => {
                    const row = item?.payload as RegimeMixRow | undefined;
                    const pct = total > 0 ? Math.round((Number(v) / total) * 100) : 0;
                    return [`${v} lead${Number(v) !== 1 ? "s" : ""} · ${pct}%${row ? ` · ${compactCurrency(row.potencial)}` : ""}`, row?.label ?? ""];
                  }}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgba(10,21,100,0.10)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-2xl font-bold leading-none text-navy">{total}</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.8px] text-ink-35 mt-0.5">leads</span>
            </div>
          </div>

          <ul className="mt-1 divide-y divide-[rgba(0,0,0,0.04)]">
            {regimeMix.map((r) => {
              const pct = total > 0 ? Math.round((r.leads / total) * 100) : 0;
              const semTese = r.teses === 0;
              return (
                <li key={r.key} className="flex items-center gap-2 py-[7px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR[r.key] }} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-60">{r.label}</span>
                  {r.teses !== null && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.4px] ${
                        semTese ? "bg-[rgba(200,0,30,0.10)] text-dash-red" : "bg-[rgba(10,21,100,0.06)] text-navy"
                      }`}
                      title={semTese ? "Nenhuma tese ativa no motor cobre este regime" : `${r.teses} tese(s) ativa(s) elegíveis`}
                    >
                      {semTese ? "sem tese" : `${r.teses} tese${r.teses !== 1 ? "s" : ""}`}
                    </span>
                  )}
                  <span className="w-[70px] shrink-0 text-right font-mono-dm text-[11px] tabular-nums text-ink-35">{compactCurrency(r.potencial)}</span>
                  <span className="w-[52px] shrink-0 text-right font-mono-dm text-xs font-bold tabular-nums text-navy">
                    {r.leads} <span className="text-[10px] font-medium text-ink-35">· {pct}%</span>
                  </span>
                </li>
              );
            })}
          </ul>

          {semCobertura.length > 0 && (
            <p className="mt-2 text-[10px] leading-snug text-ink-35">
              {semCobertura.map((r) => r.label).join(" e ")}: lead entra mas nenhuma tese ativa cobre o regime — ajuste em Configurações › Motor de Cálculo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
