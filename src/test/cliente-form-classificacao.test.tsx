import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import type { Database } from "@/integrations/supabase/types";

type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

vi.mock("@/services/clientesService", () => ({
  listClienteResponsaveisElegiveis: vi.fn().mockResolvedValue([
    { user_id: "user-1", full_name: "Ana Souza", cargo: "PMO" },
  ]),
  updateClienteOperacao: vi.fn(),
}));

vi.mock("@/hooks/data/useEsteira", () => ({
  useEsteiraSlaConfig: () => ({
    data: [
      { estagio: "triagem", label: "Triagem", ordem: 1, ativo: true },
      { estagio: "levantamento", label: "Levantamento", ordem: 2, ativo: true },
    ],
    isPending: false,
  }),
}));

const CLIENTE = {
  id: "cliente-1",
  empresa: "Empresa Exemplo",
  cnpj: "00.000.000/0001-00",
  regime_tributario: "Lucro Real",
  segmento: "industria",
  nome_contato: "Maria",
  whatsapp: "",
  nao_enviar_mapa: false,
  email: "maria@exemplo.com",
  faturamento_faixa: "R$ 2M a R$ 5M",
  compensacao_outro_escritorio: "",
  status: "ativo",
  status_compensacao: "compensando",
  estagio_esteira: "triagem",
  responsavel_id: "user-1",
} as unknown as ClienteRow;

function renderModal(cliente?: ClienteRow) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClienteFormModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        cliente={cliente}
      />
    </QueryClientProvider>,
  );
}

describe("classificação geral do cliente", () => {
  it("fica dentro de Editar Cliente", async () => {
    renderModal(CLIENTE);

    expect(screen.getByRole("heading", { name: "Editar Cliente" })).toBeInTheDocument();
    expect(screen.getByText("Classificação do cliente")).toBeInTheDocument();
    expect(screen.getByText(/A tese tem sua própria situação/)).toBeInTheDocument();
    expect(screen.getByText("Status geral")).toBeInTheDocument();
    expect(screen.getByText("Responsável da empresa")).toBeInTheDocument();
    expect(screen.getByText("Etapa atual da esteira")).toBeInTheDocument();
    expect(screen.queryByText("Compensando pela Fintax")).not.toBeInTheDocument();
  });

  it("não classifica durante o cadastro inicial", () => {
    renderModal();

    expect(screen.getByRole("heading", { name: "Cadastrar Cliente" })).toBeInTheDocument();
    expect(screen.queryByText("Classificação do cliente")).not.toBeInTheDocument();
  });
});
