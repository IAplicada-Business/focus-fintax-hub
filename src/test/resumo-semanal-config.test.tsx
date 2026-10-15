import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_COMERCIAL, MENU_OPERACIONAL } from "@/lib/environments";
import { getDefaultPermissions, routeToScreenKey } from "@/lib/screen-permissions";

const auth = vi.hoisted(() => ({
  value: {
    userRole: "admin" as string | null,
    user: { id: "u-admin" },
    profile: { full_name: "Mariana Cabral", email: "m@x", cargo: "" },
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.value }));

vi.mock("@/components/atendimento/WhatsAppConexao", () => ({
  useWhatsappConexao: () => ({
    isPending: false,
    isError: false,
    data: { ok: true, configured: true, connected: false, smartphoneConnected: false, detail: null as string | null },
  }),
}));

const listUsuarios = vi.fn();

vi.mock("@/services/resumoSemanalService", () => ({
  listUsuariosComWhatsapp: () => listUsuarios(),
  listResumoDestinatarios: vi.fn().mockResolvedValue([
    { id: "d1", user_id: "u-paulo", nome: "Paulo", whatsapp: null, ativo: true, criado_em: "2026-10-01" },
  ]),
  listResumoEnvios: vi.fn().mockResolvedValue([]),
  previewResumoDados: vi.fn().mockRejectedValue(new Error("sem dados no teste")),
  getSnapshotSegunda: vi.fn().mockResolvedValue(null),
  toggleDestinatarioUsuario: vi.fn().mockResolvedValue(undefined),
  removeResumoDestinatario: vi.fn().mockResolvedValue(undefined),
  enviarResumoTeste: vi.fn(),
}));

async function renderPagina() {
  const { default: ResumoSemanalConfig } = await import("@/pages/ResumoSemanalConfig");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ResumoSemanalConfig />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.value = { ...auth.value, userRole: "admin" };
  listUsuarios.mockResolvedValue([
    { user_id: "u-admin", full_name: "Mariana Cabral", email: "m@x", whatsapp: "11987655678", role: "admin" },
    { user_id: "u-paulo", full_name: "Paulo Souza", email: "p@x", whatsapp: "(21) 99999-1234", role: "pmo" },
    { user_id: "u-bia", full_name: "Bia Lima", email: "b@x", whatsapp: null, role: "comercial" },
  ]);
});

describe("Configurações → Resumo semanal (WhatsApp)", () => {
  it("quem não é admin vê acesso negado e nada é consultado", async () => {
    auth.value = { ...auth.value, userRole: "pmo" };
    await renderPagina();
    expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
    expect(screen.queryByText("Quem recebe")).not.toBeInTheDocument();
    expect(listUsuarios).not.toHaveBeenCalled();
  });

  it("admin vê os usuários; quem não tem WhatsApp fica com o switch desabilitado", async () => {
    await renderPagina();

    const paulo = await screen.findByRole("switch", { name: /Paulo Souza/ });
    expect(paulo).toBeChecked();
    expect(paulo).toBeEnabled();

    const bia = screen.getByRole("switch", { name: /Bia Lima/ });
    expect(bia).toBeDisabled();
    expect(bia).not.toBeChecked();
    expect(screen.getAllByRole("link", { name: "Cadastre o WhatsApp em Usuários" })[0]).toHaveAttribute("href", "/usuarios");

    // Número mascarado e contagem de selecionados
    expect(screen.getByText("(21) 9xxxx-1234")).toBeInTheDocument();
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
  });

  it("mostra o número do Atendimento desconectado com link para reconectar", async () => {
    await renderPagina();
    expect(screen.getByText("Desconectado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconectar no Atendimento" })).toHaveAttribute("href", "/atendimento");
    expect(await screen.findByRole("button", { name: /Enviar teste para mim/ })).toBeEnabled();
  });

  it("desabilita o teste quando o admin não tem WhatsApp no perfil", async () => {
    listUsuarios.mockResolvedValue([
      { user_id: "u-admin", full_name: "Mariana Cabral", email: "m@x", whatsapp: null, role: "admin" },
    ]);
    await renderPagina();
    await screen.findByRole("switch", { name: /Mariana Cabral/ });
    expect(screen.getByRole("button", { name: /Enviar teste para mim/ })).toBeDisabled();
    expect(screen.getByText(/Seu usuário não tem WhatsApp/)).toBeInTheDocument();
  });
});

describe("menu e permissão do resumo semanal", () => {
  const url = "/configuracoes/resumo-semanal";

  it("o item fica em Configurações do menu operacional e não no comercial", () => {
    const config = MENU_OPERACIONAL.find((m) => m.title === "Configurações");
    const item = config?.children?.find((c) => c.url === url);
    expect(item?.screenKey).toBe("resumo_semanal");
    const todosComercial = MENU_COMERCIAL.flatMap((m) => [m.url, ...(m.children ?? []).map((c) => c.url)]);
    expect(todosComercial).not.toContain(url);
  });

  it("a rota usa a chave resumo_semanal, liberada só para admin por padrão", () => {
    expect(routeToScreenKey(url)).toBe("resumo_semanal");
    const acesso = (role: string) =>
      getDefaultPermissions(role).find((p) => p.screen_key === "resumo_semanal")?.can_access;
    expect(acesso("admin")).toBe(true);
    for (const role of ["pmo", "gestor_tributario", "comercial", "gestor_comercial", "sdr", "marketing", "cliente"]) {
      expect(acesso(role)).toBe(false);
    }
  });
});
