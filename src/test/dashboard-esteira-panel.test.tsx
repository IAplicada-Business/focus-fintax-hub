import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EsteiraPorEtapa } from "@/components/dashboard/operacional/EsteiraPorEtapa";
import { CargaTime } from "@/components/dashboard/operacional/CargaTime";
import type { CargaResponsavel, EtapaEsteiraResumo } from "@/lib/operacional-analytics";

const etapa = (over: Partial<EtapaEsteiraResumo> & { estagio: string; label: string }): EtapaEsteiraResumo => ({
  sla: 1,
  clientes: 0,
  atrasados: 0,
  diasMedios: null,
  atrasoAcumulado: 0,
  ...over,
});

const BASE_LEGADA: EtapaEsteiraResumo[] = [
  { ...etapa({ estagio: "nova_abordagem", label: "Nova Abordagem" }) },
  { ...etapa({ estagio: "triagem", label: "Triagem", clientes: 94, atrasados: 94, diasMedios: 1758 }) },
  { ...etapa({ estagio: "levantamento", label: "Levantamento" }) },
  { ...etapa({ estagio: "emitir_contrato", label: "Emitir Contrato" }) },
];

const renderPainel = (etapas: EtapaEsteiraResumo[]) =>
  render(
    <MemoryRouter>
      <EsteiraPorEtapa etapas={etapas} />
    </MemoryRouter>,
  );

describe("EsteiraPorEtapa (dashboard)", () => {
  it("não renderiza o quadro de cards: o kanban fica em /esteira", () => {
    renderPainel(BASE_LEGADA);

    expect(screen.getByText("Onde os clientes estão")).toBeInTheDocument();
    expect(screen.getByText("Abrir esteira")).toBeInTheDocument();
    // Marcas do mini-kanban que saíram do dashboard.
    expect(screen.queryByRole("tab", { name: /kanban/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/na etapa →/)).not.toBeInTheDocument();
    expect(screen.queryByText(/meta \d+d/)).not.toBeInTheDocument();
  });

  it("com a base concentrada, não acusa atraso operacional", () => {
    renderPainel(BASE_LEGADA);

    expect(screen.getByText(/100% em Triagem · base requer revisão/)).toBeInTheDocument();
    expect(screen.queryByText(/94 acima do SLA/)).not.toBeInTheDocument();
    expect(screen.getByText("SLA a revisar")).toBeInTheDocument();
  });

  it("resume as etapas vazias numa linha em vez de colunas vazias", () => {
    renderPainel(BASE_LEGADA);

    expect(screen.getByText("Sem cliente")).toBeInTheDocument();
    expect(
      screen.getByText("Nova Abordagem · Levantamento · Emitir Contrato"),
    ).toBeInTheDocument();
  });

  it("mostra os atrasados quando a distribuição é real", () => {
    renderPainel([
      { ...etapa({ estagio: "triagem", label: "Triagem", clientes: 5, atrasados: 2, diasMedios: 3 }) },
      { ...etapa({ estagio: "levantamento", label: "Levantamento", clientes: 4, diasMedios: 1 }) },
    ]);

    expect(screen.getByText("2 acima do SLA")).toBeInTheDocument();
    expect(screen.queryByText("Sem cliente")).not.toBeInTheDocument();
  });
});

describe("CargaTime", () => {
  const carga = (over: Partial<CargaResponsavel>): CargaResponsavel => ({
    responsavel_id: null,
    nome: "Sem responsável",
    clientes: 0,
    atrasados: 0,
    emCompensacao: 0,
    semAcao7d: 0,
    tesesAssinadas: 0,
    ...over,
  });

  it("troca a tabela por um chamado à ação quando ninguém tem dono", () => {
    render(
      <MemoryRouter>
        <CargaTime carga={[carga({ clientes: 94, atrasados: 94, semAcao7d: 94 })]} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Clientes sem responsável")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Distribuir carteira" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("mantém a tabela quando existe responsável de verdade", () => {
    render(
      <MemoryRouter>
        <CargaTime
          carga={[
            carga({ responsavel_id: "u1", nome: "Ana Souza", clientes: 6, atrasados: 1 }),
            carga({ clientes: 2 }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Distribuir carteira" })).not.toBeInTheDocument();
  });
});
