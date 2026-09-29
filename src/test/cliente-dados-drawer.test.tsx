import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClienteDadosDrawer } from "@/components/clientes/ClienteDadosDrawer";
import type { Database } from "@/integrations/supabase/types";
import type { EsteiraClienteResumo } from "@/services/esteiraService";

type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

const esteiraMock = vi.fn<() => { data: EsteiraClienteResumo | null; isPending: boolean }>();

vi.mock("@/hooks/data/useEsteira", () => ({
  useEsteiraCliente: () => esteiraMock(),
  useEsteiraSlaConfig: () => ({
    data: [
      { estagio: "em_compensacao", label: "Em Compensação", ordem: 4, ativo: true },
      { estagio: "concluido", label: "Concluído", ordem: 6, ativo: true },
    ],
    isPending: false,
  }),
}));

vi.mock("@/hooks/data/useClienteOperacional", () => ({
  useClienteHistorico: () => ({ data: [] as unknown[], isPending: false, isError: false }),
}));

vi.mock("@/hooks/data/useClientes", () => ({
  useUpdateClienteMotivoParada: () => ({ mutateAsync: vi.fn(async (): Promise<string | null> => null), isPending: false }),
}));

vi.mock("@/components/clientes/EsteiraTimeline", () => ({
  EsteiraTimeline: (): null => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

const CLIENTE = {
  id: "cliente-1",
  empresa: "Rodrilagos Distribuidora",
  cnpj: "05.589.448/0001-06",
  segmento: "outros",
  regime_tributario: null,
  nome_contato: null,
  whatsapp: null,
  email: "contato@rodrilagos.com.br",
  lead_id: "lead-1",
  estagio_esteira: "em_compensacao",
  data_entrada_estagio: new Date().toISOString(),
  motivo_parada: null,
  observacoes: null,
  criado_em: "2026-09-29T12:00:00Z",
} as unknown as ClienteRow;

function esteira(overrides: Partial<EsteiraClienteResumo>): EsteiraClienteResumo {
  return {
    estagio_esteira: "em_compensacao",
    data_entrada_estagio: CLIENTE.data_entrada_estagio,
    dias_na_etapa: 3,
    sla_dias: 30,
    atrasado: false,
    responsavel_nome: "Aline Barbosa",
    motivo_parada: null,
    ...overrides,
  };
}

function renderDrawer(cliente: ClienteRow = CLIENTE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClienteDadosDrawer
          cliente={cliente}
          open
          onOpenChange={vi.fn()}
          canEdit
          intimacoesPendentes={0}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onImportLaratex={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const abrirAba = (nome: string) => {
  const trigger = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger);
};

describe("Dados do cliente — painel em abas", () => {
  beforeEach(() => {
    esteiraMock.mockReset();
  });

  it("abre no Resumo, com a ficha em grade e sem campo de motivo da parada", () => {
    esteiraMock.mockReturnValue({ data: esteira({}), isPending: false });
    renderDrawer();

    expect(screen.getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("05.589.448/0001-06")).toBeInTheDocument();
    expect(screen.getByText("contato@rodrilagos.com.br")).toBeInTheDocument();
    expect(screen.getByText("Convertido de lead")).toBeInTheDocument();
    expect(screen.getByLabelText("Observações")).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo da parada")).not.toBeInTheDocument();
  });

  it("cliente dentro do prazo não vê motivo da parada nem na aba Esteira", () => {
    esteiraMock.mockReturnValue({ data: esteira({}), isPending: false });
    renderDrawer();

    abrirAba("Esteira");
    const painel = within(screen.getByRole("tabpanel"));
    expect(painel.getByText("Em Compensação")).toBeInTheDocument();
    expect(painel.getByText("30d · no prazo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo da parada")).not.toBeInTheDocument();
    expect(screen.queryByText("SLA estourado")).not.toBeInTheDocument();
  });

  it("cliente com SLA estourado ganha o campo de motivo na aba Esteira", () => {
    esteiraMock.mockReturnValue({
      data: esteira({ atrasado: true, dias_na_etapa: 42 }),
      isPending: false,
    });
    renderDrawer();

    expect(screen.getByText("SLA estourado")).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo da parada")).not.toBeInTheDocument();

    abrirAba("Esteira");
    expect(screen.getByLabelText("Motivo da parada")).toBeInTheDocument();
    expect(screen.getByText("30d · +12")).toBeInTheDocument();
  });

  it("cliente concluído não mostra motivo mesmo com texto antigo gravado", () => {
    esteiraMock.mockReturnValue({
      data: esteira({ estagio_esteira: "concluido", atrasado: true, sla_dias: null }),
      isPending: false,
    });
    renderDrawer({ ...CLIENTE, estagio_esteira: "concluido", motivo_parada: "aguardando docs" } as ClienteRow);

    abrirAba("Esteira");
    expect(screen.queryByLabelText("Motivo da parada")).not.toBeInTheDocument();
    // Etapa atual e Meta (SLA) mostram "Concluído"; nada de "+N dias".
    expect(within(screen.getByRole("tabpanel")).getAllByText("Concluído")).toHaveLength(2);
  });

  it("histórico só é buscado ao abrir a aba e mostra estado vazio", () => {
    esteiraMock.mockReturnValue({ data: esteira({}), isPending: false });
    renderDrawer();

    abrirAba("Histórico");
    expect(screen.getByText("Nenhuma ação registrada ainda.")).toBeInTheDocument();
  });
});
