import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOperacionalDashboard } from "@/hooks/data/useOperacionalDashboard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CommercialView } from "@/components/dashboard/comercial/CommercialView";
import { OperationalView } from "@/components/dashboard/operacional/OperationalView";
import { ExecutivaView } from "@/components/dashboard/executiva/ExecutivaView";
import { ResumoSemanalTab } from "@/components/dashboard/gestao/ResumoSemanalTab";
import { ErrorCard, LoadingGrid } from "@/components/dashboard/ui/primitives";

type DashboardModo = "comercial" | "operacional";
type AbaOperacional = "operacional" | "executiva" | "pulso";

const ABA_KEY = "dash_tab";

/**
 * `modo="comercial"` (/dashboard/comercial): a Visão Comercial inteira em uma
 * página, sem abas. `modo="operacional"` (/dashboard): Operacional,
 * Executiva e Pulso semanal compartilhando uma única leitura de dados.
 */
export default function Dashboard({ modo = "operacional" }: { modo?: DashboardModo }) {
  const { profile, userRole, permissions } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = userRole ?? "comercial";

  const canTab = (tabKey: string) => {
    const perm = permissions.find((p) => p.screen_key === tabKey);
    return perm ? perm.can_access : true;
  };
  const canComercialPerm = canTab("dashboard.comercial");
  const canOperacionalPerm = canTab("dashboard.operacional");
  const canExecutivaPerm = canTab("dashboard.executiva");
  const canGestaoPerm = canTab("dashboard.gestao");

  const canOperacional = modo === "operacional" && canOperacionalPerm;
  const canExecutiva = modo === "operacional" && canExecutivaPerm;
  const canPulso = modo === "operacional" && canGestaoPerm;

  const resolveDefault = (): AbaOperacional => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(ABA_KEY);
    } catch {
      /* storage indisponível */
    }
    if (stored === "pulso" && canPulso) return "pulso";
    if (stored === "executiva" && canExecutiva) return "executiva";
    if (stored === "operacional" && canOperacional) return "operacional";
    if (canOperacional) return "operacional";
    if (canExecutiva) return "executiva";
    if (canPulso) return "pulso";
    return "operacional";
  };
  const [activeTab, setActiveTab] = useState<AbaOperacional>(resolveDefault);
  const switchTab = (t: string) => {
    setActiveTab(t as AbaOperacional);
    try {
      localStorage.setItem(ABA_KEY, t);
    } catch {
      /* storage indisponível */
    }
  };

  // Quem só tem a Visão Comercial cai em /dashboard por link antigo → vai pro dashboard do ambiente certo.
  const redirecionarParaComercial = modo === "operacional" && !canOperacionalPerm && !canExecutivaPerm && !canGestaoPerm && canComercialPerm;

  const opQ = useOperacionalDashboard();
  const habilitarOperacional = modo === "operacional";

  // Realtime: qualquer mudança em leads/compensações/clientes invalida os dois dashboards (debounce 2s).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => queryClient.invalidateQueries({ queryKey: ["dashboard"] }), 2000);
    };
    const channel = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "compensacoes_mensais" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cliente_historico" }, bump)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (redirecionarParaComercial) {
    return <Navigate to="/dashboard/comercial" replace />;
  }

  const renderOperacional = () => {
    if (opQ.isLoading) return <LoadingGrid />;
    if (opQ.isError || !opQ.data) {
      return <ErrorCard title="Não foi possível carregar o dashboard" message={(opQ.error as Error)?.message} onRetry={() => opQ.refetch()} />;
    }
    if (activeTab === "executiva" && canExecutiva) return <ExecutivaView data={opQ.data} navigate={navigate} />;
    if (activeTab === "pulso" && canPulso) return <ResumoSemanalTab data={opQ.data} navigate={navigate} />;
    return <OperationalView data={opQ.data} navigate={navigate} />;
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[var(--dash-page)] font-sans antialiased">
      <DashboardHeader
        profileName={profile?.full_name?.split(" ")[0] || "usuário"}
        role={role}
        canComercial={false}
        canOperacional={canOperacional}
        canExecutiva={canExecutiva}
        activeTab={modo === "comercial" ? "comercial" : activeTab}
        switchTab={switchTab}
        extraTabs={canPulso ? [{ key: "pulso", label: "Pulso semanal" }] : []}
        titulo={modo === "comercial" ? "Visão Comercial" : undefined}
      />

      <div className="px-4 sm:px-7 pt-[18px] pb-9 w-full">
        {modo === "comercial" ? <CommercialView navigate={navigate} /> : habilitarOperacional ? renderOperacional() : null}
      </div>
    </div>
  );
}
