import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompensacoesTab } from "@/components/clientes/CompensacoesTab";

const PROCESSOS = [
  { id: "p-sub", cliente_id: "c1", tese: "subvencao", nome_exibicao: "Subvenção de ICMS", valor_credito: 647_083.86, percentual_honorario: 15, status_contrato: "assinado", status_processo: "compensando" },
  { id: "p-sub2", cliente_id: "c1", tese: "subvencao_icms", nome_exibicao: "Subvenção de ICMS — Crédito Tributário", valor_credito: 797_083.85, percentual_honorario: 0.16, status_contrato: "assinado", status_processo: "a_compensar" },
  { id: "p-ins", cliente_id: "c1", tese: "pis_cofins_insumos", nome_exibicao: "PIS/COFINS Insumos", valor_credito: 300_000, percentual_honorario: 0.2, status_contrato: "assinado", status_processo: "compensando" },
];
const proc = (id: string) => PROCESSOS.find((p) => p.id === id);
const comp = (id: string, mes: string, valor: number, processo: string, tributo: string) => ({
  id,
  cliente_id: "c1",
  mes_referencia: `${mes}-01`,
  valor_compensado: valor,
  processo_tese_id: processo,
  tese_origem_id: null as string | null,
  tributo,
  honorario_percentual: 0.15,
  status_pagamento: "pago",
  processos_teses: proc(processo),
  dcomps: [] as { numero_declaracao: string }[],
});
const COMPS = [
  comp("s1", "2026-08", 411_290.52, "p-sub", "INSS"),
  comp("s2", "2026-09", 23_731.9, "p-sub", "INSS"),
  comp("s3", "2026-09", 7_217.74, "p-sub", "COFINS"),
  comp("s4", "2026-09", 1_560.75, "p-sub", "PIS"),
  comp("i1", "2026-09", 146_583.69, "p-ins", "PIS"),
];

vi.mock("@/hooks/data/useClienteOperacional", () => ({
  invalidateClienteOperacional: vi.fn().mockResolvedValue(undefined),
  useClienteCompensacoes: () => ({ data: COMPS, isPending: false }),
  useClienteProcessos: () => ({ data: PROCESSOS, isPending: false }),
  useClienteCreditos: () => ({
    data: [
      { tese_id: "t-sub", valor_apurado_inicial: 647_083.86, incluir_no_calculo: true },
      { tese_id: "t-ins", valor_apurado_inicial: 300_000, incluir_no_calculo: true },
    ],
  }),
  useTesesTributarias: () => ({
    data: [
      { id: "t-ins", codigo: "INSUMOS", label: "Créditos de PIS/COFINS sobre Insumos" },
      { id: "t-sub", codigo: "SUBVENCAO", label: "Subvenção ICMS" },
    ],
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ userRole: "admin", permissions: [] as never[] }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  },
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompensacoesTab clienteId="c1" cliente={{ empresa: "Supermercado Liberdade", cnpj: "09.633.032/0001-07" }} />
    </QueryClientProvider>,
  );
}

describe("aba Compensações · saldo por tese (itens 6 e 7)", () => {
  it("'Todas as teses' mostra o mesmo saldo do card Saldo restante", () => {
    renderTab();
    const resumo = screen.getByLabelText("Saldo da tese filtrada");
    expect(within(resumo).getByText("Saldo · Todas as teses")).toBeInTheDocument();
    // 947.083,86 − 590.383,60 (canônico, sem Reporto)
    expect(within(resumo).getByText("R$ 356.699,26")).toBeInTheDocument();
  });

  it("abre o Mapa Tributário sem erro com processos duplicados de Subvenção", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Mapa Tributário/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
