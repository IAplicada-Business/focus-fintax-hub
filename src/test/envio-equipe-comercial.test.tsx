import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  montarHtmlAviso,
  montarTextoAviso,
  normalizarTelefoneBR,
} from "../../supabase/functions/notificar-equipe-comercial/mensagem";
import { resumirEnvioComercial } from "@/services/equipeComercialService";

const enviar = vi.fn().mockResolvedValue([
  { user_id: "u1", nome: "Ana", whatsapp: "enviado", email: "enviado" },
]);

vi.mock("@/services/equipeComercialService", async (orig) => {
  const real = await orig<typeof import("@/services/equipeComercialService")>();
  return {
    ...real,
    listDestinatariosComerciais: vi.fn().mockResolvedValue([
      { user_id: "u1", full_name: "Ana", cargo: null, papel: "comercial", tem_whatsapp: true, tem_email: true, trouxe_o_lead: false },
      { user_id: "u2", full_name: "Bruno", cargo: null, papel: "comercial", tem_whatsapp: false, tem_email: true, trouxe_o_lead: true },
    ]),
    enviarParaEquipeComercial: (...args: unknown[]) => enviar(...args),
  };
});

describe("aviso para a equipe comercial · regras puras", () => {
  it("normaliza telefone para a Z-API", () => {
    expect(normalizarTelefoneBR("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizarTelefoneBR("+55 11 3456-7890")).toBe("551134567890");
    expect(normalizarTelefoneBR("123")).toBeNull();
    expect(normalizarTelefoneBR(null)).toBeNull();
  });

  it("monta a mensagem com cliente, remetente, observação e link", () => {
    const texto = montarTextoAviso({
      cliente: { id: "c1", empresa: "Mercado X", cnpj: "00.000.000/0001-00", nome_contato: "Maria", whatsapp: "11999999999" },
      remetente: "Paula PMO",
      observacao: "  retorno até sexta ",
      link: "https://app/clientes/c1",
    });
    expect(texto).toContain("Mercado X · CNPJ 00.000.000/0001-00");
    expect(texto).toContain("enviado por Paula PMO");
    expect(texto).toContain("Contato: Maria · 11999999999");
    expect(texto).toContain("Observação: retorno até sexta");
    expect(texto).toContain("https://app/clientes/c1");
    expect(montarHtmlAviso("<b>")).not.toContain("<b>");
  });

  it("resume o resultado apontando quem ficou sem WhatsApp", () => {
    const r = resumirEnvioComercial([
      { user_id: "u1", nome: "Ana", whatsapp: "enviado", email: "enviado" },
      { user_id: "u2", nome: "Bruno", whatsapp: "sem_numero", email: "email_nao_configurado" },
    ]);
    expect(r.titulo).toBe("Enviado para 2 comerciais");
    expect(r.detalhe).toContain("WhatsApp: 1 · E-mail: 1");
    expect(r.detalhe).toContain("Bruno sem WhatsApp cadastrado");
    expect(r.detalhe).toContain("e-mail ainda não configurado no servidor");
    expect(r.algumEnviado).toBe(true);
  });
});

describe("diálogo Enviar para equipe comercial", () => {
  it("envia para todos por padrão e sugere quem trouxe o lead no específico", async () => {
    const { EnviarComercialDialog } = await import("@/components/esteira/EnviarComercialDialog");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EnviarComercialDialog cliente={{ id: "c1", empresa: "Mercado X" }} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("(2)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /todos os comerciais/i })).toBeChecked();
    expect(screen.getByText(/Sem WhatsApp cadastrado \(recebe só e-mail\): Bruno/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Enviar$/ }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ clienteId: "c1", destino: "todos" })),
    );

    fireEvent.click(screen.getByRole("radio", { name: /comercial específico/i }));
    expect(await screen.findByRole("combobox", { name: "Comercial" })).toHaveTextContent("Bruno · trouxe o lead");
  });
});
