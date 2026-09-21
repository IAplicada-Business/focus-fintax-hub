import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OperationalView } from "@/components/dashboard/operacional/OperationalView";
import type { OperacionalDashboardData } from "@/services/operacionalDashboardService";

const data: OperacionalDashboardData = {
  clientes: [
    { id: "legacy-1", empresa: "Legado sem dimensões", tese_ativa_id: null, criado_em: null, atualizado_em: null },
    { id: "legacy-2", empresa: "Legado sem lançamentos", tese_ativa_id: null, criado_em: null, atualizado_em: null },
  ],
  comps: [],
  creditos: [],
  teses: [],
  processos: [],
  totais: [
    { cliente_id: "legacy-1", credito_apurado: 1_000, total_compensado: 100, saldo_restante: 900 },
    { cliente_id: "legacy-2", credito_apurado: 600, total_compensado: 0, saldo_restante: 600 },
  ],
  statusRows: [],
  esteira: [
    {
      id: "legacy-1",
      empresa: "Legado sem dimensões",
      cnpj: "",
      segmento: "",
      regime_tributario: "",
      estagio_esteira: null as unknown as string,
      data_entrada_estagio: "2026-09-01",
      dias_na_etapa: 20,
      responsavel_id: null,
      responsavel_nome: null,
      origem: "manual",
      status: "ativo",
      status_operacional: null,
      criado_em: "2026-09-01",
    },
    {
      id: "legacy-2",
      empresa: "Legado sem lançamentos",
      cnpj: "",
      segmento: "",
      regime_tributario: "",
      estagio_esteira: "triagem",
      data_entrada_estagio: "2026-09-01",
      dias_na_etapa: 2,
      responsavel_id: null,
      responsavel_nome: null,
      origem: "manual",
      status: "ativo",
      status_operacional: null,
      criado_em: "2026-09-01",
    },
  ],
  slaConfig: [
    { estagio: "triagem", label: "Triagem", sla_dias: 3, ordem: 1, ativo: true },
  ],
  esteiraHistorico: [],
  acoes: [],
  nomes: {},
  intimacoes: [],
  qualidade: {
    compensacoesForaDaCarteiraAtiva: 0,
    lancamentosForaDaRegraCanonica: 0,
    statusForaDaCarteiraAtiva: 0,
    clientesSemBaseFinanceira: 2,
    clientesComSnapshotManual: 0,
    clientesSemEtapa: 1,
    clientesEmEtapaSemConfig: 0,
    clientesSemStatusCompensacao: 2,
    clientesSemTipoRecuperacao: 2,
    fontesIndisponiveis: ["status de compensação"],
  },
};

describe("OperationalView com base legada", () => {
  it("mantém clientes e totais visíveis quando dimensões e lançamentos faltam", () => {
    render(
      <MemoryRouter>
        <OperationalView data={data} navigate={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/2 clientes no recorte · tese: elegíveis \(REPORTO fora do saldo\) · 0 ativos fora/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Saldo a compensar: 1500" })).toBeInTheDocument();
    expect(screen.getByText(/2 sem status de compensação/)).toBeInTheDocument();
    expect(screen.getByText(/2 sem tipo de recuperação/)).toBeInTheDocument();
    expect(screen.getByText(/fontes indisponíveis: status de compensação/)).toBeInTheDocument();
    expect(screen.getByText("Onde os clientes estão")).toBeInTheDocument();
  });
});
