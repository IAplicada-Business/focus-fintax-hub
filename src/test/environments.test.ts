import { describe, it, expect } from "vitest";
import {
  AMBIENTE_HOME,
  AMBIENTE_STORAGE_KEY,
  MENU_COMERCIAL,
  MENU_OPERACIONAL,
  ambientesDisponiveis,
  parseAmbiente,
  pathToAmbiente,
  readStoredAmbiente,
  subscribeStoredAmbiente,
  writeStoredAmbiente,
} from "@/lib/environments";
import { getDefaultPermissions } from "@/lib/screen-permissions";

describe("pathToAmbiente", () => {
  it("maps comercial routes", () => {
    expect(pathToAmbiente("/dashboard/comercial")).toBe("comercial");
    expect(pathToAmbiente("/pipeline")).toBe("comercial");
    expect(pathToAmbiente("/leads")).toBe("comercial");
    expect(pathToAmbiente("/leads/novo")).toBe("comercial");
    expect(pathToAmbiente("/atendimento")).toBe("comercial");
    expect(pathToAmbiente("/marketing")).toBe("comercial");
    expect(pathToAmbiente("/marketing/campanhas")).toBe("comercial");
  });

  it("maps operacional routes", () => {
    expect(pathToAmbiente("/dashboard")).toBe("operacional");
    expect(pathToAmbiente("/dashboard/gestao")).toBe("operacional");
    expect(pathToAmbiente("/esteira")).toBe("operacional");
    expect(pathToAmbiente("/clientes")).toBe("operacional");
    expect(pathToAmbiente("/clientes/abc-123")).toBe("operacional");
    expect(pathToAmbiente("/intimacoes")).toBe("operacional");
    expect(pathToAmbiente("/configuracoes/motor")).toBe("operacional");
    expect(pathToAmbiente("/benchmarks")).toBe("operacional");
    expect(pathToAmbiente("/usuarios")).toBe("operacional");
  });

  it("returns null for picker and unknown paths", () => {
    expect(pathToAmbiente("/ambientes")).toBeNull();
    expect(pathToAmbiente("/auth")).toBeNull();
    expect(pathToAmbiente("/")).toBeNull();
  });
});

describe("ambientesDisponiveis", () => {
  it("gives comercial-only roles the comercial environment", () => {
    for (const role of ["comercial", "sdr", "gestor_comercial", "marketing"]) {
      expect(ambientesDisponiveis(getDefaultPermissions(role))).toEqual(["comercial"]);
    }
  });

  it("gives gestor_tributario only operacional", () => {
    expect(ambientesDisponiveis(getDefaultPermissions("gestor_tributario"))).toEqual([
      "operacional",
    ]);
  });

  it("gives admin and pmo both environments", () => {
    expect(ambientesDisponiveis(getDefaultPermissions("admin"))).toEqual([
      "comercial",
      "operacional",
    ]);
    expect(ambientesDisponiveis(getDefaultPermissions("pmo"))).toEqual([
      "comercial",
      "operacional",
    ]);
  });

  it("does not open operacional from comercial dashboard or readonly clientes", () => {
    const comercial = getDefaultPermissions("comercial");
    expect(comercial.find((p) => p.screen_key === "dashboard")?.can_access).toBe(true);
    expect(comercial.find((p) => p.screen_key === "clientes")?.can_access).toBe(true);
    expect(comercial.find((p) => p.screen_key === "clientes")?.read_only).toBe(true);
    expect(ambientesDisponiveis(comercial)).toEqual(["comercial"]);
  });

  it("returns empty when the role has no screen access", () => {
    expect(ambientesDisponiveis(getDefaultPermissions("cliente"))).toEqual([]);
  });
});

describe("menu trees and homes", () => {
  it("keeps comercial items in the planned order", () => {
    expect(MENU_COMERCIAL.map((item) => item.title)).toEqual([
      "Dashboard",
      "Leads",
      "Marketing",
      "Atendimento",
    ]);
    expect(MENU_COMERCIAL[0].url).toBe("/dashboard/comercial");
    expect(MENU_COMERCIAL[0].screenKey).toBe("dashboard.comercial");
    expect(MENU_COMERCIAL[1].children?.map((c) => c.title)).toEqual(["Fila de Leads"]);
  });

  it("keeps operacional items in the planned order", () => {
    expect(MENU_OPERACIONAL.map((item) => item.title)).toEqual([
      "Dashboard",
      "Esteira",
      "Clientes",
      "Configurações",
      "Admin",
    ]);
  });

  it("sends each environment to its home", () => {
    expect(AMBIENTE_HOME.comercial).toBe("/pipeline");
    expect(AMBIENTE_HOME.operacional).toBe("/dashboard");
  });

  it("parses stored ambiente values", () => {
    expect(parseAmbiente("comercial")).toBe("comercial");
    expect(parseAmbiente("operacional")).toBe("operacional");
    expect(parseAmbiente("dashboard")).toBeNull();
    expect(parseAmbiente(null)).toBeNull();
  });
});

describe("store do ambiente (header, sidebar e dashboard compartilham a troca)", () => {
  it("avisa todos os assinantes ao trocar e persiste no storage", () => {
    localStorage.removeItem(AMBIENTE_STORAGE_KEY);
    const vistos: string[] = [];
    const unsubA = subscribeStoredAmbiente(() => vistos.push(`a:${readStoredAmbiente()}`));
    const unsubB = subscribeStoredAmbiente(() => vistos.push(`b:${readStoredAmbiente()}`));

    writeStoredAmbiente("operacional");
    expect(readStoredAmbiente()).toBe("operacional");
    expect(vistos).toEqual(["a:operacional", "b:operacional"]);

    unsubA();
    writeStoredAmbiente("comercial");
    expect(vistos).toEqual(["a:operacional", "b:operacional", "b:comercial"]);
    unsubB();
    localStorage.removeItem(AMBIENTE_STORAGE_KEY);
  });
});

describe("robô SDR", () => {
  it("abre o ambiente comercial, apesar de morar sob /configuracoes", () => {
    expect(pathToAmbiente("/configuracoes/bot")).toBe("comercial");
  });

  it("não arrasta o resto de /configuracoes para o comercial", () => {
    expect(pathToAmbiente("/configuracoes/motor")).toBe("operacional");
    expect(pathToAmbiente("/configuracoes/esteira-sla")).toBe("operacional");
  });

  it("aparece no menu comercial, sob Atendimento", () => {
    const atendimento = MENU_COMERCIAL.find((m) => m.title === "Atendimento");
    expect(atendimento?.children?.some((c) => c.url === "/configuracoes/bot")).toBe(true);
  });
});

describe("menu operacional", () => {
  it("não tem mais o submenu Gestão (virou aba do dashboard)", () => {
    const dashboard = MENU_OPERACIONAL.find((m) => m.url === "/dashboard");
    expect(dashboard?.children ?? []).toEqual([]);
  });
});
