import { describe, expect, it } from "vitest";
import { normalizeTeseCatalogCodigo, TESES_OFICIAIS } from "@/lib/clientes-constants";
import { listarTiposTese } from "@/lib/tese-filter";
import {
  STATUS_COMPENSACAO_VALUES,
  STATUS_FILTRO_EMPRESA,
  STATUS_FILTRO_VALUES,
  buildRamoFlagsPorCliente,
  buildTeseFlagsPorCliente,
  contarPorFiltroStatus,
  countByStatus,
  makeStatusFilterPredicate,
  modoFiltroStatus,
  type StatusCompensacao,
} from "@/lib/gerencial-filters";
import { RAMO_GERENCIAL_FILTROS } from "@/lib/esteira-acompanhamento";
import { STATUS_COMPENSACAO_LABELS } from "@/components/StatusCompensacaoFilter";
import { makeRecorteGerencial } from "@/lib/recorte-gerencial";
import type { CompLike, ProcessoLike, TeseLike } from "@/lib/operacional-analytics";

describe("item 2 · teses oficiais", () => {
  it("padroniza todas as variações cadastradas nas 6 teses", () => {
    const casos: Array<[string, string, string]> = [
      ["insumos", "Insumos", "INSUMOS"],
      ["pis_cofins_insumos", "PIS/COFINS Insumos", "INSUMOS"],
      ["subvencao", "Subvenção de ICMS", "SUBVENCAO"],
      ["subvencao_icms", "Subvenção de ICMS — Crédito Tributário", "SUBVENCAO"],
      ["SUBVENCAO", "Subvenção ICMS IRPJ e CSLL", "SUBVENCAO"],
      ["exclusao_icms_st", "Exclusão ICMS-ST", "ICMS_ST"],
      ["icms_st_bc_pis_cofins", "ICMS-ST da BC PIS/COFINS", "ICMS_ST"],
      ["pis_cofins_bc", "PIS/COFINS BC", "PIS_COFINS_JUD"],
      ["EXCLUSAO_ICMS_BC", "", "PIS_COFINS_JUD"],
      ["exclusao_icms_normal", "Exclusão ICMS da Base PIS/COFINS", "PIS_COFINS_JUD"],
      ["previdenciario_V.I", "Previdenciaria Verbas Indenizatórias", "PREVIDENCIARIO"],
      ["reporto", "REPORTO", "REPORTO"],
    ];
    for (const [tese, nome, esperado] of casos) {
      expect(normalizeTeseCatalogCodigo(tese, nome), `${tese} / ${nome}`).toBe(esperado);
    }
  });

  it("filtro de tese mostra exatamente as 6 opções, com os nomes oficiais", () => {
    const teses: TeseLike[] = [
      { id: "t-ins", codigo: "INSUMOS", label: "Créditos de PIS/COFINS sobre Insumos" },
      { id: "t-exc", codigo: "EXCLUSAO_ICMS_BC", label: "Exclusão ICMS base PIS/COFINS" },
    ];
    const processos: ProcessoLike[] = [
      { id: "p1", cliente_id: "a", tese: "subvencao", nome_exibicao: "Subvenção de ICMS", criado_em: null },
      { id: "p2", cliente_id: "a", tese: "subvencao_icms", nome_exibicao: "Subvenção ICMS", criado_em: null },
      { id: "p3", cliente_id: "b", tese: "pis_cofins_bc", nome_exibicao: "PIS/COFINS BC", criado_em: null },
    ];
    const creditos = [{ cliente_id: "c", tese_id: "t-exc", valor_apurado_inicial: 10 }];
    const opcoes = listarTiposTese(processos, creditos, teses);

    expect(opcoes.map((o) => o.label)).toEqual([
      "Insumos de PIS/COFINS",
      "Subvenção IRPJ/CSLL",
      "Créditos Previdenciários",
      "Exclusão ICMS-ST da base PIS/COFINS",
      "PIS/COFINS da Base — Via Judicial",
      "Reporto",
    ]);
    expect(opcoes.map((o) => o.value)).toEqual(TESES_OFICIAIS.map((t) => t.codigo));
    // Duplicata do mesmo cliente conta 1; crédito legado EXCLUSAO_ICMS_BC entra no judicial.
    expect(opcoes.find((o) => o.value === "SUBVENCAO")?.clientes).toBe(1);
    expect(opcoes.find((o) => o.value === "PIS_COFINS_JUD")?.clientes).toBe(2);
  });
});

