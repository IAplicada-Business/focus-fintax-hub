import { useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { NotificacoesAtendimento } from "@/components/atendimento/NotificacoesAtendimento";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  // Dashboard e Gestão usam shell próprio (sem AppHeader / sem padding extra)
  const isDashboardShell =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isInboxShell = pathname.startsWith("/atendimento");
  const isAmbientePicker = pathname === "/ambientes";
  const isMobile = useIsMobile();

  if (isAmbientePicker) {
    return (
      <div className="min-h-screen w-full">
        <NotificacoesAtendimento />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full bg-sidebar">
      <NotificacoesAtendimento />
      <AppSidebar />
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 bg-background overflow-hidden",
          // Inbox precisa de altura travada: senão o calc da página soma com o
          // header e o composer sai da tela.
          isInboxShell && "h-screen",
        )}
      >
        {!isDashboardShell && <AppHeader />}
        <main
          className={cn(
            "flex-1 min-h-0 overflow-auto",
            !isDashboardShell && !isInboxShell && "p-4 md:p-6",
            isInboxShell && "p-0 overflow-hidden flex flex-col",
            isMobile && "pt-14",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
