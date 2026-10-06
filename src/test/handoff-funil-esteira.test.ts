import { describe, expect, it } from "vitest";
import {
  avancarEstagioEsteira,
  estagioEsteiraDoFunil,
  funilEntraNaEsteira,
} from "@/lib/handoff-funil-esteira";

describe("handoff funil comercial → esteira operacional", () => {
  it("sincroniza somente as etapas compartilhadas", () => {
    expect(funilEntraNaEsteira("apresentacao")).toBe(false);
    expect(funilEntraNaEsteira("triagem")).toBe(true);
    expect(funilEntraNaEsteira("contrato_emitido")).toBe(true);
    expect(funilEntraNaEsteira("contrato_assinado")).toBe(true);
    expect(funilEntraNaEsteira("ganho")).toBe(true);
    expect(funilEntraNaEsteira("perdido")).toBe(false);
  });

  it("mapeia o trecho conectado sem nomes divergentes", () => {
    expect(estagioEsteiraDoFunil("triagem")).toBe("triagem");
    expect(estagioEsteiraDoFunil("contrato_emitido")).toBe("contrato_emitido");
    expect(estagioEsteiraDoFunil("contrato_assinado")).toBe("contrato_assinado");
    expect(estagioEsteiraDoFunil("ganho")).toBe("em_compensacao");
  });

  it("não regride quem já está em Devolução Comercial quando o funil segue em Triagem", () => {
    expect(avancarEstagioEsteira("devolucao_comercial", "triagem")).toBe("devolucao_comercial");
    expect(avancarEstagioEsteira("devolucao_comercial", "contrato_emitido")).toBe("contrato_emitido");
  });

  it("nunca volta etapa da esteira já avançada", () => {
    expect(avancarEstagioEsteira("em_compensacao", "contrato_assinado")).toBe("em_compensacao");
    expect(avancarEstagioEsteira("triagem", "contrato_assinado")).toBe("contrato_assinado");
    expect(avancarEstagioEsteira(null, "triagem")).toBe("triagem");
  });
});
