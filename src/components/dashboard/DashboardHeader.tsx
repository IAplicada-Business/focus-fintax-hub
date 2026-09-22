import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { greeting, ROLE_LABELS } from "./dashboard-utils";
import { cn } from "@/lib/utils";

interface Props {
  profileName: string;
  role: string;
  canComercial: boolean;
  canOperacional: boolean;
  canExecutiva: boolean;
  activeTab: string;
  switchTab: (t: string) => void;
  /** Rótulo da aba comercial quando ela existe. */
  comercialLabel?: string;
  /** Abas extras depois das visões (ex.: "Pulso semanal"). */
  extraTabs?: { key: string; label: string }[];
  /** Título fixo quando a tela não tem abas (ex.: "Visão Comercial"). */
  titulo?: string;
}

export function DashboardHeader({ profileName, role, canComercial, canOperacional, canExecutiva, activeTab, switchTab, comercialLabel = "Visão Comercial", extraTabs = [], titulo }: Props) {
  const tabs = [
    canComercial && { key: "comercial", label: comercialLabel },
    canOperacional && { key: "operacional", label: "Visão Operacional" },
    canExecutiva && { key: "executiva", label: "Visão Executiva" },
    ...extraTabs,
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div className="sticky top-0 z-[100] bg-[var(--dash-page)]/85 backdrop-blur-md border-b border-ink-06">
      <div className="min-h-[56px] px-4 sm:px-7 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="text-base font-bold text-navy truncate">
            {greeting()}, {profileName}
          </span>
          <span className="text-xs text-ink-60 hidden sm:inline">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</span>
          {titulo && tabs.length <= 1 && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.4px] text-gold-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              {titulo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {tabs.length > 1 && (
            <div className="bg-white border border-ink-06 rounded-full p-1 flex gap-0.5 shadow-soft">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => switchTab(t.key)}
                  className={cn(
                    "px-4 py-1.5 text-[12px] rounded-full font-sans transition-colors whitespace-nowrap",
                    activeTab === t.key ? "bg-navy text-white font-semibold shadow-sm" : "font-medium text-ink-60 hover:text-navy",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <span className="hidden md:inline bg-navy/[0.06] border border-ink-06 rounded-md px-2.5 py-[3px] font-mono-dm text-[10px] tracking-[1.5px] uppercase text-navy">{ROLE_LABELS[role] ?? role}</span>
          <span className="hidden md:inline font-mono-dm text-xs text-ink-60">{format(new Date(), "HH:mm")}</span>
        </div>
      </div>
    </div>
  );
}
