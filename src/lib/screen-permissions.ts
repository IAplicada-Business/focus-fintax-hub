export interface ScreenChild {
  key: string;
  label: string;
  defaultRoles: string[];
  defaultReadOnlyRoles: string[];
}

export interface ScreenDef {
  key: string;
  label: string;
  route: string;
  defaultRoles: string[];
  defaultReadOnlyRoles: string[];
  children?: ScreenChild[];
}

export const SCREENS: ScreenDef[] = [
  {
    key: "dashboard", label: "Dashboard", route: "/dashboard",
    defaultRoles: ["admin", "pmo", "gestor_tributario", "comercial", "cliente"],
    defaultReadOnlyRoles: [],
    children: [
      { key: "dashboard.comercial", label: "Visão Comercial", defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: [] },
      { key: "dashboard.operacional", label: "Visão Operacional", defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: [] },
    ],
  },
  { key: "pipeline", label: "Pipeline de Leads", route: "/pipeline", defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: ["gestor_tributario"] },
  { key: "fila_leads", label: "Fila de Leads", route: "/leads", defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: ["gestor_tributario"] },
  {
    key: "clientes", label: "Clientes", route: "/clientes",
    defaultRoles: ["admin", "pmo", "gestor_tributario"],
    defaultReadOnlyRoles: ["comercial"],
    children: [
      { key: "clientes.processos", label: "Processos por Tese", defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
      { key: "clientes.compensacoes", label: "Compensações", defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
      { key: "clientes.resumo", label: "Resumo Financeiro", defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
    ],
  },
  { key: "intimacoes", label: "Intimações", route: "/intimacoes", defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
  {
    key: "marketing", label: "Marketing", route: "/marketing",
    defaultRoles: ["admin", "pmo", "comercial"],
    defaultReadOnlyRoles: [],
    children: [
      { key: "marketing.overview",    label: "Overview",     defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: [] },
      { key: "marketing.campanhas",   label: "Campanhas",    defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: [] },
      { key: "marketing.anuncios",    label: "Anúncios",     defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: [] },
      { key: "marketing.formularios", label: "Formulários",  defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: [] },
      { key: "marketing.leads",       label: "Leads (Meta)", defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: [] },
      { key: "marketing.logs",        label: "Logs",         defaultRoles: ["admin", "pmo"],              defaultReadOnlyRoles: [] },
    ],
  },
  { key: "motor_calculo", label: "Motor de Cálculo", route: "/configuracoes/motor", defaultRoles: ["admin", "pmo"], defaultReadOnlyRoles: [] },
  { key: "benchmarks", label: "Benchmarks e Teses", route: "/benchmarks", defaultRoles: ["admin"], defaultReadOnlyRoles: [] },
  { key: "usuarios", label: "Gestão de Usuários", route: "/usuarios", defaultRoles: ["admin", "pmo"], defaultReadOnlyRoles: [] },
];

export interface ScreenPermission {
  screen_key: string;
  can_access: boolean;
  read_only: boolean;
}

export function getDefaultPermissions(role: string): ScreenPermission[] {
  const perms: ScreenPermission[] = [];
  for (const s of SCREENS) {
    perms.push({
      screen_key: s.key,
      can_access: s.defaultRoles.includes(role) || s.defaultReadOnlyRoles.includes(role),
      read_only: s.defaultReadOnlyRoles.includes(role),
    });
    if (s.children) {
      for (const c of s.children) {
        perms.push({
          screen_key: c.key,
          can_access: c.defaultRoles.includes(role) || c.defaultReadOnlyRoles.includes(role),
          read_only: c.defaultReadOnlyRoles.includes(role),
        });
      }
    }
  }
  return perms;
}

/** Map a route path to a screen key */
export function routeToScreenKey(path: string): string | null {
  if (path.startsWith("/configuracoes")) return "motor_calculo";
  if (path.startsWith("/benchmarks")) return "benchmarks";
  if (path.startsWith("/pipeline")) return "pipeline";
  if (path.startsWith("/leads")) return "fila_leads";
  if (path.startsWith("/clientes")) return "clientes";
  if (path.startsWith("/intimacoes")) return "intimacoes";
  if (path.startsWith("/marketing")) return "marketing";
  if (path.startsWith("/usuarios")) return "usuarios";
  if (path.startsWith("/dashboard")) return "dashboard";
  return null;
}
