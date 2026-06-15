import { useState } from "react";
import { LayoutDashboard, Users, LogOut, UserPlus, Building2, Settings, Lock, ChevronDown, Menu, AlertTriangle, Inbox, Megaphone } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import logoWhite from "@/assets/logo-focus-fintax-white.png";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface MenuItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  screenKey?: string;
  children?: SubMenuItem[];
}

interface SubMenuItem {
  title: string;
  url: string;
  screenKey?: string;
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, screenKey: "dashboard" },
  { title: "Pipeline de Leads", url: "/pipeline", icon: UserPlus, screenKey: "pipeline" },
  { title: "Fila de Leads", url: "/leads", icon: Inbox, screenKey: "fila_leads" },
  { title: "Clientes", url: "/clientes", icon: Building2, screenKey: "clientes" },
  { title: "Intimações", url: "/intimacoes", icon: AlertTriangle, screenKey: "intimacoes" },
  { title: "Marketing", url: "/marketing", icon: Megaphone, screenKey: "marketing" },
  {
    title: "Configurações",
    url: "/configuracoes",
    icon: Settings,
    children: [
      { title: "Motor de Cálculo", url: "/configuracoes/motor", screenKey: "motor_calculo" },
      { title: "Benchmarks e Teses", url: "/benchmarks", screenKey: "benchmarks" },
    ],
  },
  { title: "Usuários", url: "/usuarios", icon: Users, screenKey: "usuarios" },
];

function useSidebarPermissions() {
  const { profile, permissions, signOut } = useAuth();
  const canAccess = (key?: string) => {
    if (!key) return true;
    const perm = permissions.find((p) => p.screen_key === key);
    return perm ? perm.can_access : true;
  };
  const isReadOnly = (key?: string) => {
    if (!key) return false;
    const perm = permissions.find((p) => p.screen_key === key);
    return perm?.read_only ?? false;
  };
  const visibleItems = menuItems.filter((item) => {
    if (item.children) return item.children.some((c) => canAccess(c.screenKey));
    return canAccess(item.screenKey);
  });
  return { profile, permissions, signOut, canAccess, isReadOnly, visibleItems };
}

interface SidebarNavProps {
  visibleItems: MenuItem[];
  canAccess: (key?: string) => boolean;
  isReadOnly: (key?: string) => boolean;
  configOpen: boolean;
  setConfigOpen: (v: boolean) => void;
  expanded: boolean;
  onNavigate?: () => void;
}

