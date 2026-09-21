import { describe, it, expect } from "vitest";
import {
  ESTEIRA_SLA_DIAS,
  ESTEIRA_ALL_STAGES,
  ESTEIRA_STAGES,
  ESTEIRA_STAGES_TERMINAIS,
  esteiraStageLabel,
  isClienteAtrasadoSla,
  isEstagioEsteira,
  sugerirEstagioRealocacao,
} from "@/lib/esteira-constants";

describe("separação entre funil comercial e esteira operacional", () => {
  it("não oferece nova_abordagem como destino operacional", () => {
    const values = ESTEIRA_STAGES.map((s) => s.value);
    expect(values[0]).toBe("triagem");
    expect(values).toEqual([
      "triagem",
      "contrato_emitido",
      "contrato_assinado",
      "em_compensacao",
      "compensado",
      "concluido",
    ]);
    expect(values).not.toContain("nova_abordagem");
  });

  it("preserva nova_abordagem apenas para histórico e mantém devolutiva terminal", () => {
    expect(ESTEIRA_ALL_STAGES.map((s) => s.value)).toContain("nova_abordagem");
    expect(isEstagioEsteira("nova_abordagem")).toBe(true);
    expect(esteiraStageLabel("nova_abordagem")).toContain("legado comercial");
    expect(ESTEIRA_SLA_DIAS.nova_abordagem).toBe(5);
    expect(isClienteAtrasadoSla("concluido", 999)).toBe(false);
    expect(ESTEIRA_STAGES_TERMINAIS).toEqual(["concluido"]);
  });
});

describe("sugerirEstagioRealocacao (organizar esteira herdada da importação)", () => {
  it("quem já saiu da Triagem mantém a etapa atual", () => {
    expect(sugerirEstagioRealocacao("compensando", "em_compensacao").estagio).toBe("em_compensacao");
    expect(sugerirEstagioRealocacao("sem_operacao", "levantamento").estagio).toBe("levantamento");
  });

  it("status operacional ativo vai pra Em Compensação", () => {
    for (const st of ["compensando", "reporto", "prevista"]) {
      expect(sugerirEstagioRealocacao(st, "triagem").estagio).toBe("em_compensacao");
    }
  });

  it("aceita aliases legados de ramo sem misturá-los na lista de status", () => {
    for (const st of ["ressarcimento", "judicial"]) {
      expect(sugerirEstagioRealocacao(st, "triagem").estagio).toBe("em_compensacao");
    }
  });

  it("encerrado vai pra Concluído", () => {
    expect(sugerirEstagioRealocacao("encerrado", "triagem").estagio).toBe("concluido");
  });

  it("sem operação ou status desconhecido fica em Triagem", () => {
    expect(sugerirEstagioRealocacao("sem_operacao", "triagem").estagio).toBe("triagem");
    expect(sugerirEstagioRealocacao(null, "triagem").estagio).toBe("triagem");
    expect(sugerirEstagioRealocacao("qualquer_coisa", "triagem").estagio).toBe("triagem");
  });

  it("estágio atual inválido cai em Triagem em vez de propagar lixo pro banco", () => {
    expect(sugerirEstagioRealocacao("compensando", "xyz").estagio).toBe("triagem");
  });

  it("sempre explica o motivo", () => {
    expect(sugerirEstagioRealocacao("prevista", "triagem").motivo.length).toBeGreaterThan(0);
  });
});
