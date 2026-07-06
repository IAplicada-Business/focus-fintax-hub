import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { greeting, ROLE_LABELS } from "./dashboard-utils";

interface Props {
  profileName: string;
  role: string;
  canComercial: boolean;
  canOperacional: boolean;
  canExecutiva: boolean;
  activeTab: string;
  switchTab: (t: string) => void;
}

export function DashboardHeader({ profileName, role, canComercial, canOperacional, canExecutiva, activeTab, switchTab }: Props) {
  const tabs = [
    canComercial && { key: "comercial", label: "Visão Comercial" },
    canOperacional && { key: "operacional", label: "Visão Operacional" },
    canExecutiva && { key: "executiva", label: "Visão Executiva" },
  ].filter(Boolean) as { key: string; label: string }[];
  return (
    <div className="sticky top-0 z-[100]">
      <div className="h-[52px] px-7 flex items-center justify-between">
        <div className="flex items-baseline">
          <span className="text-base font-bold text-navy">{greeting()}, {profileName}</span>
          <span className="text-xs text-ink-60 ml-2.5">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</span>
        </div>
        <div className="flex items-center">
          <span className="bg-[rgba(10,21,100,0.08)] border border-[rgba(10,21,100,0.10)] rounded-md px-2.5 py-[3px] font-mono-dm text-[10px] tracking-[1.5px] uppercase text-navy">{ROLE_LABELS[role] ?? role}</span>
          <span className="font-mono-dm text-xs text-ink-60 ml-2.5">{format(new Date(), "HH:mm")}</span>
        </div>
      </div>
      {tabs.length > 1 && (
        <div className="flex justify-center pb-3">
          <div className="bg-white/80 border border-[rgba(10,21,100,0.08)] rounded-lg px-1 py-1 flex gap-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => switchTab(t.key)} className={`px-6 py-1.5 text-[13px] cursor-pointer bg-transparent border-none rounded-md font-sans transition-colors ${activeTab === t.key ? "font-semibold text-navy" : "font-medium text-ink-60"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
