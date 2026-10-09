import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtendimentoLeadPanel } from "@/components/atendimento/AtendimentoLeadPanel";
import type { InboxConversa } from "@/services/atendimentoService";
import type { PipelineLead } from "@/pages/Pipeline";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, userRole: "comercial" }),
}));

vi.mock("@/services/atendimentoService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/atendimentoService")>();
  return {
    ...actual,
    assumirAtendimento: vi.fn(),
    liberarAtendimento: vi.fn(),
  };
});

const CONVERSA: InboxConversa = {
  telefone: "55219999990000",
  bot_ativo: false,
  atualizado_em: "2026-10-09T12:00:00Z",
  ultima_texto: "Oi",
  ultima_em: "2026-10-09T12:00:00Z",
  ultima_origem: "humano",
  ultima_direcao: "entrada",
  assumido_por: null,
  assumido_por_nome: null,
  assumido_em: null,
};

const LEAD = {
  id: "lead-1",
  nome: "Ana",
  empresa: "Mercado Bom",
  cnpj: "12.345.678/0001-90",
  email: "ana@teste.com",
  whatsapp: "219999990000",
  segmento: "supermercado",
  regime_tributario: "Lucro Presumido",
  faturamento_faixa: "500k_2m",
  score_lead: 70,
  status: "novo",
  status_funil: "novo",
  status_funil_atualizado_em: "2026-10-09T12:00:00Z",
  origem: "manual",
  criado_em: "2026-10-09T12:00:00Z",
  observacoes: "",
  token: "tok",
  relatorios_leads: [],
} as PipelineLead;

describe("AtendimentoLeadPanel", () => {
  it("oferece criar lead quando a conversa não tem cadastro", () => {
    const onCriarLead = vi.fn();
    render(
      <AtendimentoLeadPanel lead={null} leadsCount={0} conversa={CONVERSA} onCriarLead={onCriarLead} />,
    );

    expect(screen.getByText(/sem lead vinculado/i)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /criar lead/i }));
    expect(onCriarLead).toHaveBeenCalledTimes(1);
  });

  it("não mostra o botão quando já existe lead vinculado", () => {
    render(<AtendimentoLeadPanel lead={LEAD} leadsCount={1} conversa={CONVERSA} onCriarLead={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /criar lead/i })).not.toBeInTheDocument();
    expect(screen.getByText("Mercado Bom")).toBeInTheDocument();
  });
});
