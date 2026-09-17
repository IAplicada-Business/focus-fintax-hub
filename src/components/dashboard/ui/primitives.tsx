import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";

/**
 * Primitivos visuais dos dashboards (linguagem AGF interna): cards brancos
 * arredondados sobre o off-white, títulos em navy, dourado como acento e
 * painéis escuros para projeções. Tudo que é número grande passa por aqui
 * para que KPIs, faixas e tabelas tenham a mesma métrica visual.
 */

export type Tom = "navy" | "gold" | "green" | "red" | "amber" | "muted";

export const TOM_TEXT: Record<Tom, string> = {
  navy: "text-navy",
  gold: "text-gold-deep",
  green: "text-dash-green",
  red: "text-dash-red",
  amber: "text-dash-amber",
  muted: "text-ink-35",
};

export const TOM_BG: Record<Tom, string> = {
  navy: "bg-navy",
  gold: "bg-gold",
  green: "bg-dash-green",
  red: "bg-dash-red",
  amber: "bg-dash-amber",
  muted: "bg-ink-35",
};

export function Eyebrow({ children, className, tom = "muted" }: { children: ReactNode; className?: string; tom?: Tom | "white" }) {
  const color = tom === "white" ? "text-white/50" : tom === "muted" ? "text-ink-35" : TOM_TEXT[tom];
  return (
    <p className={cn("text-[10px] font-bold uppercase tracking-[1.6px]", color, className)}>{children}</p>
  );
}

/** Seta de tendência com sinal; `suffix` = "%" ou " vs sem. ant.". */
export function TrendBadge({ value, suffix = "", invert = false, className }: { value: number; suffix?: string; invert?: boolean; className?: string }) {
  if (!Number.isFinite(value) || value === 0) return null;
  const positivo = invert ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap text-[10px] font-semibold font-mono-dm tabular-nums",
        positivo ? "text-dash-green" : "text-dash-red",
        className,
      )}
    >
      {value > 0 ? "↑ +" : "↓ "}
      {value}
      {suffix}
    </span>
  );
}

interface KpiCardProps {
  label: string;
  /** Valor já formatado (usado quando `raw` não é informado). */
  value?: string;
  /** Valor numérico animado com count-up; `format` converte para texto. */
  raw?: number;
  format?: (n: number) => string;
  sub?: ReactNode;
  tom?: Tom;
  trend?: number;
  trendSuffix?: string;
  trendInvert?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Tamanho da fonte do valor; `md` para faixas de 6 KPIs. */
  size?: "md" | "lg";
}

function Animated({ raw, format }: { raw: number; format: (n: number) => string }) {
  const v = useCountUp(Math.round(raw));
  return <>{format(v)}</>;
}

