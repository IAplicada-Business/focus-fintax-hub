import { describe, expect, it } from "vitest";
import {
  chaveDedupe,
  deduplicarLeads,
  detectarLinhaCabecalho,
  detectarMapeamento,
  elegivelDiagnostico,
  formatarCnpj,
  formatarTelefoneBR,
  linhasParaLeads,
  normalizarCnpj,
  normalizarFaturamentoFaixa,
  normalizarRegime,
  normalizarSegmento,
  normalizarTelefoneBR,
  parseFaturamentoNumero,
  type ConfigLote,
} from "@/lib/import-leads-parser";

describe("detectarMapeamento", () => {
  it("reconhece sinônimos em português, com acento e maiúsculas", () => {
    const m = detectarMapeamento([
      "Razão Social",
      "Nome do Contato",
      "CNPJ",
      "E-mail",
      "WhatsApp",
      "Faturamento Mensal",
      "Regime Tributário",
      "Ramo de Atividade",
      "Município",
      "UF",
      "Produto",
    ]);
    expect(m).toEqual({
      empresa: 0,
      nome: 1,
      cnpj: 2,
      email: 3,
      telefone: 4,
      faturamento: 5,
      regime: 6,
      segmento: 7,
      cidade: 8,
      uf: 9,
      produto: 10,
    });
  });

  it("não confunde 'Nome Fantasia' com nome do contato nem repete coluna", () => {
    const m = detectarMapeamento(["Nome Fantasia", "Responsável", "Telefone", "Celular", "Estado"]);
    expect(m.empresa).toBe(0);
    expect(m.nome).toBe(1);
    // celular/whatsapp tem prioridade sobre telefone fixo
    expect(m.telefone).toBe(3);
    expect(m.uf).toBe(4);
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
  });

  it("acha a linha de cabeçalho quando a planilha tem título em cima", () => {
    const linhas = [
      ["Lista Contábil - Outubro", "", ""],
      ["", "", ""],
      ["Empresa", "CNPJ", "Telefone"],
      ["ACME", "12345678000195", "11999998888"],
    ];
    expect(detectarLinhaCabecalho(linhas)).toBe(2);
    expect(detectarLinhaCabecalho([["Empresa", "CNPJ"], ["X", "Y"]])).toBe(0);
  });
});

