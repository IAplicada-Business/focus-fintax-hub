import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EsteiraCliente } from "@/services/esteiraService";

const useEsteiraClientes = vi.fn();
const useEsteiraSlaConfig = vi.fn();

vi.mock("@/hooks/data/useEsteira", () => ({
  useEsteiraClientes: () => useEsteiraClientes(),
  useEsteiraSlaConfig: () => useEsteiraSlaConfig(),
  useUpdateEstagioEsteira: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ userRole: "admin" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

const cliente: EsteiraCliente = {
  id: "c1",
  empresa: "Mercado Central",
  cnpj: "00.000.000/0001-00",
  segmento: "supermercado",
  regime_tributario: "lucro_real",
  estagio_esteira: "triagem",
  data_entrada_estagio: "2026-09-01",
  dias_na_etapa: 2,
  responsavel_id: null,
  responsavel_nome: null,
  origem: "manual",
  status: "ativo",
  status_operacional: null,
  criado_em: "2026-09-01",
};

async function renderEsteira() {
  const { default: Esteira } = await import("@/pages/Esteira");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/esteira"]}>
        <Esteira />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Regressão do relato "não estou vendo a esteira em formato kanban": a tela
 * abria na Tabela para admin/pmo e ficava no skeleton sempre que a config de
 * SLA não voltava do banco.
 */
describe("/esteira — quadro visível", () => {
  beforeEach(() => {
    localStorage.clear();
    useEsteiraClientes.mockReturnValue({ data: [cliente], isLoading: false });
    useEsteiraSlaConfig.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("abre no Kanban mesmo para admin, sem preferência salva", async () => {
    await renderEsteira();

    expect(screen.getByRole("tab", { name: "Kanban" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Tabela" })).toHaveAttribute("aria-selected", "false");
  });

  it("renderiza as colunas com os defaults quando a config de SLA não vem", async () => {
    await renderEsteira();

    expect(screen.getByRole("region", { name: "Esteira administrativa" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Triagem/ })).toBeInTheDocument();
    expect(screen.getByText("Mercado Central")).toBeInTheDocument();
  });

  it("respeita a preferência salva de tabela", async () => {
    localStorage.setItem("esteira.tab.v2", "acompanhamento");

    await renderEsteira();

    expect(screen.getByRole("tab", { name: "Tabela" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Esteira administrativa" })).not.toBeInTheDocument();
  });
});
