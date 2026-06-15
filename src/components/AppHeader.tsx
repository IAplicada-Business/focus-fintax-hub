import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const { profile, userRole } = useAuth();
  const navigate = useNavigate();
  const { notifications, loading: notifLoading } = useNotifications();

  const ROLE_LABELS: Record<string, string> = {
    admin: "Administrador",
    pmo: "PMO",
    gestor_tributario: "Gestor Tributário",
    comercial: "Comercial",
    cliente: "Cliente",
  };

  return (
    <header className="h-16 border-b border-card-border/70 bg-card/95 backdrop-blur-sm flex items-center justify-end px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="h-5 w-5" />
              {!notifLoading && notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-dash-red" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 rounded-2xl border-card-border/70 shadow-soft-hover">
            <div className="px-4 py-3 border-b border-card-border/70">
              <p className="text-sm font-semibold text-foreground tracking-[-0.005em]">Notificações</p>
            </div>
            {notifLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted mt-1.5 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 bg-muted rounded" />
                      <div className="h-2.5 w-1/2 bg-muted/60 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nenhuma notificação pendente</p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => navigate(n.href)}
                    className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex items-start gap-3"
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 rounded-full flex-shrink-0",
                        n.type === "warning" ? "bg-amber-500" : "bg-blue-500"
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-foreground tracking-[-0.005em] leading-tight">{profile?.full_name || "Usuário"}</p>
            <p className="text-[11px] text-body-text tracking-[0.04em] uppercase">{ROLE_LABELS[userRole ?? ""] || profile?.cargo || "—"}</p>
          </div>
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center ring-2 ring-card-border/70 transition-transform duration-150 ease-out-modern hover:scale-[1.04]">
            <span className="text-primary-foreground text-sm font-bold">
              {(profile?.full_name || "U")[0].toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
