import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Panel, CountChip } from "../ui/primitives";
import { compactCurrency, fullCurrency } from "../dashboard-utils";
import type { PontoMensal } from "@/lib/operacional-analytics";

const AXIS_TICK = { fontSize: 10, fill: "var(--ink-35)", fontFamily: "'DM Mono', monospace", fontWeight: 500 };

interface Props {
  serie: PontoMensal[];
  projecao: PontoMensal[];
  variacaoPct: number | null;
  mediaMensal: number;
}

type Linha = PontoMensal & { compProj: number | null; honProj: number | null };

function Tip({ active, payload }: { active?: boolean; payload?: { payload?: Linha }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-ink-12 bg-white px-3 py-2.5 shadow-lg text-[11px] min-w-[180px]">
      <p className="font-bold text-navy mb-1.5">
        {p.label} {p.projecao && <span className="text-gold-deep font-semibold">· projeção</span>}
      </p>
      <div className="space-y-1 font-mono-dm tabular-nums">
        <div className="flex justify-between gap-4"><span className="text-ink-35 font-sans">Compensado</span><span className="text-navy">{fullCurrency(p.projecao ? p.compProj ?? 0 : p.compensado)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-ink-35 font-sans">Honorários</span><span className="text-gold-deep">{fullCurrency(p.projecao ? p.honProj ?? 0 : p.honorarios)}</span></div>
      </div>
    </div>
  );
}

/** Compensado × honorários por mês, com os próximos meses projetados em dourado tracejado. */
export function EvolucaoMensalChart({ serie, projecao, variacaoPct, mediaMensal }: Props) {
  const dados: Linha[] = [
    ...serie.map((p) => ({ ...p, compProj: null as number | null, honProj: null as number | null })),
    ...projecao.map((p) => ({ ...p, compensado: 0, honorarios: 0, compProj: p.compensado, honProj: p.honorarios })),
  ];
  const temDados = serie.some((p) => p.compensado > 0);
  const ultimo = serie[serie.length - 1]?.label;
  return (
    <Panel
      eyebrow="Evolução"
      title="Compensações e honorários por mês"
      subtitle={`Últimos ${serie.length} meses · próximos ${projecao.length} projetados pela tendência dos meses fechados`}
      action={
        <div className="flex items-center gap-2">
          {variacaoPct != null && <CountChip tom={variacaoPct >= 0 ? "green" : "red"}>{variacaoPct > 0 ? "+" : ""}{variacaoPct}% vs mês ant.</CountChip>}
          <CountChip tom="navy">média {compactCurrency(mediaMensal)}/mês</CountChip>
        </div>
      }
      flush
    >
      {!temDados ? (
        <EmptyState icon={<TrendingUp size={20} className="text-ink-35" />} title="Nenhuma compensação registrada" subtitle="O gráfico aparece conforme as compensações forem lançadas." />
      ) : (
        <div className="px-3 pt-4 pb-1 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
              <defs>
                <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#08111d" />
                  <stop offset="100%" stopColor="#1c3150" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-12)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => compactCurrency(v)} />
              <RechartsTooltip content={<Tip />} cursor={{ fill: "rgba(8,17,29,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconSize={8} />
              {ultimo && <ReferenceLine x={ultimo} stroke="rgba(198,150,79,0.6)" strokeDasharray="4 4" />}
              <Bar dataKey="compensado" name="Compensado" fill="url(#compGrad)" radius={[4, 4, 0, 0]} maxBarSize={30} />
              <Bar dataKey="compProj" name="Compensado (projeção)" fill="rgba(198,150,79,0.30)" stroke="#c6964f" strokeDasharray="3 3" radius={[4, 4, 0, 0]} maxBarSize={30} />
              <Line type="monotone" dataKey="honorarios" name="Honorários AGF" stroke="#c6964f" strokeWidth={2} dot={{ r: 3, fill: "#c6964f", strokeWidth: 0 }} />
              <Line type="monotone" dataKey="honProj" name="Honorários (projeção)" stroke="#a67a38" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: "#a67a38", strokeWidth: 0 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
