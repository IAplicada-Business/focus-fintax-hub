import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Panel, CountChip } from "../ui/primitives";
import type { PontoSemanal } from "@/lib/comercial-analytics";

const AXIS_TICK = { fontSize: 10, fill: "var(--ink-35)", fontFamily: "'DM Mono', monospace", fontWeight: 500 };

interface Props {
  serie: PontoSemanal[];
  projecao: PontoSemanal[];
  ritmoNovos: number;
  ritmoContratos: number;
}

interface TooltipItem {
  payload?: PontoSemanal & { novosProj?: number; contratosProj?: number };
}

function Tip({ active, payload }: { active?: boolean; payload?: TooltipItem[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const proj = p.projecao;
  return (
    <div className="rounded-lg border border-ink-12 bg-white px-3 py-2.5 shadow-lg text-[11px] min-w-[170px]">
      <p className="font-bold text-navy mb-1.5">
        Semana de {p.label} {proj && <span className="text-gold-deep font-semibold">· projeção</span>}
      </p>
      <div className="space-y-1 font-mono-dm tabular-nums">
        <Row label="Novos leads" value={String(proj ? p.novosProj ?? 0 : p.novos)} />
        <Row label="Contratos emitidos" value={String(proj ? p.contratosProj ?? 0 : p.contratos)} cls="text-dash-amber" />
        {!proj && <Row label="Clientes ativados" value={String(p.clientes)} cls="text-dash-green" />}
      </div>
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-35 font-sans">{label}</span>
      <span className={cls ?? "text-navy"}>{value}</span>
    </div>
  );
}

/**
 * Novos leads por semana (barras) com contratos e clientes (linhas) e as
 * próximas semanas projetadas em tom dourado tracejado.
 */
export function EvolucaoLeadsChart({ serie, projecao, ritmoNovos, ritmoContratos }: Props) {
  const dados = [
    ...serie.map((p) => ({ ...p, novosProj: null as number | null, contratosProj: null as number | null })),
    ...projecao.map((p) => ({ ...p, novos: 0, contratos: 0, novosProj: p.novos, contratosProj: p.contratos })),
  ];
  const temDados = serie.some((p) => p.novos > 0 || p.contratos > 0 || p.clientes > 0);
  const ultimaReal = serie[serie.length - 1]?.label;

  return (
    <Panel
      eyebrow="Evolução"
      title="Entrada de leads e fechamentos por semana"
      subtitle={`Últimas ${serie.length} semanas · próximas ${projecao.length} projetadas por tendência linear`}
      action={
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-35">ritmo</span>
          <CountChip tom="navy">{ritmoNovos} leads/sem</CountChip>
          <CountChip tom="amber">{ritmoContratos} contratos/sem</CountChip>
        </div>
      }
      flush
    >
      {!temDados ? (
        <EmptyState icon={<TrendingUp size={20} className="text-ink-35" />} title="Ainda sem leads no período" subtitle="A evolução aparece conforme os leads entram." />
      ) : (
        <>
          <div className="px-3 pt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dados} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
                <defs>
                  <linearGradient id="novosGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#08111d" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#1c3150" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-12)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <RechartsTooltip content={<Tip />} cursor={{ fill: "rgba(8,17,29,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconSize={8} />
                {ultimaReal && <ReferenceLine x={ultimaReal} stroke="rgba(198,150,79,0.6)" strokeDasharray="4 4" />}
                <Bar dataKey="novos" name="Novos leads" fill="url(#novosGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="novosProj" name="Novos (projeção)" fill="rgba(198,150,79,0.35)" stroke="#c6964f" strokeDasharray="3 3" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Area type="monotone" dataKey="clientes" name="Clientes ativados" stroke="var(--dash-green)" fill="rgba(15,123,78,0.08)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="contratos" name="Contratos emitidos" stroke="var(--dash-amber)" strokeWidth={2} dot={{ r: 3, fill: "var(--dash-amber)", strokeWidth: 0 }} />
                <Line type="monotone" dataKey="contratosProj" name="Contratos (projeção)" stroke="#c6964f" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: "#c6964f", strokeWidth: 0 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Panel>
  );
}
