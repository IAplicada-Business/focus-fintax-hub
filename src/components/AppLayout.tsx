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
  const isDashboard = pathname === "/dashboard";
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex w-full bg-sidebar">
      <AppSidebar />
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {!isDashboard && <AppHeader />}
        <main className={cn("flex-1 overflow-auto animate-fade-up", !isDashboard && "p-4 md:p-6", isMobile && "pt-14")}>
          {children}
        </main>
      </div>
    </div>
  );
}
