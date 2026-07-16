import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { greeting, ROLE_LABELS } from "@/components/dashboard/dashboard-utils";
import { ResumoSemanalTab } from "@/components/dashboard/gestao/ResumoSemanalTab";
import { CicloSlaTab } from "@/components/dashboard/gestao/CicloSlaTab";

type GestaoTab = "resumo" | "ciclo";

export default function DashboardGestao() {
  const { profile, userRole, permissions } = useAuth();
  const role = userRole ?? "comercial";

  const perm = permissions.find((p) => p.screen_key === "dashboard.gestao");
  const canGestao = !perm || perm.can_access;

  const [tab, setTab] = useState<GestaoTab>(() => {
    const stored = localStorage.getItem("dash_gestao_tab");
    return stored === "ciclo" ? "ciclo" : "resumo";
  });

  useEffect(() => {
    localStorage.setItem("dash_gestao_tab", tab);
  }, [tab]);

  if (!canGestao) {
    return <Navigate to="/dashboard" replace />;
  }

  const tabs: { key: GestaoTab; label: string }[] = [
    { key: "resumo", label: "Pulso da semana" },
    { key: "ciclo", label: "Ciclo & SLA" },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f2f3f7] font-sans antialiased">
      <div className="sticky top-0 z-[100] bg-[#f2f3f7]/90 backdrop-blur-sm">
        <div className="h-[52px] px-7 flex items-center justify-between">
          <div className="flex items-baseline">
            <span className="text-base font-bold text-navy">
              {greeting()}, {profile?.full_name?.split(" ")[0] || "usuário"}
            </span>
            <span className="text-xs text-ink-60 ml-2.5">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </span>
          </div>
          <div className="flex items-center">
            <span className="bg-[rgba(10,21,100,0.08)] border border-[rgba(10,21,100,0.10)] rounded-md px-2.5 py-[3px] font-mono-dm text-[10px] tracking-[1.5px] uppercase text-navy">
              {ROLE_LABELS[role] ?? role}
            </span>
            <span className="font-mono-dm text-xs text-ink-60 ml-2.5">
              {format(new Date(), "HH:mm")}
            </span>
          </div>
        </div>
        <div className="flex justify-center pb-3">
          <div className="bg-white/80 border border-[rgba(10,21,100,0.08)] rounded-lg px-1 py-1 flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-6 py-1.5 text-[13px] cursor-pointer bg-transparent border-none rounded-md font-sans transition-colors ${
                  tab === t.key ? "font-semibold text-navy" : "font-medium text-ink-60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-7 pt-[18px] pb-9 w-full">
        {tab === "resumo" ? <ResumoSemanalTab /> : <CicloSlaTab />}
      </div>
    </div>
  );
}
