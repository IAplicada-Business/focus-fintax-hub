import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumoSemanalTab } from "@/components/dashboard/gestao/ResumoSemanalTab";
import type { OperacionalDashboardData } from "@/services/operacionalDashboardService";

const data: OperacionalDashboardData = {
  clientes: [
    { id: "c1", empresa: "Empresa Semana 1", tese_ativa_id: null, criado_em: "2026-01-01", atualizado_em: "2026-09-03" },
    { id: "c2", empresa: "Empresa Semana 2", tese_ativa_id: null, criado_em: "2026-01-01", atualizado_em: "2026-09-10" },
    { id: "c3", empresa: "Empresa Agosto", tese_ativa_id: null, criado_em: "2026-01-01", atualizado_em: "2026-08-30" },
  ],
  comps: [
    { cliente_id: "c1", mes_referencia: "2026-09-01", valor_compensado: 100, criado_em: "2026-09-03T12:00:00-03:00" },
    { cliente_id: "c2", mes_referencia: "2026-09-01", valor_compensado: 200, criado_em: "2026-09-10T12:00:00-03:00" },
    { cliente_id: "c3", mes_referencia: "2026-08-01", valor_compensado: 350, criado_em: "2026-08-30T12:00:00-03:00" },
  ],
  compsRaw: [],
  creditos: [],
  teses: [],
  processos: [
    { id: "p1", cliente_id: "c1", tese: "T1", nome_exibicao: "Tese Semana 1", criado_em: "2026-09-04T12:00:00-03:00" },
    { id: "p2", cliente_id: "c2", tese: "T2", nome_exibicao: "Tese Semana 2", criado_em: "2026-09-11T12:00:00-03:00" },
    { id: "p3", cliente_id: "c3", tese: "T3", nome_exibicao: "Tese Agosto", criado_em: "2026-08-30T12:00:00-03:00" },
  ],
  totais: [
    { cliente_id: "c1", credito_apurado: 1000, total_compensado: 100, saldo_restante: 900 },
    { cliente_id: "c2", credito_apurado: 1000, total_compensado: 200, saldo_restante: 800 },
    { cliente_id: "c3", credito_apurado: 1000, total_compensado: 350, saldo_restante: 650 },
  ],
  statusRows: [],
  esteira: [],
  slaConfig: [],
  esteiraHistorico: [],
  acoes: [
    { tipo: "processo", usuario_id: "u1", cliente_id: "c1", created_at: "2026-09-05T12:00:00-03:00" },
    { tipo: "processo", usuario_id: "u2", cliente_id: "c2", created_at: "2026-09-12T12:00:00-03:00" },
  ],
  nomes: { u1: "Ana", u2: "Bia" },
  intimacoes: [],
  qualidade: {
    compensacoesForaDaCarteiraAtiva: 0,
    lancamentosForaDaRegraCanonica: 2,
    statusForaDaCarteiraAtiva: 0,
    clientesSemBaseFinanceira: 4,
    clientesComSnapshotManual: 35,
    clientesSemEtapa: 0,
    clientesEmEtapaSemConfig: 0,
    clientesSemStatusCompensacao: 0,
    clientesSemTipoRecuperacao: 6,
    fontesIndisponiveis: [],
  },
};

describe("filtro do Pulso semanal", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-09-22T12:00:00-03:00").getTime(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("troca os dados junto com a semana selecionada", async () => {
    render(
      <MemoryRouter>
        <ResumoSemanalTab data={data} navigate={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Pulso semanal" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Dados incompletos" })).toHaveTextContent(
      /2 lançamento\(s\) REPORTO\/duplicado\(s\) excluídos/,
    );
    expect(screen.getByRole("combobox", { name: "Semana do pulso" })).toHaveTextContent(
      "Semana 4 · 22–28",
    );
    expect(screen.getByRole("status", { name: "Teses novas: 0" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Semana do pulso" }));
    fireEvent.click(screen.getByRole("option", { name: "Semana 1 · 01–07" }));

    expect(screen.getByRole("combobox", { name: "Semana do pulso" })).toHaveTextContent(
      "Semana 1 · 01–07",
    );
    expect(screen.getByRole("status", { name: "Teses novas: 1" })).toBeInTheDocument();
    expect(screen.getByText(/Tese Semana 1 ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Tese Semana 2 ·/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 lançamento · 1 clientes em movimento/)).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.queryByText("Bia")).not.toBeInTheDocument();
  });

  it("troca o mês e cai na última semana disponível", async () => {
    render(
      <MemoryRouter>
        <ResumoSemanalTab data={data} navigate={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Mês do pulso — mês" }));
    fireEvent.click(screen.getByRole("option", { name: "Ago" }));

    expect(screen.getByText("Agosto de 2026 · filtre por mês e semana")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Semana do pulso" })).toHaveTextContent(
      "Semana 5 · 29–31",
    );
    expect(screen.getByRole("status", { name: "Teses novas: 1" })).toBeInTheDocument();
    expect(screen.getByText(/Tese Agosto ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Tese Semana 1 ·/)).not.toBeInTheDocument();
  });
});
