import { useMemo, useState } from "react";
import {
  LayoutDashboard, Users, LogOut, UserPlus, Building2, Settings, Lock, ChevronDown, Menu,
  AlertTriangle, Inbox, Megaphone, ShieldCheck,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import logoWhite from "@/assets/logo-focus-fintax-white.png";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface SubMenuItem {
  title: string;
  url: string;
  screenKey?: string;
}

interface MenuItem {
  title: string;
  url?: string;                    // se setado, o parent é clicável e navega
  icon: typeof LayoutDashboard;
  screenKey?: string;
  children?: SubMenuItem[];
  routeMatch?: string[];           // paths que mantêm o item ativo (além de url e children)
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, screenKey: "dashboard" },
  {
    title: "Leads",
    url: "/pipeline",
    icon: UserPlus,
    screenKey: "pipeline",
    children: [
      { title: "Fila de Leads", url: "/leads", screenKey: "fila_leads" },
    ],
  },
  { title: "Marketing", url: "/marketing", icon: Megaphone, screenKey: "marketing" },
  {
    title: "Clientes",
    url: "/clientes",
    icon: Building2,
    screenKey: "clientes",
    children: [
      { title: "Intimações", url: "/intimacoes", screenKey: "intimacoes" },
    ],
  },
  {
    title: "Configurações",
    icon: Settings,
    routeMatch: ["/configuracoes", "/benchmarks"],
    children: [
      { title: "Motor de Cálculo",   url: "/configuracoes/motor", screenKey: "motor_calculo" },
      { title: "Benchmarks e Teses", url: "/benchmarks",          screenKey: "benchmarks" },
    ],
  },
  {
    title: "Admin",
    icon: ShieldCheck,
    routeMatch: ["/usuarios"],
    children: [
      { title: "Usuários", url: "/usuarios", screenKey: "usuarios" },
    ],
  },
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
    const selfOk  = canAccess(item.screenKey);
    const childOk = item.children?.some((c) => canAccess(c.screenKey)) ?? false;
    return selfOk || childOk;
  });
  return { profile, permissions, signOut, canAccess, isReadOnly, visibleItems };
}

interface SidebarNavProps {
  visibleItems: MenuItem[];
  canAccess: (key?: string) => boolean;
  isReadOnly: (key?: string) => boolean;
  expanded: boolean;
  onNavigate?: () => void;
}

function isItemActive(item: MenuItem, pathname: string): boolean {
  if (item.url && (pathname === item.url || pathname.startsWith(item.url + "/"))) return true;
  if (item.routeMatch?.some((p) => pathname.startsWith(p))) return true;
  if (item.children?.some((c) => pathname === c.url || pathname.startsWith(c.url + "/"))) return true;
  return false;
}

