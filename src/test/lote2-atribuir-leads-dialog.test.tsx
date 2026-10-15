import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtribuirLeadsDialog } from "@/components/pipeline/AtribuirLeadsDialog";

const equipe = [
  { user_id: "sdr-1", full_name: "Ágatha SDR", cargo_comercial: "sdr" },
  { user_id: "closer-1", full_name: "Sampaio Closer", cargo_comercial: "closer" },
];

describe("AtribuirLeadsDialog", () => {
  it("desabilita confirmar enquanto tudo é 'manter atual' e envia só o que mudou", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<AtribuirLeadsDialog open onOpenChange={() => {}} quantidade={3} equipe={equipe} onConfirm={onConfirm} />);

    expect(screen.getByText("Atribuir 3 leads")).toBeInTheDocument();
    const confirmar = screen.getByRole("button", { name: /^Atribuir$/ });
    expect(confirmar).toBeDisabled();

    // Radix Select em jsdom: abre com click no combobox e escolhe pela opção.
    fireEvent.click(screen.getByRole("combobox", { name: "SDR" }));
    fireEvent.click(await screen.findByRole("option", { name: "Deixar solto (sem SDR)" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Closer" }));
    fireEvent.click(await screen.findByRole("option", { name: "Sampaio Closer" }));

    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({
      sdrId: null,
      limparSdr: true,
      closerId: "closer-1",
      limparCloser: false,
      produto: null,
    });
  });
});
