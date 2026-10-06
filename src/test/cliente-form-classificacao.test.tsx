import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ userRole: "admin", permissions: [] }),
}));

vi.mock("@/hooks/data/useClienteDocumentos", () => ({
  useClienteDocumentos: () => ({ data: [], isPending: false }),
  useUploadClienteDocumento: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteClienteDocumento: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/data/useEsteira", () => ({
  useEsteiraSlaConfig: () => ({
    data: [
      { estagio: "triagem", label: "Triagem", ordem: 1, ativo: true },
      { estagio: "devolucao_comercial", label: "Devolução Comercial", ordem: 2, ativo: true },
      { estagio: "contrato_emitido", label: "Contrato Emitido", ordem: 3, ativo: true },
      { estagio: "contrato_assinado", label: "Contrato Assinado", ordem: 4, ativo: true },
      { estagio: "em_compensacao", label: "Em Compensação", ordem: 5, ativo: true },
      { estagio: "compensado", label: "Compensado", ordem: 6, ativo: true },
      { estagio: "concluido", label: "Concluído", ordem: 7, ativo: true },
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
    expect(screen.getByText("Anexos")).toBeInTheDocument();
    expect(screen.queryByText("Compensando pela Fintax")).not.toBeInTheDocument();
  });

  it("já classifica durante o cadastro inicial", () => {
    renderModal();

    expect(screen.getByRole("heading", { name: "Cadastrar Cliente" })).toBeInTheDocument();
    expect(screen.getByText("Classificação do cliente")).toBeInTheDocument();
    expect(screen.getByText("Status geral")).toBeInTheDocument();
    expect(screen.getByText("Anexos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anexar arquivos" })).toBeInTheDocument();
  });

  it("abre o Status geral com os 5 valores da ficha, inclusive os extras", () => {
    renderModal(CLIENTE);
    fireEvent.click(screen.getByRole("combobox", { name: "Status geral" }));

    expect(screen.getByRole("option", { name: "Total Compensados" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Possíveis recebimentos" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Encerrado / Liquidado" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Recuperação Judicial" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ressarcimento concluído" })).toBeInTheDocument();
  });

  it("abre a etapa da esteira com Devolução Comercial entre Triagem e Contrato Emitido", () => {
    renderModal(CLIENTE);
    fireEvent.click(screen.getByRole("combobox", { name: "Etapa atual da esteira" }));

    const opcoes = screen.getAllByRole("option").map((item) => item.textContent);
    expect(opcoes).toEqual([
      "Triagem",
      "Devolução Comercial",
      "Contrato Emitido",
      "Contrato Assinado",
      "Em Compensação",
      "Compensado",
      "Concluído",
    ]);
  });
});
