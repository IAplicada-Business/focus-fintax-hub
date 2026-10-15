import { describe, expect, it } from "vitest";
import {
  PRODUTOS_LEAD,
  PRODUTO_LEAD_LABEL,
  PRODUTO_LEAD_PADRAO,
  filtrarPorProduto,
  lerFiltroProduto,
  normalizarProdutoLead,
  salvarFiltroProduto,
} from "@/lib/produto-lead";
import { filtrarPorResponsavel, iniciais, primeiroNome } from "@/lib/equipe-comercial";
import { ORIGENS } from "@/lib/pipeline-constants";
import { ORIGEM_LEAD_LABEL } from "@/lib/comercial-analytics";

describe("produto do lead", () => {
  it("tem os três produtos do grupo com rótulos e AGF Fintax como padrão", () => {
    expect(PRODUTOS_LEAD.map((p) => p.value)).toEqual(["agf_contabil", "agf_fintax", "agf_tax"]);
    expect(PRODUTO_LEAD_LABEL.agf_contabil).toBe("AGF Contábil");
    expect(PRODUTO_LEAD_LABEL.agf_fintax).toBe("AGF Fintax");
    expect(PRODUTO_LEAD_LABEL.agf_tax).toBe("AGF Tax");
    expect(PRODUTO_LEAD_PADRAO).toBe("agf_fintax");
  });

  it("normaliza texto livre da planilha", () => {
    expect(normalizarProdutoLead("Contábil")).toBe("agf_contabil");
    expect(normalizarProdutoLead("contabilidade")).toBe("agf_contabil");
    expect(normalizarProdutoLead("AGF Contabil")).toBe("agf_contabil");
    expect(normalizarProdutoLead("Fintex")).toBe("agf_fintax");
    expect(normalizarProdutoLead("FINTAX")).toBe("agf_fintax");
    expect(normalizarProdutoLead("recuperação de crédito")).toBe("agf_fintax");
    expect(normalizarProdutoLead("ATAX")).toBe("agf_tax");
    expect(normalizarProdutoLead("tax")).toBe("agf_tax");
    expect(normalizarProdutoLead("agf_tax")).toBe("agf_tax");
    expect(normalizarProdutoLead("")).toBeNull();
    expect(normalizarProdutoLead(null)).toBeNull();
    expect(normalizarProdutoLead("xpto")).toBeNull();
  });

  it("filtra por produto tratando lead antigo sem produto como AGF Fintax", () => {
    const leads = [
      { id: "1", produto: "agf_contabil" },
      { id: "2", produto: null },
      { id: "3", produto: "agf_tax" },
    ];
    expect(filtrarPorProduto(leads, "todos")).toHaveLength(3);
    expect(filtrarPorProduto(leads, "agf_fintax").map((l) => l.id)).toEqual(["2"]);
    expect(filtrarPorProduto(leads, "agf_contabil").map((l) => l.id)).toEqual(["1"]);
  });

  it("persiste o filtro no storage e ignora valor desconhecido", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => {
        store.set(k, v);
      },
    };
    expect(lerFiltroProduto(storage)).toBe("todos");
    salvarFiltroProduto("agf_tax", storage);
    expect(store.get("focus.pipeline.produto")).toBe("agf_tax");
    expect(lerFiltroProduto(storage)).toBe("agf_tax");
    store.set("focus.pipeline.produto", "lixo");
    expect(lerFiltroProduto(storage)).toBe("todos");
    expect(lerFiltroProduto(null)).toBe("todos");
  });
});

describe("equipe comercial", () => {
  it("gera iniciais e primeiro nome", () => {
    expect(iniciais("Ágatha Souza Lima")).toBe("ÁL");
    expect(iniciais("Sampaio")).toBe("SA");
    expect(iniciais("")).toBe("?");
    expect(primeiroNome("Maurício Alves")).toBe("Maurício");
  });

  it("filtra por responsável (SDR ou closer) e por 'sem responsável'", () => {
    const leads: { id: string; sdr_id: string | null; closer_id: string | null }[] = [
      { id: "1", sdr_id: "a", closer_id: null },
      { id: "2", sdr_id: null, closer_id: "b" },
      { id: "3", sdr_id: null, closer_id: null },
    ];
    expect(filtrarPorResponsavel(leads, "todos")).toHaveLength(3);
    expect(filtrarPorResponsavel(leads, "sem").map((l) => l.id)).toEqual(["3"]);
    expect(filtrarPorResponsavel(leads, "a").map((l) => l.id)).toEqual(["1"]);
    expect(filtrarPorResponsavel(leads, "b").map((l) => l.id)).toEqual(["2"]);
  });
});

describe("origens", () => {
  it("renomeia referência para Indicação e inclui Parceria nos dois mapas", () => {
    expect(ORIGENS.find((o) => o.value === "referencia")?.label).toBe("Indicação");
    expect(ORIGENS.find((o) => o.value === "parceria")?.label).toBe("Parceria");
    expect(ORIGEM_LEAD_LABEL.referencia).toBe("Indicação");
    expect(ORIGEM_LEAD_LABEL.parceria).toBe("Parceria");
  });
});
