import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMetaLastFailure, useMetaLastSync, useMetaSyncMutation } from "@/hooks/data/useMetaSync";

interface Tab {
  to: string;
  label: string;
  permKey: string;
}

const TABS: Tab[] = [
  { to: "/marketing",             label: "Overview",     permKey: "marketing.overview" },
  { to: "/marketing/campanhas",   label: "Campanhas",    permKey: "marketing.campanhas" },
  { to: "/marketing/anuncios",    label: "Anúncios",     permKey: "marketing.anuncios" },
  { to: "/marketing/formularios", label: "Formulários",  permKey: "marketing.formularios" },
  { to: "/marketing/leads",       label: "Leads (Meta)", permKey: "marketing.leads" },
  { to: "/marketing/logs",        label: "Logs",         permKey: "marketing.logs" },
];

export default function MarketingLayout() {
  const { permissions } = useAuth();
  const location = useLocation();
  const syncMutation = useMetaSyncMutation();
  const lastSyncQuery = useMetaLastSync();
  const lastFailQuery = useMetaLastFailure();

  const visibleTabs = useMemo(
    () =>
      TABS.filter((t) => {
        const p = permissions.find((x) => x.screen_key === t.permKey);
        return p ? p.can_access : true;
      }),
    [permissions],
  );

  const lastSync = lastSyncQuery.data;
  const lastSyncAgo = lastSync?.finished_at
    ? formatDistanceToNow(new Date(lastSync.finished_at), { locale: ptBR, addSuffix: true })
    : null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-bold text-navy">Marketing</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            Meta Ads · campanhas, performance e leads
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSyncAgo && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">Última sync</p>
              <p className="text-xs text-foreground" title={lastSync?.finished_at ?? ""}>
                {lastSyncAgo}
                {lastSync?.function_name && (
                  <span className="text-muted-foreground"> · {lastSync.function_name.replace("meta-sync-", "")}</span>
                )}
              </p>
            </div>
          )}
          <Button
            onClick={() => syncMutation.mutate("both")}
            disabled={syncMutation.isPending}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", syncMutation.isPending && "animate-spin")} />
            {syncMutation.isPending ? "Atualizando..." : "Atualizar agora"}
          </Button>
        </div>
      </header>

      <nav className="border-b border-card-border/70 flex gap-1 overflow-x-auto no-scrollbar">
        {visibleTabs.map((t) => {
          const active = t.to === "/marketing"
            ? location.pathname === "/marketing"
            : location.pathname.startsWith(t.to);
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/marketing"}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 whitespace-nowrap",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {t.label}
            </NavLink>
          );
        })}
      </nav>

      {lastFailQuery.data?.error_text && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Sync da Meta falhou</p>
          <p className="mt-1 text-xs leading-relaxed break-words">
            {lastFailQuery.data.function_name}: {lastFailQuery.data.error_text}
          </p>
          {lastFailQuery.data.error_text.includes("TOKEN") && (
            <p className="mt-2 text-xs text-amber-800">
              Cadastre <code className="font-mono">META_ACCESS_TOKEN</code> em Supabase → Edge Functions → Secrets
              e clique em Atualizar agora. O aviso some só depois de uma sync nova.
            </p>
          )}
          {/ads_read|ads_management|#200/i.test(lastFailQuery.data.error_text) && (
            <p className="mt-2 text-xs text-amber-800">
              O token já está no ar, mas a Meta recusou a conta <code className="font-mono">act_1567349847850269</code>:
              o dono do token não tem <code className="font-mono">ads_read</code>. No Business Manager, no System User
              que gerou o token: adicione a conta de anúncios com permissão de gerenciar, gere um token novo
              com <code className="font-mono">ads_read</code>, <code className="font-mono">ads_management</code> e{" "}
              <code className="font-mono">leads_retrieval</code>, e substitua o secret.
            </p>
          )}
        </div>
      )}

      <Outlet />
    </div>
  );
}