describe("normalizações", () => {
  it("CNPJ: só 14 dígitos; número do Excel recupera zero à esquerda", () => {
    expect(normalizarCnpj("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizarCnpj("12.345.678.0001-95")).toBe("12345678000195");
    expect(normalizarCnpj(1234567800019)).toBe("01234567800019");
    expect(normalizarCnpj("123")).toBe("");
    expect(normalizarCnpj("")).toBe("");
    expect(formatarCnpj("12345678000195")).toBe("12.345.678/0001-95");
  });

  it("telefone BR: tira +55, aceita fixo e celular, rejeita curto", () => {
    expect(normalizarTelefoneBR("+55 (11) 91234-5678")).toBe("11912345678");
    expect(normalizarTelefoneBR("5511912345678")).toBe("11912345678");
    expect(normalizarTelefoneBR("(11) 3456-7890")).toBe("1134567890");
    expect(normalizarTelefoneBR(11912345678)).toBe("11912345678");
    expect(normalizarTelefoneBR("1234")).toBe("");
    expect(formatarTelefoneBR("11912345678")).toBe("(11) 91234-5678");
    expect(formatarTelefoneBR("1134567890")).toBe("(11) 3456-7890");
  });

  it("faturamento: número, R$, 'mi'/'mil' e faixas descritas → faixa do formulário", () => {
    expect(parseFaturamentoNumero("R$ 1.500.000,00")).toBe(1_500_000);
    expect(parseFaturamentoNumero("1,5 mi")).toBe(1_500_000);
    expect(parseFaturamentoNumero("800 mil")).toBe(800_000);
    expect(parseFaturamentoNumero("2M")).toBe(2_000_000);
    expect(normalizarFaturamentoFaixa(300_000)).toBe("ate_500k");
    expect(normalizarFaturamentoFaixa("R$ 1.500.000")).toBe("500k_2m");
    expect(normalizarFaturamentoFaixa("3 milhões")).toBe("2m_5m");
    expect(normalizarFaturamentoFaixa("Até R$ 500 mil")).toBe("ate_500k");
    expect(normalizarFaturamentoFaixa("R$ 2 milhões – R$ 5 milhões")).toBe("2m_5m");
    expect(normalizarFaturamentoFaixa("Acima de R$ 15 milhões")).toBe("acima_15m");
    expect(normalizarFaturamentoFaixa("5m_15m")).toBe("5m_15m");
    expect(normalizarFaturamentoFaixa("não sei")).toBe("");
    expect(normalizarFaturamentoFaixa("")).toBe("");
  });

  it("regime: mapeia para os rótulos exatos de REGIMES", () => {
    expect(normalizarRegime("lucro real")).toBe("Lucro Real");
    expect(normalizarRegime("LR")).toBe("Lucro Real");
    expect(normalizarRegime("Presumido")).toBe("Lucro Presumido");
    expect(normalizarRegime("Simples")).toBe("Simples Nacional");
    expect(normalizarRegime("SN")).toBe("Simples Nacional");
    expect(normalizarRegime("MEI")).toBe("Simples Nacional");
    expect(normalizarRegime("imune")).toBe("");
  });

  it("segmento: cai em 'outros' quando não reconhece", () => {
    expect(normalizarSegmento("Supermercado")).toBe("supermercado");
    expect(normalizarSegmento("Drogaria")).toBe("farmacia");
    expect(normalizarSegmento("Pet shop")).toBe("pet");
    expect(normalizarSegmento("Materiais de Construção")).toBe("materiais_construcao");
    expect(normalizarSegmento("Indústria")).toBe("outros");
    expect(normalizarSegmento("")).toBe("outros");
  });
});

describe("linhasParaLeads", () => {
  const mapeamento = detectarMapeamento(["Empresa", "Contato", "CNPJ", "Telefone", "E-mail", "Faturamento", "Regime", "Cidade", "UF", "Produto"]);
  const lote: ConfigLote = { produto: "agf_contabil", origem: "prospeccao_ativa", sdrId: "sdr-1", closerId: null };

  it("monta o lead com defaults do lote e joga cidade/UF nas observações", () => {
    const { leads, invalidos } = linhasParaLeads(
      [
        ["ACME Ltda", "João", "12.345.678/0001-95", "+55 11 91234-5678", "JOAO@ACME.COM", "R$ 1.500.000", "Lucro Real", "Campinas", "sp", ""],
        ["", "", "", "", "", "", "", "", "", ""],
        ["Só Empresa", "", "", "", "", "", "", "Belo Horizonte", "", "ATAX"],
      ],
      mapeamento,
      lote,
      1,
    );
    expect(invalidos).toEqual([{ linha_planilha: 3, motivo: "Sem nome e sem empresa" }]);
    expect(leads).toHaveLength(2);
    const [a, b] = leads;
    expect(a.linha_planilha).toBe(2);
    expect(a.nome).toBe("João");
    expect(a.empresa).toBe("ACME Ltda");
    expect(a.cnpj).toBe("12345678000195");
    expect(a.whatsapp).toBe("11912345678");
    expect(a.email).toBe("joao@acme.com");
    expect(a.faturamento_faixa).toBe("500k_2m");
    expect(a.regime_tributario).toBe("Lucro Real");
    expect(a.observacoes).toBe("Cidade/UF: Campinas/SP");
    expect(a.produto).toBe("agf_contabil");
    expect(a.origem).toBe("prospeccao_ativa");
    expect(a.sdr_id).toBe("sdr-1");
    expect(a.closer_id).toBeNull();
    // sem nome: repete a empresa; produto da coluna vence o do lote
    expect(b.nome).toBe("Só Empresa");
    expect(b.produto).toBe("agf_tax");
    expect(b.observacoes).toBe("Cidade/UF: Belo Horizonte");
    expect(b.segmento).toBe("outros");
    expect(elegivelDiagnostico(a)).toBe(true);
    expect(elegivelDiagnostico(b)).toBe(false);
  });
});

describe("deduplicarLeads", () => {
  it("chave: CNPJ, senão telefone, senão e-mail", () => {
    expect(chaveDedupe({ cnpj: "12.345.678/0001-95", whatsapp: "11999999999", email: "a@b.com" })).toBe("cnpj:12345678000195");
    expect(chaveDedupe({ cnpj: "", whatsapp: "(11) 99999-9999", email: "a@b.com" })).toBe("tel:11999999999");
    expect(chaveDedupe({ cnpj: "", whatsapp: "", email: "A@B.com" })).toBe("email:a@b.com");
    expect(chaveDedupe({ cnpj: "", whatsapp: "", email: "" })).toBeNull();
  });

  it("separa repetidos no arquivo (fica o primeiro) dos já existentes no sistema", () => {
    const novos = [
      { id: "1", cnpj: "12345678000195", whatsapp: "", email: "" },
      { id: "2", cnpj: "12.345.678/0001-95", whatsapp: "", email: "" },
      { id: "3", cnpj: "", whatsapp: "11988887777", email: "" },
      { id: "4", cnpj: "", whatsapp: "+55 11 98888-7777", email: "x@y.com" },
      { id: "5", cnpj: "", whatsapp: "", email: "Existente@Sistema.com" },
      { id: "6", cnpj: "", whatsapp: "", email: "" },
      { id: "7", cnpj: "", whatsapp: "", email: "" },
      { id: "8", cnpj: "", whatsapp: "21977776666", email: "" },
    ];
    const existentes = [
      { cnpj: "", whatsapp: "", email: "existente@sistema.com" },
      { cnpj: "", whatsapp: "(21) 97777-6666", email: "" },
    ];
    const r = deduplicarLeads(novos, existentes);
    expect(r.novos.map((l) => l.id)).toEqual(["1", "3", "6", "7"]);
    expect(r.duplicadosArquivo.map((l) => l.id)).toEqual(["2", "4"]);
    expect(r.jaExistentes.map((l) => l.id)).toEqual(["5", "8"]);
  });
});
