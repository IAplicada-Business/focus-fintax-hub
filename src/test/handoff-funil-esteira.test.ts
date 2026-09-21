import { describe, expect, it } from "vitest";
import {
  avancarEstagioEsteira,
  estagioEsteiraDoFunil,
  funilEntraNaEsteira,
} from "@/lib/handoff-funil-esteira";

describe("handoff funil comercial → esteira operacional", () => {
  it("só entrega o lead na esteira no fechamento comercial", () => {
    expect(funilEntraNaEsteira("em_apresentacao")).toBe(false);
    expect(funilEntraNaEsteira("contrato_emitido")).toBe(true);
    expect(funilEntraNaEsteira("cliente_ativo")).toBe(true);
    expect(funilEntraNaEsteira("perdido")).toBe(false);
  });

  it("não recomeça a operação quando o contrato já saiu do comercial", () => {
    expect(estagioEsteiraDoFunil("contrato_emitido", "em_apresentacao")).toBe("receber_assinado");
    expect(estagioEsteiraDoFunil("cliente_ativo", "contrato_emitido")).toBe("receber_assinado");
    expect(estagioEsteiraDoFunil("cliente_ativo", "cliente_ativo")).toBe("receber_assinado");
  });

  it("conversão antecipada entra em triagem", () => {
    expect(estagioEsteiraDoFunil("cliente_ativo", "em_apresentacao")).toBe("triagem");
    expect(estagioEsteiraDoFunil("cliente_ativo", "qualificado")).toBe("triagem");
  });

  it("nunca volta etapa da esteira já avançada", () => {
    expect(avancarEstagioEsteira("em_compensacao", "receber_assinado")).toBe("em_compensacao");
    expect(avancarEstagioEsteira("triagem", "receber_assinado")).toBe("receber_assinado");
    expect(avancarEstagioEsteira(null, "triagem")).toBe("triagem");
  });
});
