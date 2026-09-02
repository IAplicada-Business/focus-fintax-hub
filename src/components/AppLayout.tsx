import { useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
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
    return <div className="min-h-screen w-full">{children}</div>;
  }

  return (
    <div className="min-h-screen flex w-full bg-sidebar">
      <AppSidebar />
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {!isDashboardShell && <AppHeader />}
        <main
          className={cn(
            "flex-1 overflow-auto animate-fade-up",
            !isDashboardShell && !isInboxShell && "p-4 md:p-6",
            isInboxShell && "p-0 overflow-hidden",
            isMobile && "pt-14",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
