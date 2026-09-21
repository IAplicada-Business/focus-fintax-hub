import { describe, expect, it } from "vitest";
import {
  CLIENTE_STATUS_COMPENSACAO,
  isStatusProcessoEditavel,
  podeEditarFichaCliente,
  statusProcessoEditaveis,
  tiposRecuperacaoDistintos,
} from "@/lib/client-operation";
import { normalizarStatusCompensacao } from "@/lib/gerencial-filters";

describe("modelo operacional da ficha do cliente", () => {
  it("oferece somente os três status padrão de compensação", () => {
    expect(CLIENTE_STATUS_COMPENSACAO.map((item) => item.value)).toEqual([
      "compensando",
      "reporto",
      "encerrado",
    ]);
  });

  it("trata prevista e sem operação do legado como qualidade de dados", () => {
    expect(
      normalizarStatusCompensacao({
        cliente_id: "legado-prevista",
        status_principal: "prevista",
        tem_tese_ativa: true,
      }),
    ).toBe("sem_operacao");
    expect(
      normalizarStatusCompensacao({
        cliente_id: "legado-sem-operacao",
        status_principal: "sem_operacao",
      }),
    ).toBe("sem_operacao");
  });

  it("mantém sinais reais reconhecidos em linhas com formato legado", () => {
    expect(
      normalizarStatusCompensacao({
        cliente_id: "flag-manual-real",
        status_principal: "prevista",
        tem_compensacao_mes_corrente: true,
      }),
    ).toBe("compensando");
    expect(
      normalizarStatusCompensacao({
        cliente_id: "reporto-minusculo",
        status_principal: null,
        tem_reporto: true,
      }),
    ).toBe("reporto");
  });

  it("restringe pedido feito pela Receita a REPORTO", () => {
    expect(
      statusProcessoEditaveis(false).map((item) => item.value),
    ).toEqual(["a_compensar", "compensando", "compensado"]);
    expect(
      statusProcessoEditaveis(true).map((item) => item.value),
    ).toContain("pedido_feito_receita");
    expect(isStatusProcessoEditavel("pedido_feito_receita", false)).toBe(false);
    expect(isStatusProcessoEditavel("pedido_feito_receita", true)).toBe(true);
  });

  it.each(["nao_protocolado", "desistiu", "protocolado", "a_iniciar"])(
    "preserva %s como legado, mas não o oferece para nova seleção",
    (legacyStatus) => {
      expect(isStatusProcessoEditavel(legacyStatus, true)).toBe(false);
      expect(isStatusProcessoEditavel(legacyStatus, false)).toBe(false);
    },
  );

  it("resume tipos distintos sem perder o tipo de cada processo", () => {
    expect(
      tiposRecuperacaoDistintos([
        { tipo_recuperacao: "compensacao" },
        { tipo_recuperacao: "ressarcimento" },
        { tipo_recuperacao: "compensacao" },
        { tipo_recuperacao: "recuperacao_judicial" },
      ]),
    ).toEqual([
      { value: "compensacao", label: "Compensação" },
      { value: "ressarcimento", label: "Ressarcimento" },
      { value: "recuperacao_judicial", label: "Recuperação Judicial" },
    ]);
  });

  it("respeita papel e user_permissions na edição", () => {
    expect(podeEditarFichaCliente("gestor_tributario", [])).toBe(true);
    expect(
      podeEditarFichaCliente("pmo", [
        { screen_key: "clientes", can_access: true, read_only: true },
      ]),
    ).toBe(false);
    expect(
      podeEditarFichaCliente("comercial", [
        { screen_key: "clientes", can_access: true, read_only: false },
      ]),
    ).toBe(false);
  });
});
