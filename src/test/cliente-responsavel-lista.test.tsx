import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import { listClienteResponsaveisElegiveis } from "@/services/clientesService";
import type { Database } from "@/integrations/supabase/types";

type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

vi.mock("@/services/clientesService", () => ({
  listClienteResponsaveisElegiveis: vi.fn(),
  updateClienteOperacao: vi.fn(),
}));

vi.mock("@/hooks/data/useEsteira", () => ({
  useEsteiraSlaConfig: () => ({
    data: [{ estagio: "triagem", label: "Triagem", ordem: 1, ativo: true }],
    isPending: false,
  }),
}));

const listMock = vi.mocked(listClienteResponsaveisElegiveis);

const CLIENTE = {
  id: "cliente-1",
  empresa: "Empresa Exemplo",
  cnpj: "00.000.000/0001-00",
  status: "ativo",
  status_compensacao: "compensando",
  estagio_esteira: "triagem",
  responsavel_id: null,
} as unknown as ClienteRow;

function renderModal(cliente: ClienteRow = CLIENTE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClienteFormModal open onOpenChange={vi.fn()} onSuccess={vi.fn()} cliente={cliente} />
    </QueryClientProvider>,
  );
}

const abrirResponsavel = () =>
  fireEvent.click(screen.getByRole("combobox", { name: "Responsável da empresa" }));

describe("lista de responsáveis no Editar Cliente", () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it("lista quem tem acesso de edição, com o cargo", async () => {
    listMock.mockResolvedValue([
      { user_id: "u1", full_name: "Aline Barbosa", cargo: "Analista Financeiro" },
      { user_id: "u2", full_name: "Paulo Marcos", cargo: "PMO" },
    ]);

    renderModal();
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    abrirResponsavel();

    expect(await screen.findByRole("option", { name: /Aline Barbosa · Analista Financeiro/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Paulo Marcos · PMO/ })).toBeInTheDocument();
  });

  it("quando a consulta falha, avisa e oferece nova tentativa em vez de lista vazia", async () => {
    listMock.mockRejectedValue(new Error("function does not exist"));

    renderModal();

    expect(await screen.findByText(/Não foi possível carregar a lista/)).toBeInTheDocument();

    listMock.mockResolvedValue([{ user_id: "u1", full_name: "Mariana", cargo: "IAplicada" }]);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    abrirResponsavel();
    expect(await screen.findByRole("option", { name: /Mariana · IAplicada/ })).toBeInTheDocument();
  });

  it("sem ninguém elegível, explica o motivo", async () => {
    listMock.mockResolvedValue([]);

    renderModal();

    expect(
      await screen.findByText(/Ninguém tem acesso de edição de clientes hoje/),
    ).toBeInTheDocument();
  });

  it("preserva o responsável já gravado que hoje não é elegível", async () => {
    listMock.mockResolvedValue([{ user_id: "u1", full_name: "Mariana", cargo: "IAplicada" }]);

    renderModal({ ...CLIENTE, responsavel_id: "antigo" } as ClienteRow);
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    abrirResponsavel();

    expect(
      await screen.findByRole("option", { name: /Responsável atual · sem acesso de edição hoje/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Mariana · IAplicada/ })).toBeInTheDocument();
  });
});