export function KpiCard({ label, value, raw, format = (n) => String(n), sub, tom = "navy", trend, trendSuffix, trendInvert, icon, onClick, className, size = "lg" }: KpiCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      role={onClick ? undefined : "status"}
      aria-label={onClick ? undefined : `${label}: ${value ?? raw ?? ""}`}
      className={cn(
        "card-base p-5 flex flex-col justify-between min-h-[112px] min-w-0 overflow-hidden text-left relative",
        onClick && "card-hover cursor-pointer focus-visible:ring-2 focus-visible:ring-gold/60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className="text-gold-deep shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
          <Eyebrow className="truncate">{label}</Eyebrow>
        </div>
        {trend !== undefined && <TrendBadge value={trend} suffix={trendSuffix} invert={trendInvert} />}
      </div>
      <div>
        <p
          className={cn(
            "font-display font-extrabold leading-none whitespace-nowrap tracking-[-0.03em]",
            size === "lg" ? "text-[clamp(26px,2.2vw,38px)]" : "text-[clamp(22px,1.7vw,30px)]",
            TOM_TEXT[tom],
          )}
        >
          {raw !== undefined ? <Animated raw={raw} format={format} /> : value}
        </p>
        {sub && <p className="text-[11px] text-ink-35 mt-1.5 leading-snug">{sub}</p>}
      </div>
    </Comp>
  );
}

interface PanelProps {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Sem padding interno (tabelas e listas que já têm o próprio). */
  flush?: boolean;
}

export function Panel({ title, subtitle, eyebrow, action, children, className, bodyClassName, flush }: PanelProps) {
  return (
    <section className={cn("card-base overflow-hidden flex flex-col min-w-0", className)}>
      <header className="px-5 pt-4 pb-3 border-b border-ink-06 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
          <h3 className="font-display text-[15px] font-bold text-navy leading-tight tracking-[-0.01em]">{title}</h3>
          {subtitle && <p className="text-[11px] text-ink-35 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn("flex-1 min-w-0", !flush && "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Painel escuro (navy → azul profundo) com acento dourado — projeções e destaques. */
export function DarkPanel({ children, className, eyebrow, title, action }: { children: ReactNode; className?: string; eyebrow?: string; title?: string; action?: ReactNode }) {
  return (
    <section
      className={cn("relative overflow-hidden rounded-[20px] text-white p-5 sm:p-6", className)}
      style={{ background: "linear-gradient(135deg, #08111d 0%, #14243d 100%)", boxShadow: "0 12px 40px -16px rgba(8,17,29,0.45)" }}
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(198,150,79,0.22) 0%, transparent 65%)", filter: "blur(30px)" }} />
      <div aria-hidden className="pointer-events-none absolute left-0 top-6 bottom-6 w-[2px] rounded-r" style={{ background: "linear-gradient(180deg, transparent, #c6964f 25%, #d9b06e 75%, transparent)", opacity: 0.8 }} />
      {(eyebrow || title || action) && (
        <div className="relative flex items-start justify-between gap-3 mb-4">
          <div>
            {eyebrow && <Eyebrow tom="gold">{eyebrow}</Eyebrow>}
            {title && <h3 className="font-display text-[15px] font-bold leading-tight mt-0.5">{title}</h3>}
          </div>
          {action}
        </div>
      )}
      <div className="relative">{children}</div>
    </section>
  );
}

/** Métrica dentro do DarkPanel. */
export function DarkStat({ label, value, sub, tom = "white", align = "left" }: { label: string; value: string; sub?: string; tom?: "white" | "gold" | "green" | "amber" | "red"; align?: "left" | "center" | "right" }) {
  const color = { white: "text-white", gold: "text-gold-soft", green: "text-emerald-300", amber: "text-amber-300", red: "text-rose-300" }[tom];
  return (
    <div className={cn("min-w-0", align === "center" && "text-center", align === "right" && "text-right")}>
      <p className="text-[9px] font-bold tracking-[1.8px] uppercase text-white/45 mb-1.5 truncate">{label}</p>
      <p className={cn("font-display text-[clamp(20px,1.6vw,26px)] font-extrabold leading-none tracking-[-0.03em] whitespace-nowrap", color)}>{value}</p>
      {sub && <p className="text-[10px] text-white/45 mt-1.5 leading-snug">{sub}</p>}
    </div>
  );
}

export interface BarListRow {
  key: string;
  label: string;
  value: number;
  display?: string;
  sub?: string;
  color?: string;
  onClick?: () => void;
}

/** Lista de barras horizontais (uma medida, um tom — cor só quando a entidade pede). */
export function BarList({ rows, max, labelWidth = 130, className }: { rows: BarListRow[]; max?: number; labelWidth?: number; className?: string }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {rows.map((r) => {
        const pct = top > 0 ? Math.max((r.value / top) * 100, r.value > 0 ? 3 : 0) : 0;
        const Comp = r.onClick ? "button" : "div";
        return (
          <li key={r.key}>
            <Comp type={r.onClick ? "button" : undefined} onClick={r.onClick} className={cn("w-full flex items-center gap-2.5 text-left", r.onClick && "group cursor-pointer")}>
              <span className="shrink-0 truncate text-xs font-medium text-ink-60 group-hover:text-navy" style={{ width: labelWidth }} title={r.label}>
                {r.label}
                {r.sub && <span className="block text-[10px] text-ink-35 font-normal truncate">{r.sub}</span>}
              </span>
              <span className="flex-1 h-1.5 rounded-full bg-ink-06 overflow-hidden min-w-[40px]">
                <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: r.color ?? "var(--navy)" }} />
              </span>
              <span className="w-[72px] shrink-0 text-right font-mono-dm text-[11px] font-semibold tabular-nums text-navy">{r.display ?? r.value}</span>
            </Comp>
          </li>
        );
      })}
    </ul>
  );
}

export function ErrorCard({ title, message, onRetry }: { title: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="card-base px-5 py-10 text-center space-y-3">
      <p className="text-sm font-semibold text-navy">{title}</p>
      {message && <p className="text-xs text-ink-35">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-xs font-semibold text-gold-deep underline underline-offset-4">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function LoadingGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card-base p-5 min-h-[112px] animate-pulse">
            <div className="h-2 w-20 bg-ink-06 rounded-full mb-4" />
            <div className="h-7 w-24 bg-ink-06 rounded-full mb-2" />
            <div className="h-2 w-16 bg-ink-06 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-base h-[300px] animate-pulse lg:col-span-2" />
        <div className="card-base h-[300px] animate-pulse" />
      </div>
    </div>
  );
}

export function LinkMore({ to, children, onClick }: { to?: string; children: ReactNode; onClick?: () => void }) {
  const cls = "inline-flex items-center gap-1 text-[11px] font-semibold text-gold-deep hover:text-navy transition-colors whitespace-nowrap";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children} <ArrowRight className="w-3 h-3" />
      </button>
    );
  }
  return (
    <a href={to} className={cls}>
      {children} <ArrowRight className="w-3 h-3" />
    </a>
  );
}

export function InlineEmpty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-xs text-ink-35 italic">{children}</p>;
}

/** Chip de contagem para abas/filtros. */
export function CountChip({ children, tom = "muted" }: { children: ReactNode; tom?: Tom }) {
  const map: Record<Tom, string> = {
    navy: "bg-navy/10 text-navy",
    gold: "bg-gold/15 text-gold-deep",
    green: "bg-dash-green/10 text-dash-green",
    red: "bg-dash-red/10 text-dash-red",
    amber: "bg-dash-amber/10 text-dash-amber",
    muted: "bg-ink-06 text-ink-35",
  };
  return <span className={cn("rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums", map[tom])}>{children}</span>;
}