function SidebarNav({ visibleItems, canAccess, isReadOnly, expanded, onNavigate }: SidebarNavProps) {
  const location = useLocation();
  // Estado de abertura por item (key = title); auto-abre se rota bate
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  return (
    <nav className="flex-1 flex flex-col gap-1 px-2 mt-4 overflow-y-auto overflow-x-hidden">
      {visibleItems.map((item) => {
        const visibleChildren = item.children?.filter((c) => canAccess(c.screenKey)) ?? [];
        const hasChildren = visibleChildren.length > 0;
        const active = isItemActive(item, location.pathname);
        const explicitOpen = openMap[item.title] ?? false;
        const showChildren = hasChildren && expanded && (explicitOpen || active);
        const readOnly = isReadOnly(item.screenKey);

        const toggleChevron = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setOpenMap((prev) => ({ ...prev, [item.title]: !explicitOpen }));
        };

        const rowClass = cn(
          "group flex items-center gap-3 h-9 rounded-full px-3 text-sidebar-foreground transition-all duration-150 ease-out-modern whitespace-nowrap w-full",
          active
            ? "bg-[rgba(208,69,69,0.16)] text-white font-semibold ring-1 ring-inset ring-[rgba(208,69,69,0.32)]"
            : "hover:bg-white/[0.06]"
        );

        const titleSpan = (
          <span className={cn("text-sm transition-opacity duration-200 flex-1 text-left flex items-center gap-1.5", expanded ? "opacity-100" : "opacity-0")}>
            {item.title}
            {readOnly && <Lock className="h-3 w-3 opacity-60" />}
          </span>
        );

        const chevron = hasChildren && expanded ? (
          <button
            type="button"
            onClick={toggleChevron}
            aria-label={showChildren ? "Recolher submenu" : "Expandir submenu"}
            className="shrink-0 h-5 w-5 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showChildren ? "rotate-180" : "")} />
          </button>
        ) : null;

        const childrenList = showChildren && (
          <div className="flex flex-col gap-0.5 mt-0.5 mb-1">
            {visibleChildren.map((child) => {
              const childActive = location.pathname === child.url || location.pathname.startsWith(child.url + "/");
              const childReadOnly = isReadOnly(child.screenKey);
              return (
                <NavLink
                  key={child.url}
                  to={child.url}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center h-8 rounded-full pl-10 pr-3 text-sidebar-foreground transition-all duration-150 ease-out-modern whitespace-nowrap",
                    childActive
                      ? "bg-[rgba(208,69,69,0.16)] text-white font-semibold ring-1 ring-inset ring-[rgba(208,69,69,0.32)]"
                      : "hover:bg-white/[0.06] text-sidebar-foreground/85"
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
        );

        // Parent COM url (Leads, Clientes, Marketing): linkavel + chevron lateral
        if (item.url) {
          return (
            <div key={item.title}>
              <NavLink to={item.url} onClick={onNavigate} className={rowClass}>
                <item.icon className="h-5 w-5 shrink-0" />
                {titleSpan}
                {chevron}
              </NavLink>
              {childrenList}
            </div>
          );
        }

        // Parent SEM url (Configurações, Admin): clica para expandir, não navega
        return (
          <div key={item.title}>
            <button type="button" onClick={() => setOpenMap((prev) => ({ ...prev, [item.title]: !explicitOpen }))} className={rowClass}>
              <item.icon className="h-5 w-5 shrink-0" />
              {titleSpan}
              {expanded && (
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", showChildren ? "rotate-180" : "")} />
              )}
            </button>
            {childrenList}
          </div>
        );
      })}
    </nav>
  );
}

interface SidebarFooterProps {
  profile: { full_name?: string; email?: string } | null;
  expanded: boolean;
  onLogout: () => void;
}

function SidebarFooter({ profile, expanded, onLogout }: SidebarFooterProps) {
  return (
    <div className="px-2 pb-4 mt-auto shrink-0 border-t border-white/[0.06] pt-3">
      <div className="flex items-center gap-3 px-3 py-2 rounded-md">
        <div className="h-7 w-7 rounded-full bg-[rgba(208,69,69,0.16)] ring-1 ring-inset ring-[rgba(208,69,69,0.32)] flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">
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
          <button onClick={onLogout} className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors shrink-0" aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// Paleta LP — mesma signature visual (#06081f deep navy-black)
const SIDEBAR_GRADIENT = "linear-gradient(180deg, #06081f 0%, #03051a 100%)";

const sidebarStyle = {
  background: SIDEBAR_GRADIENT,
  borderRight: "1px solid rgba(255,255,255,0.06)",
};

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { profile, signOut, canAccess, isReadOnly, visibleItems } = useSidebarPermissions();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  // Mobile: Sheet drawer
  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed top-3 left-3 z-50 h-10 w-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: "#06081f", border: "1px solid rgba(255,255,255,0.10)" }}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5 text-white" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[280px] border-r-0" style={sidebarStyle}>
          <div className="h-full flex flex-col">
            <div className="flex items-center h-20 px-3 shrink-0 border-b border-white/[0.06]">
              <img src={logoWhite} alt="Focus FinTax" className="h-16 w-auto object-contain ml-1 select-none" draggable={false} />
            </div>
            <SidebarNav
              visibleItems={visibleItems}
              canAccess={canAccess}
              isReadOnly={isReadOnly}
              expanded={true}
              onNavigate={() => setMobileOpen(false)}
            />
            <SidebarFooter profile={profile} expanded={true} onLogout={handleLogout} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: hover-expand
  return (
    <div
      className={cn(
        "h-screen flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden relative",
        open ? "w-[250px]" : "w-[64px]"
      )}
      style={sidebarStyle}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent pointer-events-none" />
      <div className={cn("flex items-center h-20 shrink-0 border-b border-white/[0.06]", open ? "px-3" : "justify-center")}>
        {open ? (
          <img src={logoWhite} alt="Focus FinTax" className="h-16 w-auto object-contain ml-1 select-none" draggable={false} />
        ) : (
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(180deg, rgba(208,69,69,0.22) 0%, rgba(208,69,69,0.10) 100%)",
              border: "1px solid rgba(208,69,69,0.32)",
            }}
            aria-label="Focus FinTax"
          >
            <span className="text-white font-extrabold text-sm tracking-tight">F</span>
          </div>
        )}
      </div>
      <SidebarNav
        visibleItems={visibleItems}
        canAccess={canAccess}
        isReadOnly={isReadOnly}
        expanded={open}
      />
      <SidebarFooter profile={profile} expanded={open} onLogout={handleLogout} />
    </div>
  );
}
