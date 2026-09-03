import { describe, it, expect } from "vitest";
import {
  ESTEIRA_SLA_DIAS,
  ESTEIRA_STAGES,
  ESTEIRA_STAGES_TERMINAIS,
  isClienteAtrasadoSla,
  sugerirEstagioRealocacao,
} from "@/lib/esteira-constants";

describe("etapas novas da Fase 1 (nova_abordagem / devolutiva_cliente)", () => {
  it("existem no enum do app, com nova_abordagem antes de triagem e devolutiva no fim", () => {
    const values = ESTEIRA_STAGES.map((s) => s.value);
    expect(values[0]).toBe("nova_abordagem");
    expect(values[values.length - 1]).toBe("devolutiva_cliente");
    expect(values.indexOf("nova_abordagem")).toBeLessThan(values.indexOf("triagem"));
  });

  it("nova abordagem tem SLA; devolutiva é terminal e nunca atrasa", () => {
    expect(ESTEIRA_SLA_DIAS.nova_abordagem).toBe(5);
    expect(ESTEIRA_SLA_DIAS.devolutiva_cliente).toBeNull();
    expect(isClienteAtrasadoSla("nova_abordagem", 5)).toBe(false);
    expect(isClienteAtrasadoSla("nova_abordagem", 6)).toBe(true);
    expect(isClienteAtrasadoSla("devolutiva_cliente", 999)).toBe(false);
    expect(ESTEIRA_STAGES_TERMINAIS).toEqual(["concluido", "devolutiva_cliente"]);
  });
});

describe("sugerirEstagioRealocacao (organizar esteira herdada da importação)", () => {
  it("quem já saiu da Triagem mantém a etapa atual", () => {
    expect(sugerirEstagioRealocacao("compensando", "em_compensacao").estagio).toBe("em_compensacao");
    expect(sugerirEstagioRealocacao("sem_operacao", "levantamento").estagio).toBe("levantamento");
  });

  it("status operacional ativo vai pra Em Compensação", () => {
    for (const st of ["compensando", "reporto", "prevista", "ressarcimento", "judicial"]) {
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
