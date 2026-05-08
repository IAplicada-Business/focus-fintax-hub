import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const mockFrom = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "1" }, error: null }),
    then: vi.fn(),
  }));
  return {
    supabase: {
      from: mockFrom,
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    },
  };
});

describe("services module structure", () => {
  it("leadsService exports expected functions", async () => {
    const mod = await import("@/services/leadsService");
    expect(mod.listLeads).toBeDefined();
    expect(mod.listLeadsBasic).toBeDefined();
    expect(mod.getLeadExceptions).toBeDefined();
    expect(mod.createLead).toBeDefined();
    expect(mod.updateLeadStatus).toBeDefined();
    expect(mod.analyzeLead).toBeDefined();
  });

  it("clientesService exports expected functions", async () => {
    const mod = await import("@/services/clientesService");
    expect(mod.listClientes).toBeDefined();
    expect(mod.getCliente).toBeDefined();
    expect(mod.listProcessosTeses).toBeDefined();
    expect(mod.listCompensacoesMensais).toBeDefined();
    expect(mod.deleteCliente).toBeDefined();
  });

  it("dashboardService exports expected functions", async () => {
    const mod = await import("@/services/dashboardService");
    expect(mod.fetchCommercialKpis).toBeDefined();
    expect(mod.fetchCommercialCharts).toBeDefined();
    expect(mod.fetchOperationalKpis).toBeDefined();
    expect(mod.fetchOperationalHealth).toBeDefined();
    expect(mod.fetchIntimacoesSummary).toBeDefined();
  });

  it("intimacoesService exports expected functions", async () => {
    const mod = await import("@/services/intimacoesService");
    expect(mod.listIntimacoes).toBeDefined();
    expect(mod.deleteIntimacao).toBeDefined();
  });

  it("motorService exports expected functions", async () => {
    const mod = await import("@/services/motorService");
    expect(mod.listTeses).toBeDefined();
    expect(mod.upsertTese).toBeDefined();
    expect(mod.toggleTeseAtivo).toBeDefined();
  });

  it("usersService exports expected functions", async () => {
    const mod = await import("@/services/usersService");
    expect(mod.listUsers).toBeDefined();
    expect(mod.loadUserPermissions).toBeDefined();
    expect(mod.toggleUserActive).toBeDefined();
    expect(mod.manageUser).toBeDefined();
  });
});
