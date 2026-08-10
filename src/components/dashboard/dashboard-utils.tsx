import React from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { SEGMENTO_LABELS, getScoreLabel, daysSince } from "@/lib/pipeline-constants";

/* ─── helpers ─── */
export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export const compactCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);

export const fullCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function timeAgo(date: string) {
  const d = daysSince(date);
  if (d === 0) return "Hoje";
  if (d === 1) return "Ontem";
  return `há ${d} dias`;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", pmo: "PMO", gestor_tributario: "Gestor Tributário", comercial: "Comercial", cliente: "Cliente",
};

export const MONTH_ABBR: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun",
  "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

export const SEGMENTO_CHIP: Record<string, { bg: string; color: string }> = {
  supermercado: { bg: "#eff6ff", color: "#1d4ed8" },
  farmacia: { bg: "#f0fdf4", color: "#15803d" },
  pet: { bg: "#fff7ed", color: "#c2410c" },
  materiais_construcao: { bg: "#f5f5f4", color: "#44403c" },
  outros: { bg: "#f3f4f6", color: "#6b7280" },
};

export const SEGMENTO_BAR_COLOR: Record<string, string> = {
  supermercado: "#1d4ed8",
  farmacia: "#15803d",
  pet: "#c2410c",
  materiais_construcao: "#44403c",
  outros: "#6b7280",
};

export const SCORE_CHIP: Record<string, { bg: string; color: string }> = {
  A: { bg: "#fef2f2", color: "#991b1b" },
  B: { bg: "#fff7ed", color: "#92400e" },
  C: { bg: "#fefce8", color: "#713f12" },
  D: { bg: "#f3f4f6", color: "#9ca3af" },
};

export const SCORE_VAL_COLOR: Record<string, string> = {
  A: "var(--dash-red)",
  B: "var(--dash-amber)",
  C: "var(--ink-60)",
  D: "var(--ink-35)",
};

export const FUNNEL_STAGES_COM = [
  { value: "novo", label: "Prospecção / Novo", color: "#6366f1" },
  { value: "qualificado", label: "Qualificado", color: "#3b82f6" },
  { value: "levantamento_teses", label: "Levantamento de Teses", color: "#0ea5e9" },
  { value: "em_apresentacao", label: "Apresentação", color: "#06b6d4" },
  { value: "contrato_emitido", label: "Contrato Emitido", color: "var(--dash-amber)" },
  { value: "cliente_ativo", label: "Cliente Ativo", color: "var(--dash-green)" },
];

export const ORIGEM_LABELS: Record<string, string> = {
  formulario: "Formulário LP",
  manual: "Manual",
  meta_ads: "Meta Ads",
};

/* ─── types ─── */
export interface FunnelRow { stage: string; label: string; count: number; potencial: number; color: string }
export interface RecentLead { id: string; empresa: string; segmento: string; criado_em: string; potencial: number; score: number | null }
export interface MonthBar { month: string; label: string; valor: number; honorarios: number; isProjection?: boolean }
export interface ClientRank { id: string; empresa: string; compensado: number; saldo: number; identificado: number; honorarios: number }

/* ─── Shared font style objects (kept for Recharts tick props that need style objects) ─── */
export const fontMono: React.CSSProperties = { fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums" };
export const fontCondensed: React.CSSProperties = { fontFamily: "'Barlow Condensed', sans-serif" };
export const fontBarlow: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };

/* ─── KpiBox ─── */
export function KpiBox({ label, value, sub, colorClass, trend, last, rawValue }: { label: string; value: string; sub: string; colorClass?: string; trend?: number; last?: boolean; rawValue?: number }) {
  const colorMap: Record<string, string> = { red: "text-dash-red", green: "text-dash-green", amber: "text-dash-amber" };
  const valColorClass = colorClass ? colorMap[colorClass] ?? "text-navy" : "text-navy";
  const animatedNum = useCountUp(rawValue ?? 0);
  const displayValue = rawValue !== undefined ? String(animatedNum) : value;
  return (
    <div className={`px-5 py-4 ${last ? "" : "border-r border-[rgba(10,21,100,0.10)]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-[7px]">
        <div className="text-[10px] font-semibold tracking-[1.4px] uppercase text-ink-35">{label}</div>
        {trend !== undefined && trend !== 0 && (
          <span className={`shrink-0 whitespace-nowrap text-[10px] font-semibold font-mono-dm tabular-nums ${trend > 0 ? "text-dash-green" : "text-dash-red"}`}>
            {trend > 0 ? "↑" : "↓"} {trend > 0 ? "+" : ""}{trend} vs sem. ant.
          </span>
        )}
      </div>
      <div className={`font-display text-[26px] font-bold leading-none ${valColorClass}`}>{displayValue}</div>
      <div className="text-[11px] text-ink-35 mt-1">{sub}</div>
    </div>
  );
}

// Re-export for components
export { SEGMENTO_LABELS, getScoreLabel };
