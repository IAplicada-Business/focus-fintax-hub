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
  /** Quando true, o item é só um agrupador visual (sem rota navegável própria) */
  containerOnly?: boolean;
  children?: ScreenChild[];
}

/**
 * Hierarquia espelha a sidebar (AppSidebar.tsx):
 * Dashboard · Leads ▾ · Marketing · Clientes ▾ · Configurações ▾ · Admin ▾
 *
 * Chaves antigas (fila_leads, intimacoes, motor_calculo, benchmarks, usuarios)
 * permanecem como CHILDREN — não foram renomeadas pra preservar registros
 * existentes na tabela user_permissions.
 */
export const SCREENS: ScreenDef[] = [
  {
    // Role "cliente" fica fora do Dashboard: nenhuma sub-visão libera cliente,
    // então incluir na raiz só entregaria uma tela sem tabs acessíveis.
    // Quando existir portal do cliente, criar rota dedicada em vez de reutilizar.
    key: "dashboard", label: "Dashboard", route: "/dashboard",
    defaultRoles: ["admin", "pmo", "gestor_tributario", "comercial"],
    defaultReadOnlyRoles: [],
    children: [
      { key: "dashboard.comercial",   label: "Visão Comercial",   defaultRoles: ["admin", "pmo", "comercial"],        defaultReadOnlyRoles: [] },
      { key: "dashboard.operacional", label: "Visão Operacional", defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: [] },
      { key: "dashboard.executiva",   label: "Visão Executiva",   defaultRoles: ["admin", "pmo"],                      defaultReadOnlyRoles: [] },
      // Gestão: clientes/teses/ciclo — não é funil de leads
      { key: "dashboard.gestao",      label: "Gestão",            defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: [] },
    ],
  },
  {
    // Gestor tributário fica FORA (nem readonly): RLS de public.leads
    // só libera admin OU comercial (policy "Admin comercial select leads"),
    // então incluir gestor como readonly só faria ele ver Pipeline vazio.
    key: "pipeline", label: "Leads", route: "/pipeline",
    defaultRoles: ["admin", "pmo", "comercial"],
    defaultReadOnlyRoles: [],
    children: [
      { key: "fila_leads", label: "Fila de Leads", defaultRoles: ["admin", "pmo", "comercial"], defaultReadOnlyRoles: [] },
    ],
  },
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
  {
    key: "clientes", label: "Clientes", route: "/clientes",
    defaultRoles: ["admin", "pmo", "gestor_tributario"],
    defaultReadOnlyRoles: ["comercial"],
    children: [
      { key: "clientes.processos",    label: "Processos por Tese", defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
      { key: "clientes.compensacoes", label: "Compensações",       defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
      { key: "clientes.resumo",       label: "Resumo Financeiro",  defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
      { key: "intimacoes",            label: "Intimações",         defaultRoles: ["admin", "pmo", "gestor_tributario"], defaultReadOnlyRoles: ["comercial"] },
    ],
  },
  {
    key: "configuracoes", label: "Configurações", route: "/configuracoes",
    defaultRoles: ["admin", "pmo"],
    defaultReadOnlyRoles: [],
    containerOnly: true,
    children: [
      { key: "motor_calculo", label: "Motor de Cálculo",   defaultRoles: ["admin", "pmo"], defaultReadOnlyRoles: [] },
      { key: "benchmarks",    label: "Benchmarks e Teses", defaultRoles: ["admin"],         defaultReadOnlyRoles: [] },
    ],
  },
  {
    key: "admin", label: "Admin", route: "/admin",
    defaultRoles: ["admin", "pmo"],
    defaultReadOnlyRoles: [],
    containerOnly: true,
    children: [
      { key: "usuarios", label: "Gestão de Usuários", defaultRoles: ["admin", "pmo"], defaultReadOnlyRoles: [] },
    ],
  },
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
  if (path.startsWith("/configuracoes/motor")) return "motor_calculo";
  if (path.startsWith("/configuracoes")) return "configuracoes";
  if (path.startsWith("/benchmarks")) return "benchmarks";
  if (path.startsWith("/pipeline")) return "pipeline";
  if (path.startsWith("/leads")) return "fila_leads";
  if (path.startsWith("/clientes")) return "clientes";
  if (path.startsWith("/intimacoes")) return "intimacoes";
  if (path.startsWith("/marketing")) return "marketing";
  if (path.startsWith("/usuarios")) return "usuarios";
  if (path.startsWith("/dashboard/gestao")) return "dashboard.gestao";
  if (path.startsWith("/dashboard")) return "dashboard";
  return null;
}