function SidebarNav({ visibleItems, canAccess, isReadOnly, configOpen, setConfigOpen, expanded, onNavigate }: SidebarNavProps) {
  const location = useLocation();
  const isOnConfigRoute = location.pathname.startsWith("/configuracoes") || location.pathname.startsWith("/benchmarks");
  
  return (
    <nav className="flex-1 flex flex-col gap-1 px-2 mt-4 overflow-y-auto overflow-x-hidden">
      {visibleItems.map((item) => {
        const hasChildren = item.children && item.children.length > 0;
        const isActive = hasChildren ? isOnConfigRoute : location.pathname === item.url;
        const readOnly = isReadOnly(item.screenKey);
        const showChildren = hasChildren && expanded && (configOpen || isOnConfigRoute);

        if (hasChildren) {
          const visibleChildren = item.children!.filter((c) => canAccess(c.screenKey));
          if (visibleChildren.length === 0) return null;
          return (
            <div key={item.title}>
              <button
                onClick={() => setConfigOpen(!configOpen)}
                className={cn(
                  "flex items-center gap-3 h-9 rounded-full px-3 text-sidebar-foreground transition-all duration-150 ease-out-modern whitespace-nowrap w-full",
                  isActive ? "bg-white/12 backdrop-blur-sm text-white font-semibold" : "hover:bg-sidebar-accent/55"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className={cn("text-sm transition-opacity duration-200 flex-1 text-left flex items-center gap-1.5", expanded ? "opacity-100" : "opacity-0")}>
                  {item.title}
                </span>
                {expanded && <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", showChildren ? "rotate-180" : "")} />}
              </button>
              {showChildren && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {visibleChildren.map((child) => {
                    const childActive = location.pathname === child.url;
                    const childReadOnly = isReadOnly(child.screenKey);
                    return (
                      <NavLink key={child.url} to={child.url} onClick={onNavigate}
                        className={cn("flex items-center h-8 rounded-full pl-10 pr-3 text-sidebar-foreground transition-all duration-150 ease-out-modern whitespace-nowrap",
                          childActive ? "bg-white/12 backdrop-blur-sm text-white font-semibold" : "hover:bg-sidebar-accent/55"
                        )}
                      >
                        <span className="text-xs flex items-center gap-1.5">
                          {child.title}
                          {childReadOnly && <Lock className="h-3 w-3 opacity-60" />}
                        </span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        return (
          <NavLink key={item.title} to={item.url} onClick={onNavigate}
            className={cn("flex items-center gap-3 h-9 rounded-full px-3 text-sidebar-foreground transition-all duration-150 ease-out-modern whitespace-nowrap",
              isActive ? "bg-white/12 backdrop-blur-sm text-white font-semibold" : "hover:bg-sidebar-accent/55"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className={cn("text-sm transition-opacity duration-200 flex items-center gap-1.5", expanded ? "opacity-100" : "opacity-0")}>
              {item.title}
              {readOnly && <Lock className="h-3 w-3 opacity-60" />}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

interface SidebarFooterProps {
  profile: any;
  expanded: boolean;
  onLogout: () => void;
}

function SidebarFooter({ profile, expanded, onLogout }: SidebarFooterProps) {
  return (
    <div className="px-2 pb-4 mt-auto shrink-0">
      <div className="flex items-center gap-3 px-3 py-2 rounded-md">
        <div className="h-7 w-7 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
          <span className="text-sidebar-accent-foreground text-xs font-bold">
            {(profile?.full_name || "U")[0].toUpperCase()}
          </span>
        </div>
        {expanded && (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{profile?.full_name || "Usuário"}</p>
            <p className="text-[10px] text-sidebar-foreground/60 truncate">{profile?.email || ""}</p>
          </div>
        )}
        {expanded && (
          <button onClick={onLogout} className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors shrink-0">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { profile, signOut, canAccess, isReadOnly, visibleItems } = useSidebarPermissions();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const sidebarStyle = {
    background: 'linear-gradient(180deg, #0a1564 0%, #071040 100%)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
  };

  // Mobile: Sheet drawer
  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed top-3 left-3 z-50 h-10 w-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: '#0a1564' }}
          >
            <Menu className="h-5 w-5 text-white" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[260px] border-r-0" style={sidebarStyle}>
          <div className="h-full flex flex-col">
            <div className="flex items-center h-20 px-3 shrink-0">
              <img src={logoWhite} alt="Focus FinTax" className="h-16 w-auto object-contain ml-1 select-none" draggable={false} />
            </div>
            <SidebarNav
              visibleItems={visibleItems} canAccess={canAccess} isReadOnly={isReadOnly}
              configOpen={configOpen} setConfigOpen={setConfigOpen} expanded={true}
              onNavigate={() => setMobileOpen(false)}
            />
            <SidebarFooter profile={profile} expanded={true} onLogout={handleLogout} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: hover-expand sidebar
  return (
    <div
      className={cn(
        "h-screen flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden relative",
        open ? "w-[250px]" : "w-[60px]"
      )}
      style={sidebarStyle}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent pointer-events-none" />
      <div className="flex items-center h-20 px-3 shrink-0">
        {open ? (
          <img src={logoWhite} alt="Focus FinTax" className="h-16 w-auto object-contain ml-1 select-none" draggable={false} />
        ) : (
          <div className="h-8 w-8 rounded-md bg-sidebar-accent flex items-center justify-center mx-auto">
            <span className="text-sidebar-primary font-extrabold text-sm">F</span>
          </div>
        )}
      </div>
      <SidebarNav
        visibleItems={visibleItems} canAccess={canAccess} isReadOnly={isReadOnly}
        configOpen={configOpen} setConfigOpen={setConfigOpen} expanded={open}
      />
      <SidebarFooter profile={profile} expanded={open} onLogout={handleLogout} />
    </div>
  );
}
