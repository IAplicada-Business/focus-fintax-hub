import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TipoTeseFilter } from "@/components/TipoTeseFilter";
import type { TipoTeseFiltro } from "@/lib/tese-filter";

const OPTIONS = [
  { value: "INSUMOS", label: "Insumos", clientes: 3 },
  { value: "SUBVENCAO", label: "Subvenção", clientes: 2 },
];

function Subject() {
  const [value, setValue] = useState<TipoTeseFiltro>([]);
  return <TipoTeseFilter value={value} onChange={setValue} options={OPTIONS} />;
}

describe("TipoTeseFilter", () => {
  it("começa em todas e permite selecionar uma ou várias teses", () => {
    render(<Subject />);

    fireEvent.click(screen.getByRole("button", { name: "Filtrar por teses" }));
    expect(screen.getByRole("checkbox", { name: "Todas as teses" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Insumos" }));
    expect(screen.getByRole("button", { name: "Filtrar por teses" })).toHaveTextContent("Insumos");

    fireEvent.click(screen.getByRole("checkbox", { name: "Subvenção" }));
    expect(screen.getByRole("button", { name: "Filtrar por teses" })).toHaveTextContent("2 teses");
  });

  it("restaura todas as teses pelo atalho", () => {
    render(<Subject />);

    fireEvent.click(screen.getByRole("button", { name: "Filtrar por teses" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Insumos" }));
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));

    expect(screen.getByRole("button", { name: "Filtrar por teses" })).toHaveTextContent("Teses");
  });
});
