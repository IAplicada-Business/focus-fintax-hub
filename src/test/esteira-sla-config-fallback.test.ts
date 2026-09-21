import { describe, expect, it, vi, beforeEach } from "vitest";
import { ESTEIRA_STAGES } from "@/lib/esteira-constants";

const order = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: (...args: unknown[]) => order(...args) }),
    }),
  },
}));

/**
 * A tela /esteira monta o quadro com o que este serviço devolve. Se ele
 * rejeitar ou devolver vazio (RLS de `esteira_sla_config` barra o papel), a
 * página não pode ficar sem colunas — tem que cair nos defaults locais.
 */
describe("listEsteiraSlaConfig — fallback", () => {
  beforeEach(() => {
    order.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("devolve os defaults quando a query rejeita", async () => {
    order.mockRejectedValue(new Error("Failed to fetch"));
    const { listEsteiraSlaConfig } = await import("@/services/esteiraSlaConfigService");

    const rows = await listEsteiraSlaConfig();

    expect(rows).toHaveLength(ESTEIRA_STAGES.length);
    expect(rows.every((r) => r.ativo)).toBe(true);
  });

  it("devolve os defaults quando a RLS esconde todas as linhas", async () => {
    order.mockResolvedValue({ data: [], error: null });
    const { listEsteiraSlaConfig } = await import("@/services/esteiraSlaConfigService");

    const rows = await listEsteiraSlaConfig();

    expect(rows.map((r) => r.estagio)).toEqual(ESTEIRA_STAGES.map((s) => s.value));
  });

  it("devolve os defaults quando o PostgREST responde com erro", async () => {
    order.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const { listEsteiraSlaConfig } = await import("@/services/esteiraSlaConfigService");

    const rows = await listEsteiraSlaConfig();

    expect(rows).toHaveLength(ESTEIRA_STAGES.length);
  });
});
