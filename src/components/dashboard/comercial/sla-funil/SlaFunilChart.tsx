import type { ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import type { EtapaFunil, EtapaFunilResumo, PontoGraficoSla } from "@/lib/pipeline-sla";

const AXIS_TICK = { fontSize: 10, fill: "var(--ink-35)", fontFamily: "'DM Mono', monospace", fontWeight: 500 };

interface TooltipPayloadItem {
  payload?: PontoGraficoSla;
}

function SlaTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-[rgba(10,21,100,0.12)] bg-white px-3 py-2.5 shadow-lg text-[11px] min-w-[190px]">
      <p className="font-bold text-navy mb-1.5">{p.label}</p>
      <div className="space-y-1 font-mono-dm tabular-nums">
        <Row label="Tempo médio parado" value={`${p.media}d`} className={p.acimaDaMeta ? "text-dash-red font-semibold" : "text-navy"} />
        <Row label="Lead mais parado" value={`${p.maximo}d`} className="text-ink-60" />
        <Row label="Meta" value={p.meta != null ? `${p.meta}d` : "sem meta"} className="text-dash-amber" />
        <div className="border-t border-[rgba(10,21,100,0.08)] my-1" />
        <Row label="Leads na etapa" value={String(p.leads)} className="text-ink-60" />
        <Row label="Atrasados" value={String(p.atrasados)} className={p.atrasados > 0 ? "text-dash-red font-semibold" : "text-ink-60"} />
        <Row label="Atraso acumulado" value={`${p.atrasoAcumulado}d`} className={p.atrasoAcumulado > 0 ? "text-dash-red" : "text-ink-60"} />
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-35 font-sans">{label}</span>
      <span className={className}>{value}</span>
    </div>
  );
}

interface Props {
  serie: PontoGraficoSla[];
  etapas: EtapaFunilResumo[];
  etapaAtiva: EtapaFunil | null;
  podeEditarMeta: boolean;
  salvandoMeta: boolean;
  onSelecionarEtapa: (etapa: EtapaFunil) => void;
  onSalvarMeta: (etapa: EtapaFunil, raw: string, atual: number | null) => void;
}

/**
 * Barras (tempo médio e lead mais parado, em dias) + linha da meta por etapa.
 * Abaixo, a régua de metas — editável inline por admin/PMO — que também filtra a tabela.
 */