describe("item 1 · status compensação", () => {
  it("tem 5 opções com os rótulos pedidos", () => {
    expect(STATUS_FILTRO_VALUES.map((s) => STATUS_COMPENSACAO_LABELS[s])).toEqual([
      "Total Compensados",
      "Possíveis recebimentos",
      "Encerrado / Liquidado",
      "Recuperação Judicial",
      "Ressarcimento concluído",
    ]);
  });

  it("Reporto / Recuperação Judicial recortam pela tese cadastrada; Ressarcimento concluído pelo status da empresa", () => {
    // AGF 15/10: a empresa Total Compensados que também tem via judicial
    // entra em "Recuperação Judicial" (o card mostra só a tese judicial) e
    // continua em "Total Compensados" (só as teses administrativas). Antes
    // as duas opções olhavam o status da empresa e os valores não batiam.
    const status = new Map<string, StatusCompensacao>([
      ["comp-com-judicial", "compensando"],
      ["jud", "recuperacao_judicial"],
      ["res-ok", "ressarcimento_concluido"],
      ["comp", "compensando"],
      ["comp-com-reporto", "compensando"],
    ]);
    const teseFlags = buildTeseFlagsPorCliente([
      { cliente_id: "comp-com-judicial", tese: "PIS_COFINS_JUD", categoria: "recuperacao_judicial" },
      { cliente_id: "comp-com-judicial", tese: "INSUMOS", categoria: "compensacao" },
      { cliente_id: "comp-com-reporto", tese: "REPORTO", categoria: "reporto" },
      { cliente_id: "res-ok", tese: "INSUMOS", categoria: "compensacao", tipo_recuperacao: "ressarcimento" },
      { cliente_id: "comp", tese: "INSUMOS", categoria: "compensacao" },
    ]);
    const ids = ["comp-com-judicial", "jud", "res-ok", "comp", "comp-com-reporto"];
    const filtra = (sel: StatusCompensacao[]) =>
      ids.filter(makeStatusFilterPredicate(new Set(sel), status, teseFlags));

    expect(filtra(["recuperacao_judicial"])).toEqual(["comp-com-judicial", "jud"]);
    expect(filtra(["reporto"])).toEqual(["comp-com-reporto"]);
    expect(filtra(["ressarcimento_concluido"])).toEqual(["res-ok"]);
    expect(filtra(["compensando"])).toEqual(["comp-com-judicial", "comp", "comp-com-reporto"]);
    expect(filtra(["compensando", "recuperacao_judicial"])).toEqual(["comp-com-judicial", "jud", "comp", "comp-com-reporto"]);
    expect(filtra([...STATUS_FILTRO_VALUES])).toEqual(ids);
    expect(filtra([...STATUS_FILTRO_EMPRESA])).toEqual(["comp-com-judicial", "res-ok", "comp", "comp-com-reporto"]);

    const counts = contarPorFiltroStatus(ids, status, teseFlags);
    expect(counts).toMatchObject({ compensando: 3, reporto: 1, recuperacao_judicial: 2, ressarcimento_concluido: 1 });
  });

  it("só opção por tese marcada troca o recorte dos cards para essa tese", () => {
    expect(modoFiltroStatus(new Set(["reporto"]))).toMatchObject({ soTese: true, codigosTese: ["REPORTO"] });
    expect(modoFiltroStatus(new Set(["reporto", "recuperacao_judicial"]))).toMatchObject({
      soTese: true,
      codigosTese: ["REPORTO", "PIS_COFINS_JUD"],
    });
    expect(modoFiltroStatus(new Set(["compensando", "reporto"]))).toMatchObject({ soTese: false, empresa: ["compensando"] });
    expect(modoFiltroStatus(new Set(STATUS_FILTRO_VALUES))).toMatchObject({ tudo: true, soTese: false });
  });
});

