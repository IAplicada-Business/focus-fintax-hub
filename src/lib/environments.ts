import {
  Building2,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ScreenPermission } from "@/lib/screen-permissions";

export type Ambiente = "comercial" | "operacional";

export const AMBIENTE_STORAGE_KEY = "focus.ambiente";

export const AMBIENTE_HOME: Record<Ambiente, string> = {
  comercial: "/pipeline",
  operacional: "/dashboard",
};

export const AMBIENTE_LABEL: Record<Ambiente, string> = {
  comercial: "Comercial",
  operacional: "Operacional",
};

const COMERCIAL_KEYS = ["pipeline", "fila_leads", "atendimento", "marketing", "dashboard.comercial"] as const;

/** Telas que abrem o ambiente operacional de verdade — não dashboard/clientes readonly do comercial. */
const OPERACIONAL_KEYS = [
  "esteira",
  "dashboard.operacional",
  "dashboard.gestao",
  "dashboard.executiva",
] as const;

export interface SubMenuItem {
  title: string;
  url: string;
  screenKey?: string;
}

export interface MenuItem {
  title: string;
  url?: string;
  icon: LucideIcon;
  screenKey?: string;
  children?: SubMenuItem[];
  routeMatch?: string[];
}

export const MENU_COMERCIAL: MenuItem[] = [
  {
    // Visão Comercial mora aqui (era uma aba do /dashboard operacional).
    title: "Dashboard",
    url: "/dashboard/comercial",
    icon: LayoutDashboard,
    screenKey: "dashboard.comercial",
  },
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
    title: "Atendimento",
    url: "/atendimento",
    icon: Inbox,
    screenKey: "atendimento",
    children: [
      // Robô SDR: mora em /configuracoes/bot por histórico, mas é tela comercial.
      { title: "Robô SDR", url: "/configuracoes/bot", screenKey: "atendimento" },
    ],
  },
];

export const MENU_OPERACIONAL: MenuItem[] = [
  {
    // Pulso da semana, Ciclo & SLA e SLA por etapa são abas desta tela.
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    screenKey: "dashboard",
  },
  {
    title: "Esteira",
    url: "/esteira",
    icon: KanbanSquare,
    screenKey: "esteira",
  },
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
      { title: "Motor de Cálculo", url: "/configuracoes/motor", screenKey: "motor_calculo" },
      { title: "Estágios da Esteira", url: "/configuracoes/esteira-sla", screenKey: "esteira" },
      { title: "Benchmarks e Teses", url: "/benchmarks", screenKey: "benchmarks" },
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

export function menuDoAmbiente(ambiente: Ambiente): MenuItem[] {
  return ambiente === "comercial" ? MENU_COMERCIAL : MENU_OPERACIONAL;
}

export function parseAmbiente(value: string | null | undefined): Ambiente | null {
  return value === "comercial" || value === "operacional" ? value : null;
}

export function readStoredAmbiente(): Ambiente | null {
  try {
    return parseAmbiente(localStorage.getItem(AMBIENTE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Assinantes da troca de ambiente. `useEnvironment` é chamado em vários
 * componentes ao mesmo tempo (header, sidebar, dashboard); sem isso cada um
 * teria a própria cópia do valor e só quem clicou no switcher enxergaria a
 * mudança — o sidebar ficava com a árvore do ambiente antigo.
 */
const ambienteListeners = new Set<() => void>();

export function subscribeStoredAmbiente(listener: () => void): () => void {
  ambienteListeners.add(listener);
  return () => {
    ambienteListeners.delete(listener);
  };
}

export function writeStoredAmbiente(ambiente: Ambiente): void {
  try {
    localStorage.setItem(AMBIENTE_STORAGE_KEY, ambiente);
  } catch {
    /* storage indisponível — o estado em memória ainda avisa os assinantes */
  }
  ambienteListeners.forEach((listener) => listener());
}

// "/dashboard/comercial" é testado antes de "/dashboard" (operacional) porque
// pathToAmbiente checa os prefixos comerciais primeiro.
const COMERCIAL_PREFIXES = [
  "/dashboard/comercial",
  "/configuracoes/bot",
  "/pipeline",
  "/leads",
  "/atendimento",
  "/marketing",
];
const OPERACIONAL_PREFIXES = [
  "/dashboard",
  "/esteira",
  "/clientes",
  "/intimacoes",
  "/configuracoes",
  "/benchmarks",
  "/usuarios",
];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function pathToAmbiente(path: string): Ambiente | null {
  const clean = path.split("?")[0] ?? path;
  if (COMERCIAL_PREFIXES.some((prefix) => matchesPrefix(clean, prefix))) return "comercial";
  if (OPERACIONAL_PREFIXES.some((prefix) => matchesPrefix(clean, prefix))) return "operacional";
  return null;
}

function hasAccess(permissions: ScreenPermission[], key: string): boolean {
  return permissions.some((p) => p.screen_key === key && p.can_access);
}

function hasWriteAccess(permissions: ScreenPermission[], key: string): boolean {
  return permissions.some((p) => p.screen_key === key && p.can_access && !p.read_only);
}

/**
 * Comercial: pipeline, fila, atendimento ou marketing.
 * Operacional: esteira, clientes com escrita, ou visões operacionais do dashboard.
 * Comercial/SDR têm dashboard e clientes readonly — isso não abre o ambiente operacional.
 */
export function ambientesDisponiveis(permissions: ScreenPermission[]): Ambiente[] {
  const result: Ambiente[] = [];
  if (COMERCIAL_KEYS.some((key) => hasAccess(permissions, key))) {
    result.push("comercial");
  }
  const operacional =
    OPERACIONAL_KEYS.some((key) => hasAccess(permissions, key)) ||
    hasWriteAccess(permissions, "clientes");
  if (operacional) result.push("operacional");
  return result;
}

export function precisaEscolherAmbiente(permissions: ScreenPermission[]): boolean {
  const disponiveis = ambientesDisponiveis(permissions);
  if (disponiveis.length < 2) return false;
  const stored = readStoredAmbiente();
  return !stored || !disponiveis.includes(stored);
}
