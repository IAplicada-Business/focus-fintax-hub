import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  canaisDisponiveis,
  montarAssuntoBrief,
  montarHtmlBrief,
  montarTextoBriefWhatsapp,
  primeiroNomeContato,
  resumirEnvioBrief,
} from "@/lib/brief-cliente";
import { validarFormatoResumo } from "@/lib/resumo-semanal";

const enviar = vi.fn().mockResolvedValue({ whatsapp: "enviado", email: "sem_email" });

vi.mock("@/services/briefClienteService", () => ({
  getClienteContatoBrief: vi.fn().mockResolvedValue({
    id: "c1",
    empresa: "Mercado X",
    nome_contato: "Maria Silva",
    whatsapp: "11 91234-5678",
    email: null,
  }),
  enviarBriefCliente: (...args: unknown[]) => enviar(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const cliente = { id: "c1", empresa: "Mercado X", nome_contato: "Maria Silva", whatsapp: "11 91234-5678", email: "maria@x.com" };

describe("Lote 3C · textos do brief", () => {
  it("monta o WhatsApp exatamente no modelo", () => {
    const texto = montarTextoBriefWhatsapp(cliente);
    expect(texto).toBe(
      [
        "Olá, Maria ✱",
        "",
        "Seja bem-vindo ao Grupo AGF! A partir de agora a Mercado X conta com a nossa equipe para a recuperação de créditos tributários.",
        "",
        "Próximos passos:",
        "• Em até 5 dias úteis você recebe o acesso ao seu Mapa Tributário com o saldo apurado",
        "• Todo mês enviamos o resumo do que foi compensado e do saldo que ainda falta",
        "• Qualquer dúvida é só responder esta mensagem",
        "",
        "Conte com a gente 🤓",
      ].join("\n"),
    );
    expect(validarFormatoResumo(texto).ok).toBe(true);
  });

  it("sem nome de contato cai num cumprimento neutro", () => {
    expect(primeiroNomeContato(null)).toBe("tudo bem");
    expect(montarTextoBriefWhatsapp({ ...cliente, nome_contato: "" })).toContain("Olá, tudo bem ✱");
  });

  it("assunto e HTML do e-mail trazem a marca, o conteúdo e escapam HTML", () => {
    expect(montarAssuntoBrief(cliente)).toBe("Bem-vindo ao Grupo AGF · Mercado X");
    const html = montarHtmlBrief({ ...cliente, empresa: "Mercado <X> & Cia" });
    expect(html).toContain("Grupo AGF");
    expect(html).toContain("Mercado &lt;X&gt; &amp; Cia");
    expect(html).not.toContain("Mercado <X>");
    expect(html).toContain("Olá, Maria ✱");
    expect(html).toContain("Em até 5 dias úteis");
    expect(html).toContain("#c9964a"); // dourado do Mapa executivo
    expect(html).toContain("#0b0b0c"); // preto/grafite do Mapa executivo
  });

  it("pré-marca só canais com contato válido", () => {
    expect(canaisDisponiveis(cliente)).toEqual(["whatsapp", "email"]);
    expect(canaisDisponiveis({ ...cliente, whatsapp: "123" })).toEqual(["email"]);
    expect(canaisDisponiveis({ ...cliente, email: "nope" })).toEqual(["whatsapp"]);
    expect(canaisDisponiveis({ empresa: "Sem contato" })).toEqual([]);
  });

  it("resume o resultado por canal", () => {
    const r = resumirEnvioBrief({ whatsapp: "enviado", email: "email_nao_configurado" }, ["whatsapp", "email"]);
    expect(r.algumEnviado).toBe(true);
    expect(r.titulo).toBe("Boas-vindas enviadas ao cliente");
    expect(r.detalhe).toBe("WhatsApp enviado · e-mail ainda não configurado no servidor");
    const falha = resumirEnvioBrief({ whatsapp: "sem_numero", email: "nao_selecionado" }, ["whatsapp"]);
    expect(falha.algumEnviado).toBe(false);
    expect(falha.detalhe).toBe("cliente sem WhatsApp cadastrado");
  });

  it("a Edge Function usa a mesma lógica do lib (cópia literal após o cabeçalho)", () => {
    const lib = readFileSync(resolve(__dirname, "../lib/brief-cliente.ts"), "utf8");
    const deno = readFileSync(resolve(__dirname, "../../supabase/functions/enviar-brief-cliente/mensagem.ts"), "utf8");
    const corpo = (s: string) => s.slice(s.indexOf("export interface ClienteBrief"));
    expect(corpo(deno)).toBe(corpo(lib));
  });
});

describe("Lote 3C · diálogo Enviar brief", () => {
  it("pré-marca só o WhatsApp, deixa editar o texto e envia pelos canais marcados", async () => {
    const { EnviarBriefDialog } = await import("@/components/esteira/EnviarBriefDialog");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EnviarBriefDialog cliente={{ id: "c1", empresa: "Mercado X" }} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    const whats = await screen.findByRole("checkbox", { name: "WhatsApp" });
    expect(whats).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("checkbox", { name: "E-mail" })).toBeDisabled();
    expect(screen.getByText("sem e-mail cadastrado")).toBeInTheDocument();

    const area = (await screen.findByLabelText("Mensagem de WhatsApp")) as HTMLTextAreaElement;
    expect(area.value).toContain("Olá, Maria ✱");
    fireEvent.change(area, { target: { value: "Olá, Maria ✱\n\nTexto editado 🤓" } });

    fireEvent.click(screen.getByRole("button", { name: /Enviar$/ }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: "c1", canais: ["whatsapp"], textoWhatsapp: "Olá, Maria ✱\n\nTexto editado 🤓" }),
      ),
    );
  });
});
