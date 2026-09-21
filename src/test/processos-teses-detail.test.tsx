import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessosTesesTab } from "@/components/clientes/ProcessosTesesTab";

const PROCESSOS = [
  {
    id: "processo-1",
    cliente_id: "cliente-1",
    tese: "INSUMOS",
    nome_exibicao: "Créditos sobre Insumos",
    tipo_recuperacao: "compensacao",
    categoria: "compensacao",
    valor_credito: 100_000,
    percentual_honorario: 0.12,
    valor_honorario: 12_000,
    status_contrato: "assinado",
    status_processo: "compensando",
    observacao: "Documentação em conferência.",
    criado_em: "2026-07-01T12:00:00Z",
    atualizado_em: "2026-07-10T12:00:00Z",
  },
  {
    id: "processo-2",
    cliente_id: "cliente-1",
    tese: "SUBVENCAO",
    nome_exibicao: "Subvenção ICMS",
    tipo_recuperacao: "recuperacao_judicial",
    categoria: "compensacao",
    valor_credito: 50_000,
    percentual_honorario: 0.1,
    valor_honorario: 5_000,
    status_contrato: "aguardando_assinatura",
    status_processo: "a_compensar",
    observacao: "Aguardando assinatura do contrato.",
    criado_em: "2026-08-01T12:00:00Z",
    atualizado_em: "2026-08-05T12:00:00Z",
  },
];

vi.mock("@/hooks/data/useClienteOperacional", () => ({
  invalidateClienteOperacional: vi.fn().mockResolvedValue(undefined),
  useClienteProcessos: () => ({ data: PROCESSOS, isPending: false }),
  useMotorTesesAtivas: () => ({ data: [] as never[], refetch: vi.fn() }),
  useClienteCreditos: () => ({
    data: [
      { tese_id: "tese-1", incluir_no_calculo: true },
      { tese_id: "tese-2", incluir_no_calculo: true },
    ],
  }),
  useTesesTributarias: () => ({
    data: [
      { id: "tese-1", codigo: "INSUMOS", label: "Insumos" },
      { id: "tese-2", codigo: "SUBVENCAO", label: "Subvenção" },
    ],
  }),
}));

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProcessosTesesTab
        clienteId="cliente-1"
        compensacoesTotal={25_000}
        editable
      />
    </QueryClientProvider>,
  );
}

describe("ProcessosTesesTab organizado por tese", () => {
  it("troca a tabela por uma lista clicável e um único card de detalhe", () => {
    renderTab();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Teses do cliente" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByText("Tese selecionada")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Créditos sobre Insumos" })).toBeInTheDocument();
    expect(screen.getByText("Situação da tese")).toBeInTheDocument();
    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    expect(screen.getByText("Documentação em conferência.")).toBeInTheDocument();
    expect(screen.queryByText("Tipos de recuperação da empresa:")).not.toBeInTheDocument();
    expect(screen.queryByText("Classificar")).not.toBeInTheDocument();
  });

  it("ao clicar em outra tese, mostra os dados dela no card", () => {
    renderTab();

    fireEvent.click(screen.getByRole("tab", { name: /Subvenção ICMS/ }));

    expect(screen.getByRole("heading", { name: "Subvenção ICMS" })).toBeInTheDocument();
    expect(screen.getByText("Recuperação Judicial")).toBeInTheDocument();
    expect(screen.getByText("Aguardando")).toBeInTheDocument();
    expect(screen.getByText("A compensar")).toBeInTheDocument();
    expect(screen.getByText("Aguardando assinatura do contrato.")).toBeInTheDocument();
  });

  it("edita a tese somente pelo botão do card", () => {
    renderTab();

    expect(screen.getAllByRole("button", { name: "Editar tese" })).toHaveLength(1);
    expect(screen.queryByRole("combobox", { name: /tipo de recuperação/i })).not.toBeInTheDocument();
  });
});
