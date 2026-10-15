import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WHATSAPP_COMERCIAL_PADRAO,
  linkWhatsapp,
  mensagemErroEnvio,
  montarMensagemDiagnostico,
} from "@/lib/diagnostico-whatsapp";

// ---------------------------------------------------------------------------
// Mocks (LeadQueue + useWhatsappComercial)
// ---------------------------------------------------------------------------
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, userRole: "comercial" }),
}));

const LEAD_BASICO = {
  id: "lead-1",
  nome: "Ana Souza",
  empresa: "Mercado Bom",
  cnpj: "12345678000190",
  score_lead: 40,
  status: "relatorio_gerado",
  criado_em: "2026-10-10T12:00:00Z",
  segmento: "supermercado",
  produto: null as string | null,
  sdr_id: null as string | null,
  closer_id: null as string | null,
  faturamento_faixa: "500k_2m",
  regime_tributario: "Lucro Presumido",
};

const analyzeMutate = vi.fn();
vi.mock("@/hooks/data/useLeads", () => ({
  useLeadsBasic: () => ({ data: [LEAD_BASICO], isLoading: false }),
  useLeadsPipeline: () => ({ data: [{ ...LEAD_BASICO, token: "tok-1", relatorios_leads: [] as unknown[] }] }),
  useAnalyzeLead: () => ({ mutate: analyzeMutate, isPending: false, variables: undefined as string | undefined }),
  useDeleteLeads: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAtribuirLeads: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/data/useEquipeComercial", () => ({ useEquipeComercial: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/data/useAnalisarLeadsEmLote", () => ({
  useAnalisarLeadsEmLote: () => ({
    analisar: vi.fn(),
    progresso: { total: 0, concluidos: 0, falhas: 0, rodando: false },
  }),
}));
vi.mock("@/services/leadsService", () => ({ getLead: vi.fn() }));
vi.mock("@/components/pipeline/LeadSidePanel", () => ({
  LeadSidePanel: ({ lead }: { lead: { empresa: string } | null }) =>
    lead ? <div data-testid="painel-lead">Painel de {lead.empresa}</div> : null,
}));
vi.mock("@/components/pipeline/LeadFormModal", () => ({ LeadFormModal: (): null => null }));
vi.mock("@/components/pipeline/ImportLeadsModal", () => ({ ImportLeadsModal: (): null => null }));
vi.mock("@/components/pipeline/AtribuirLeadsDialog", () => ({ AtribuirLeadsDialog: (): null => null }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  rpcMock.mockReset();
  navigateMock.mockReset();
  analyzeMutate.mockReset();
});

// ---------------------------------------------------------------------------
// Texto da mensagem — espelho de diagnostico_mensagem_whatsapp (SQL)
// ---------------------------------------------------------------------------
describe("montarMensagemDiagnostico", () => {
  it("monta o texto exato que o SQL envia", () => {
    expect(montarMensagemDiagnostico("ana souza", "Mercado Bom", "https://app.x/diagnostico/abc")).toBe(
      "Olá, Ana ✱\n\n" +
        "Aqui é do Grupo AGF. Seu diagnóstico tributário da Mercado Bom está pronto:\n" +
        "https://app.x/diagnostico/abc\n\n" +
        "Nele você vê as teses identificadas e a estimativa de crédito a recuperar.\n\n" +
        "Quer entender os próximos passos? É só responder esta mensagem 🤓",
    );
  });

  it("omite a empresa quando é o próprio nome (calculadora) ou vazia", () => {
    const m1 = montarMensagemDiagnostico("Maria Silva", "maria silva", "L");
    const m2 = montarMensagemDiagnostico("Maria", "", "L");
    for (const m of [m1, m2]) {
      expect(m).toContain("Seu diagnóstico tributário está pronto:\nL\n");
    }
    expect(m1.startsWith("Olá, Maria ✱")).toBe(true);
  });

  it("sem nome, saúda sem vírgula; capitaliza como o initcap do Postgres", () => {
    expect(montarMensagemDiagnostico("", "X", "L").startsWith("Olá ✱\n\n")).toBe(true);
    expect(montarMensagemDiagnostico("  JOSÉ-carlos  da silva", "X", "L").startsWith("Olá, José-Carlos ✱")).toBe(true);
  });

  it("só usa os emojis permitidos", () => {
    const m = montarMensagemDiagnostico("Ana", "Mercado", "L");
    const emojis = m.match(/\p{Extended_Pictographic}/gu) ?? [];
    expect(emojis.every((e) => e === "🤓" || e === "✱")).toBe(true);
  });
});

describe("helpers de envio", () => {
  it("explica os erros da RPC em português", () => {
    expect(mensagemErroEnvio("sem_whatsapp")).toMatch(/não tem WhatsApp/);
    expect(mensagemErroEnvio("app_public_url_nao_configurado")).toMatch(/app_public_url/);
    expect(mensagemErroEnvio("xyz")).toMatch(/xyz/);
  });

  it("linkWhatsapp usa o padrão quando o número vem vazio", () => {
    expect(linkWhatsapp("")).toBe(`https://wa.me/${WHATSAPP_COMERCIAL_PADRAO}`);
    expect(linkWhatsapp("+55 (21) 98888-7777", "oi é")).toBe("https://wa.me/5521988887777?text=oi%20%C3%A9");
  });
});

// ---------------------------------------------------------------------------
// useWhatsappComercial
// ---------------------------------------------------------------------------
describe("useWhatsappComercial", () => {
  it("cai no número padrão quando a RPC falha", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { useWhatsappComercial } = await import("@/hooks/data/useWhatsappComercial");
    const { result } = renderHook(() => useWhatsappComercial(), { wrapper });
    expect(result.current).toBe(WHATSAPP_COMERCIAL_PADRAO);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("get_whatsapp_comercial"));
    expect(result.current).toBe(WHATSAPP_COMERCIAL_PADRAO);
  });

  it("usa o número de app_config quando existe", async () => {
    rpcMock.mockResolvedValue({ data: "5511912345678", error: null });
    const { useWhatsappComercial } = await import("@/hooks/data/useWhatsappComercial");
    const { result } = renderHook(() => useWhatsappComercial(), { wrapper });
    await waitFor(() => expect(result.current).toBe("5511912345678"));
  });
});

// ---------------------------------------------------------------------------
// LeadQueue abre o painel do lead (não a página de relatório e-mail)
// ---------------------------------------------------------------------------
describe("LeadQueue", () => {
  it("o olho abre o LeadSidePanel em vez de navegar para /relatorio", async () => {
    const { default: LeadQueue } = await import("@/pages/LeadQueue");
    render(<LeadQueue />, { wrapper });

    expect(screen.queryByTestId("painel-lead")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /abrir ana souza/i }));

    expect(screen.getByTestId("painel-lead")).toHaveTextContent("Painel de Mercado Bom");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("mostra 'Regerar diagnóstico' para lead com faturamento e regime", async () => {
    const { default: LeadQueue } = await import("@/pages/LeadQueue");
    render(<LeadQueue />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /regerar diagnóstico de ana souza/i }));
    expect(analyzeMutate).toHaveBeenCalledWith("lead-1");
    // O clique na ação não abre o painel junto.
    expect(screen.queryByTestId("painel-lead")).not.toBeInTheDocument();
  });
});
