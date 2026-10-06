import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DropResult } from "@hello-pangea/dnd";
import { ESTEIRA_STAGES } from "@/lib/esteira-constants";
import type { EsteiraCliente } from "@/services/esteiraService";

const mutateEstagio = vi.fn();
const mutateTriagem = vi.fn();
const mutateUpload = vi.fn();
let onDragEnd: ((result: DropResult) => void) | undefined;

vi.mock("@/hooks/data/useEsteira", () => ({
  useUpdateEstagioEsteira: () => ({ mutateAsync: mutateEstagio }),
  useUpdateTriagemRealizada: () => ({ mutate: mutateTriagem }),
  useUploadTriagemDocumento: () => ({ mutate: mutateUpload }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({
    children,
    onDragEnd: handleDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (result: DropResult) => void;
  }) => {
    onDragEnd = handleDragEnd;
    return <div>{children}</div>;
  },
  Droppable: ({
    children,
    droppableId,
  }: {
    droppableId: string;
    children: (provided: { innerRef: (node: HTMLElement | null) => void; droppableProps: object; placeholder: null }, snapshot: { isDraggingOver: boolean }) => React.ReactNode;
  }) => (
    <div data-droppable={droppableId}>
      {children(
        { innerRef: () => {}, droppableProps: {}, placeholder: null },
        { isDraggingOver: false },
      )}
    </div>
  ),
  Draggable: ({
    children,
  }: {
    children: (provided: { innerRef: (node: HTMLElement | null) => void; draggableProps: object; dragHandleProps: object }, snapshot: { isDragging: boolean }) => React.ReactNode;
  }) =>
    children(
      { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
      { isDragging: false },
    ),
}));

const { toast } = await import("sonner");
const { EsteiraKanban } = await import("@/components/esteira/EsteiraKanban");

function cliente(over: Partial<EsteiraCliente> & Pick<EsteiraCliente, "id" | "empresa" | "estagio_esteira">): EsteiraCliente {
  return {
    cnpj: "00.000.000/0001-00",
    segmento: "supermercado",
    regime_tributario: "lucro_real",
    data_entrada_estagio: "2026-09-01",
    dias_na_etapa: 1,
    responsavel_id: null,
    responsavel_nome: null,
    origem: "manual",
    status: "ativo",
    status_operacional: null,
    criado_em: "2026-09-01",
    ...over,
  };
}

const drop = (clienteId: string, from: string, to: string): DropResult => ({
  draggableId: clienteId,
  type: "DEFAULT",
  source: { droppableId: from, index: 0 },
  destination: { droppableId: to, index: 0 },
  reason: "DROP",
  mode: "FLUID",
  combine: null,
});

describe("EsteiraKanban — UI da esteira operacional", () => {
  beforeEach(() => {
    mutateEstagio.mockReset();
    mutateTriagem.mockReset();
    mutateUpload.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("mostra Devolução Comercial entre Triagem e Contrato Emitido", () => {
    render(
      <EsteiraKanban
        clientes={[cliente({ id: "c1", empresa: "Mercado Central", estagio_esteira: "triagem" })]}
        stages={ESTEIRA_STAGES}
      />,
    );

    const colunas = screen.getAllByRole("list").map((el) => el.getAttribute("aria-label"));
    expect(colunas).toEqual([
      "Triagem — 1 clientes",
      "Devolução Comercial — 0 clientes",
      "Contrato Emitido — 0 clientes",
      "Contrato Assinado — 0 clientes",
      "Em Compensação — 0 clientes",
      "Compensado — 0 clientes",
      "Concluído — 0 clientes",
    ]);
  });

  it("no card da Triagem mostra chip Sim/Não e anexo; nas outras colunas não", () => {
    render(
      <EsteiraKanban
        clientes={[
          cliente({ id: "t1", empresa: "Na Triagem", estagio_esteira: "triagem" }),
          cliente({ id: "d1", empresa: "Na Devolução", estagio_esteira: "devolucao_comercial" }),
        ]}
        stages={ESTEIRA_STAGES}
      />,
    );

    expect(screen.getByRole("button", { name: "Triagem não" })).toBeInTheDocument();
    expect(screen.getByText("Anexar")).toBeInTheDocument();
    expect(screen.queryByText("Na Devolução")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Triagem / })).toHaveLength(1);
  });

  it("clicar no chip persiste a triagem na hora, sem abrir o card", () => {
    const onClienteClick = vi.fn();
    render(
      <EsteiraKanban
        clientes={[cliente({ id: "t1", empresa: "Na Triagem", estagio_esteira: "triagem" })]}
        stages={ESTEIRA_STAGES}
        onClienteClick={onClienteClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Triagem não" }));

    expect(mutateTriagem).toHaveBeenCalledWith({ clienteId: "t1", realizada: true });
    expect(onClienteClick).not.toHaveBeenCalled();
  });

  it("anexar arquivo dispara o upload no card da Triagem", () => {
    render(
      <EsteiraKanban
        clientes={[cliente({ id: "t1", empresa: "Na Triagem", estagio_esteira: "triagem" })]}
        stages={ESTEIRA_STAGES}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf"], "conclusao.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(mutateUpload).toHaveBeenCalledWith({ clienteId: "t1", file });
  });

  it("recusa arrastar Devolução Comercial → Contrato Emitido e mostra o motivo", () => {
    render(
      <EsteiraKanban
        clientes={[cliente({ id: "d1", empresa: "Na Devolução", estagio_esteira: "devolucao_comercial" })]}
        stages={ESTEIRA_STAGES}
      />,
    );

    onDragEnd?.(drop("d1", "devolucao_comercial", "contrato_emitido"));

    expect(mutateEstagio).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/funil comercial/i));
  });

  it("recusa sair da Triagem sem realizada e documento", () => {
    render(
      <EsteiraKanban
        clientes={[cliente({ id: "t1", empresa: "Na Triagem", estagio_esteira: "triagem" })]}
        stages={ESTEIRA_STAGES}
      />,
    );

    onDragEnd?.(drop("t1", "triagem", "devolucao_comercial"));

    expect(mutateEstagio).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Triagem realizada/));
  });

  it("avança Triagem → Devolução Comercial quando a triagem está concluída", async () => {
    mutateEstagio.mockResolvedValue(undefined);
    render(
      <EsteiraKanban
        clientes={[
          cliente({
            id: "t1",
            empresa: "Na Triagem",
            estagio_esteira: "triagem",
            triagem_realizada: true,
            triagem_documento_path: "t1/triagem/doc.pdf",
            triagem_documento_nome: "doc.pdf",
          }),
        ]}
        stages={ESTEIRA_STAGES}
      />,
    );

    expect(screen.getByRole("button", { name: "Triagem sim" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "doc.pdf" })).toBeInTheDocument();

    await act(async () => {
      await onDragEnd?.(drop("t1", "triagem", "devolucao_comercial"));
    });

    await waitFor(() =>
      expect(mutateEstagio).toHaveBeenCalledWith({ clienteId: "t1", estagio: "devolucao_comercial" }),
    );
  });
});