describe("item 3 · tipo de recuperação", () => {
  it("filtro gerencial tem só Administrativo, Ressarcimento e Recuperação Judicial", () => {
    expect(
      RAMO_GERENCIAL_FILTROS.filter((r) => r.value !== "todas").map((r) => r.label),
    ).toEqual(["Administrativo", "Ressarcimento", "Recuperação Judicial"]);
  });
});

describe("item 4 · Ressarcimento: badge = lista", () => {
  it("cliente de ressarcimento sem compensação no mês aparece e o contador bate", () => {
    const processos: ProcessoLike[] = [
      { id: "p1", cliente_id: "comp", tese: "INSUMOS", criado_em: "2026-01-10", status_contrato: "assinado", status_processo: "compensando", tipo_recuperacao: "compensacao" },
      { id: "p2", cliente_id: "res1", tese: "REPORTO", categoria: "reporto", criado_em: "2026-01-10", status_contrato: "assinado", status_processo: "pedido_feito_receita", tipo_recuperacao: "ressarcimento" },
      { id: "p3", cliente_id: "res2", tese: "REPORTO", categoria: "reporto", criado_em: "2026-02-10", status_contrato: "assinado", status_processo: "pedido_feito_receita", tipo_recuperacao: "ressarcimento" },
    ];
    const comps: CompLike[] = [
      { cliente_id: "comp", mes_referencia: "2026-09-01", valor_compensado: 100, processo_tese_id: "p1" },
    ];
    const recorte = makeRecorteGerencial({
      clienteIds: ["comp", "res1", "res2"],
      statusMap: new Map<string, StatusCompensacao>([["comp", "compensando"], ["res1", "reporto"], ["res2", "reporto"]]),
      ramosMap: buildRamoFlagsPorCliente(processos),
      tipoTese: [],
      periodo: { mode: "month", month: "2026-09" },
      processos,
      creditos: [],
      teses: [],
      comps,
    });
    const todos = new Set<StatusCompensacao>(STATUS_FILTRO_VALUES);
    const lista = recorte.recortePara("ressarcimento", todos);
    const { ramoCounts } = recorte.contagens("ressarcimento", todos);

    expect([...lista].sort()).toEqual(["res1", "res2"]);
    expect(ramoCounts.ressarcimento).toBe(lista.size);
    // Administrativo segue o recorte do período (só quem movimentou no mês).
    expect(ramoCounts.administrativo).toBe(recorte.recortePara("administrativo", todos).size);
  });
});

describe("item 1 · status escolhido no cadastro", () => {
  it("o cadastro oferece as 5 opções", async () => {
    const { CLIENTE_STATUS_COMPENSACAO } = await import("@/lib/client-operation");
    expect(CLIENTE_STATUS_COMPENSACAO.map((s) => s.label)).toEqual([
      "Total Compensados",
      "Possíveis recebimentos",
      "Encerrado / Liquidado",
      "Recuperação Judicial",
      "Ressarcimento concluído",
    ]);
  });

  it("status extra gravado no cliente vale no filtro e no contador", async () => {
    const { normalizarStatusCompensacao } = await import("@/lib/gerencial-filters");
    const status = new Map<string, StatusCompensacao>([
      ["jud", normalizarStatusCompensacao({ cliente_id: "jud", status_principal: "recuperacao_judicial", tem_compensacao_mes_corrente: true })],
      ["res", normalizarStatusCompensacao({ cliente_id: "res", status_principal: "ressarcimento_concluido" })],
      ["comp", normalizarStatusCompensacao({ cliente_id: "comp", status_principal: "compensando" })],
    ]);
    const ids = ["jud", "res", "comp"];
    const filtra = (sel: StatusCompensacao[]) =>
      ids.filter(makeStatusFilterPredicate(new Set(sel), status));

    expect(status.get("jud")).toBe("recuperacao_judicial");
    expect(filtra(["recuperacao_judicial"])).toEqual(["jud"]);
    expect(filtra(["ressarcimento_concluido"])).toEqual(["res"]);
    expect(filtra(["compensando", "encerrado"])).toEqual(["comp"]);
    expect(filtra([...STATUS_FILTRO_VALUES])).toEqual(ids);

    const counts = countByStatus(ids, status);
    expect(counts).toMatchObject({ compensando: 1, recuperacao_judicial: 1, ressarcimento_concluido: 1 });
  });
});
