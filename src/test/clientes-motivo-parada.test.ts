import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { getCliente, updateClienteMotivoParada } from "@/services/clientesService";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("motivo de parada do cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lê o motivo junto com os dados do cliente", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "cliente-1", empresa: "Mercado Central", motivo_parada: "Aguardando documentos" },
      error: null,
    });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    const cliente = await getCliente("cliente-1");

    expect(supabase.from).toHaveBeenCalledWith("clientes");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("id", "cliente-1");
    expect(cliente.motivo_parada).toBe("Aguardando documentos");
  });

  it("salva e retorna o motivo confirmado pelo banco", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { motivo_parada: "Aguardando retorno do cliente" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    vi.mocked(supabase.from).mockReturnValue({ update } as never);

    const result = await updateClienteMotivoParada("cliente-1", "Aguardando retorno do cliente");

    expect(update).toHaveBeenCalledWith({
      motivo_parada: "Aguardando retorno do cliente",
      atualizado_em: expect.any(String),
    });
    expect(eq).toHaveBeenCalledWith("id", "cliente-1");
    expect(select).toHaveBeenCalledWith("motivo_parada");
    expect(result).toBe("Aguardando retorno do cliente");
  });
});