export function SlaFunilChart({ serie, etapas, etapaAtiva, podeEditarMeta, salvandoMeta, onSelecionarEtapa, onSalvarMeta }: Props) {
  const temLeads = serie.some((p) => p.leads > 0);
  const etapasAcima = serie.filter((p) => p.acimaDaMeta).length;

  return (
    <div className="card-base overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-[rgba(10,21,100,0.10)] flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">SLA por etapa do funil</p>
          <h3 className="font-display text-lg font-bold text-navy mt-0.5">Tempo parado vs meta</h3>
          <p className="text-xs text-ink-35 mt-1">
            Barras em dias por etapa; a linha é a meta. Barra vermelha = média acima da meta.
          </p>
        </div>
        {etapasAcima > 0 ? (
          <span className="inline-flex items-center gap-1.5 shrink-0 rounded-md bg-[rgba(200,0,30,0.08)] border border-[rgba(200,0,30,0.2)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-dash-red">
            <AlertTriangle className="w-3 h-3" />
            {etapasAcima} etapa{etapasAcima > 1 ? "s" : ""} acima da meta
          </span>
        ) : (
          <span className="inline-flex items-center shrink-0 rounded-md bg-[rgba(15,123,78,0.08)] border border-[rgba(15,123,78,0.2)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-dash-green">
            Todas dentro da meta
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
      <div className="px-3 pt-4 h-[260px] min-w-[560px]">
        {temLeads ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 18, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-12)" vertical={false} />
              <XAxis dataKey="labelCurto" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={38}
                allowDecimals={false}
                tickFormatter={(v: number) => `${v}d`}
              />
              <RechartsTooltip content={<SlaTooltip />} cursor={{ fill: "rgba(10,21,100,0.04)" }} />
              <Bar dataKey="media" name="Tempo médio parado" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {serie.map((p) => (
                  <Cell key={p.etapa} fill={p.acimaDaMeta ? "var(--dash-red)" : "var(--navy)"} opacity={etapaAtiva && etapaAtiva !== p.etapa ? 0.35 : 1} />
                ))}
                <LabelList
                  dataKey="media"
                  position="top"
                  style={{ fontSize: 10, fill: "var(--ink-60)", fontFamily: "'DM Mono', monospace" }}
                  formatter={(v: number) => (v > 0 ? `${v}d` : "")}
                />
              </Bar>
              <Bar dataKey="maximo" name="Lead mais parado" fill="rgba(10,21,100,0.22)" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {serie.map((p) => (
                  <Cell key={p.etapa} fill="rgba(10,21,100,0.22)" opacity={etapaAtiva && etapaAtiva !== p.etapa ? 0.4 : 1} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="meta"
                name="Meta"
                stroke="var(--dash-amber)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3.5, fill: "var(--dash-amber)", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-ink-35">Nenhum lead em andamento no funil.</div>
        )}
      </div>
      </div>

      <div className="flex flex-wrap gap-4 px-5 py-2.5">
        <LegendItem swatch={<div className="w-2.5 h-2.5 rounded-sm bg-navy" />} label="Tempo médio parado" />
        <LegendItem swatch={<div className="w-2.5 h-2.5 rounded-sm bg-dash-red" />} label="Média acima da meta" />
        <LegendItem swatch={<div className="w-2.5 h-2.5 rounded-sm bg-[rgba(10,21,100,0.22)]" />} label="Lead mais parado" />
        <LegendItem swatch={<div className="w-4 h-0 border-t-2 border-dashed border-dash-amber" />} label="Meta (dias)" />
      </div>

      {/* Régua de metas: filtra a tabela e edita a meta inline. */}
      <div className="border-t border-[rgba(10,21,100,0.10)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {etapas.map((e, i) => {
          const ativa = etapaAtiva === e.etapa;
          const acima = e.sla != null && e.diasMedios != null && e.diasMedios > e.sla;
          return (
            <div
              key={e.etapa}
              className={`px-4 py-3 transition-colors ${i < etapas.length - 1 ? "lg:border-r border-[rgba(10,21,100,0.08)]" : ""} ${
                ativa ? "bg-[rgba(10,21,100,0.05)]" : "bg-white"
              }`}
            >
              <button type="button" onClick={() => onSelecionarEtapa(e.etapa)} className="w-full text-left group">
                <p className={`text-[10px] font-bold uppercase tracking-[0.8px] leading-tight truncate ${ativa ? "text-navy" : "text-ink-35 group-hover:text-navy"}`}>
                  {e.label}
                </p>
                <p className="text-[11px] mt-1 font-mono-dm tabular-nums">
                  <span className="text-navy font-semibold">{e.leads}</span>
                  <span className="text-ink-35"> lead{e.leads !== 1 ? "s" : ""}</span>
                  {e.atrasados > 0 && <span className="text-dash-red font-semibold"> · {e.atrasados} atrasado{e.atrasados > 1 ? "s" : ""}</span>}
                </p>
              </button>
              <label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-35">
                <span className={acima ? "text-dash-red font-semibold" : undefined}>
                  {e.diasMedios != null ? `${e.diasMedios}d méd.` : "—"}
                </span>
                <span className="flex items-center gap-1">
                  meta
                  {podeEditarMeta ? (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={e.sla ?? ""}
                      placeholder="—"
                      disabled={salvandoMeta}
                      onBlur={(ev) => onSalvarMeta(e.etapa, ev.target.value, e.sla)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                      }}
                      className="h-6 w-14 rounded border border-[rgba(10,21,100,0.15)] bg-white px-1.5 text-right font-mono-dm text-[11px] tabular-nums text-navy focus:outline-none focus:ring-1 focus:ring-navy/40 disabled:opacity-60"
                      aria-label={`Meta em dias para ${e.label}`}
                    />
                  ) : (
                    <span className="font-mono-dm tabular-nums text-navy">{e.sla != null ? `${e.sla}d` : "sem meta"}</span>
                  )}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-ink-60">
      {swatch}
      {label}
    </div>
  );
}
