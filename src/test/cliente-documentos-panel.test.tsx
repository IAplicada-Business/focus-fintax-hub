import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClienteDocumentosPanel } from "@/components/clientes/ClienteDocumentosPanel";
import type { ClienteDocumento } from "@/services/clienteDocumentosService";

const docs = vi.fn();
const uploadMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock("@/hooks/data/useClienteDocumentos", () => ({
  useClienteDocumentos: () => docs(),
  useUploadClienteDocumento: () => ({ mutateAsync: uploadMutate, isPending: false }),
  useDeleteClienteDocumento: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function doc(over: Partial<ClienteDocumento> = {}): ClienteDocumento {
  return {
    id: "d1",
    cliente_id: "c1",
    tipo: "contrato",
    nome_arquivo: "contrato.pdf",
    storage_path: "c1/cadastro/contrato/1-contrato.pdf",
    mime_type: "application/pdf",
    tamanho_bytes: 2048,
    criado_por: null,
    criado_em: "2026-10-06T12:00:00Z",
    ...over,
  };
}

describe("ClienteDocumentosPanel", () => {
  beforeEach(() => {
    docs.mockReturnValue({ data: [], isPending: false });
    uploadMutate.mockReset().mockResolvedValue(undefined);
    deleteMutate.mockReset();
  });

  it("lista os anexos na aba de documentos", () => {
    docs.mockReturnValue({
      data: [
        doc(),
        doc({ id: "d2", tipo: "procuracao", nome_arquivo: "procuracao.pdf" }),
        doc({ id: "d3", tipo: "certidao", nome_arquivo: "cnd.pdf" }),
      ],
      isPending: false,
    });

    render(<ClienteDocumentosPanel clienteId="c1" editable />);

    expect(screen.getByText("contrato.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Contrato · 2 KB/)).toBeInTheDocument();
    expect(screen.getByText("procuracao.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Procuração/)).toBeInTheDocument();
    expect(screen.getByText("cnd.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Certidão/)).toBeInTheDocument();
  });

  it("envia vários arquivos na hora quando o cliente já existe", async () => {
    render(<ClienteDocumentosPanel clienteId="c1" editable />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(["a"], "contrato.pdf", { type: "application/pdf" }),
      new File(["b"], "social.pdf", { type: "application/pdf" }),
    ];
    Object.defineProperty(input, "files", {
      configurable: true,
      value: {
        0: files[0],
        1: files[1],
        length: 2,
        item: (i: number) => files[i] ?? null,
      },
    });
    fireEvent.change(input);

    await waitFor(() => expect(uploadMutate).toHaveBeenCalledTimes(2));
    expect(uploadMutate).toHaveBeenCalledWith({ file: files[0], tipo: "contrato" });
    expect(uploadMutate).toHaveBeenCalledWith({ file: files[1], tipo: "contrato" });
  });

  it("no cadastro guarda os arquivos para enviar ao salvar", () => {
    const onPendingChange = vi.fn();
    render(
      <ClienteDocumentosPanel
        editable
        compact
        pending={[]}
        onPendingChange={onPendingChange}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["a"], "contrato.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(uploadMutate).not.toHaveBeenCalled();
    expect(onPendingChange).toHaveBeenCalledTimes(1);
    const next = onPendingChange.mock.calls[0][0];
    expect(next).toHaveLength(1);
    expect(next[0].file).toBe(file);
    expect(next[0].tipo).toBe("contrato");
  });

  it("mostra a lista pendente no cadastro", () => {
    render(
      <ClienteDocumentosPanel
        editable
        compact
        pending={[
          {
            id: "p1",
            tipo: "contrato_social",
            file: new File(["x"], "social.pdf", { type: "application/pdf" }),
          },
        ]}
        onPendingChange={vi.fn()}
      />,
    );

    expect(screen.getByText("social.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Contrato social · .+ · envia ao salvar/)).toBeInTheDocument();
  });

  it("em leitura não mostra o botão de anexar", () => {
    docs.mockReturnValue({ data: [doc()], isPending: false });
    render(<ClienteDocumentosPanel clienteId="c1" editable={false} />);

    expect(screen.queryByRole("button", { name: "Anexar arquivos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar contrato.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir contrato.pdf" })).not.toBeInTheDocument();
  });
});
