import { describe, it, expect } from "vitest";
import {
  calcularDRE,
  calcularIbsCbs,
  calcularCenarios,
  configFromRows,
  CONFIG_DEFAULT,
  type FocusIndice,
  type ReformaConfig,
} from "../../supabase/functions/_shared/calc-motor";

// -----------------------------------------------------------------------------
// Fixture: 61 rubricas do Excel Alcir (col K)
// -----------------------------------------------------------------------------

const IDX: FocusIndice[] = [
  { segmento: "supermercado", grupo: "CMV", rubrica: "CMV",
    percentual_sobre_faturamento: 0.7400, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 1 },
  // Pessoal — folha CLT (12 rubricas, gera=false)
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Salários",
    percentual_sobre_faturamento: 0.04628, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 10 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Pró-Labore",
    percentual_sobre_faturamento: 0.0002, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 11 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Quebra de Caixa",
    percentual_sobre_faturamento: 0.0004, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 12 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Adicional noturno",
    percentual_sobre_faturamento: 0.0001, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 13 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Prêmios e Gratificações",
    percentual_sobre_faturamento: 0, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 14 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Horas extras",
    percentual_sobre_faturamento: 0.0012, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 15 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Férias",
    percentual_sobre_faturamento: 0.00483, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 16 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "13º Salário",
    percentual_sobre_faturamento: 0.0042, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 17 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "FGTS",
    percentual_sobre_faturamento: 0.00776, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 18 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "INSS",
    percentual_sobre_faturamento: 0.0166, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 19 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Multa rescisória FGTS",
    percentual_sobre_faturamento: 0.000348, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 20 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Aviso prévio/indenizações trabalhistas",
    percentual_sobre_faturamento: 0.00356, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 21 },
  // Pessoal — benefícios (7 rubricas, gera=true)
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Uniformes e EPIs",
    percentual_sobre_faturamento: 0.000248, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 22 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Vale Combustível",
    percentual_sobre_faturamento: 0, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 23 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Vale Transporte",
    percentual_sobre_faturamento: 0.0021348, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 24 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Despesas com Refeição",
    percentual_sobre_faturamento: 0.00214356, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 25 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Outros benefícios",
    percentual_sobre_faturamento: 0, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 26 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Exames Admissão/Periódico/Demissional",
    percentual_sobre_faturamento: 0.000214356, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 27 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Plano de Saúde/Dental",
    percentual_sobre_faturamento: 0.0024348, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 28 },
  // Adm (27 rubricas)
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Energia elétrica",
    percentual_sobre_faturamento: 0.0147314348, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 40 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Seguros",
    percentual_sobre_faturamento: 0.0006241393, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 41 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Telefones e Internet",
    percentual_sobre_faturamento: 0.0002911082, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 42 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Água e esgoto",
    percentual_sobre_faturamento: 0.0014959271, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 43 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Aluguel e Condomínios",
    percentual_sobre_faturamento: 0.0121309757, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 44 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Aluguel de Bens Móveis",
    percentual_sobre_faturamento: 0.0017034776, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 45 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Bens de pequeno valor",
    percentual_sobre_faturamento: 0.0006941149, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 46 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Gás",
    percentual_sobre_faturamento: 0.0009176801, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 47 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Taxa Aluguel Máq. Cartão",
    percentual_sobre_faturamento: 0.0001414713, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 48 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Legais e Judiciais",
    percentual_sobre_faturamento: 0.0011, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 49 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Manutenção e conservação",
    percentual_sobre_faturamento: 0.0042, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 50 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Bobina, Etiqueta e Bandejas",
    percentual_sobre_faturamento: 0.003438497, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 51 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Serviços de Terceiros PJ",
    percentual_sobre_faturamento: 0.0066, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 52 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Manutenção de Sistemas",
    percentual_sobre_faturamento: 0.0018886047, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 53 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Material de Informática",
    percentual_sobre_faturamento: 0.0002475075, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 54 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Combustíveis",
    percentual_sobre_faturamento: 0.0005951406, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 55 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Manutenção Veículos",
    percentual_sobre_faturamento: 0.0005008443, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 56 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Feiras/Congressos/Cursos",
    percentual_sobre_faturamento: 0.0000715783, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 57 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Material Uso e Consumo",
    percentual_sobre_faturamento: 0.0018493908, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 58 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Material Uso e Consumo MP",
    percentual_sobre_faturamento: 0.00812, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 59 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Lanches e Refeições",
    percentual_sobre_faturamento: 0, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 60 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Pedágios",
    percentual_sobre_faturamento: 0.0000297227, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 61 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Despesas com Obra",
    percentual_sobre_faturamento: 0.0024, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 62 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Material de escritório",
    percentual_sobre_faturamento: 0.0001782796, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 63 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Material de limpeza",
    percentual_sobre_faturamento: 0.0014603199, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 64 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Estacionamento",
    percentual_sobre_faturamento: 0.0002393656, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 65 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Desp. Operacionais de Loja",
    percentual_sobre_faturamento: 0.0069, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 66 },
  // Vendas (5 rubricas)
  { segmento: "supermercado", grupo: "Despesas com Vendas", rubrica: "Embalagens",
    percentual_sobre_faturamento: 0.0055462348, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 80 },
  { segmento: "supermercado", grupo: "Despesas com Vendas", rubrica: "Propaganda e Publicidade",
    percentual_sobre_faturamento: 0.002640549, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 81 },
  { segmento: "supermercado", grupo: "Despesas com Vendas", rubrica: "Fretes",
    percentual_sobre_faturamento: 0.0015722707, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 82 },
  { segmento: "supermercado", grupo: "Despesas com Vendas", rubrica: "Franquias",
    percentual_sobre_faturamento: 0.0034, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 83 },
  { segmento: "supermercado", grupo: "Despesas com Vendas", rubrica: "Associações",
    percentual_sobre_faturamento: 0.0009270614, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 84 },
  // Financeiras (9 rubricas)
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Despesas Bancárias",
    percentual_sobre_faturamento: 0.0000986985, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 100 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Outras Financeiras",
    percentual_sobre_faturamento: 0.0006732122, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 101 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "S/Vendas Cartão Crédito",
    percentual_sobre_faturamento: 0, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 102 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "S/Vendas Cartão Crédito/Débito/Benefícios",
    percentual_sobre_faturamento: 0.0109429947, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 103 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Bonificações Enviadas",
    percentual_sobre_faturamento: 0, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 104 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Multas Fiscais Punitivas",
    percentual_sobre_faturamento: 0.0003196735, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 105 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Juros s/Cheque Especial",
    percentual_sobre_faturamento: 0.0000004538, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 106 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Juros s/Empréstimos Bancários",
    percentual_sobre_faturamento: 0.0027371563, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 107 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Perdas e Avarias Estoque",
    percentual_sobre_faturamento: 0.0221, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 108 },
];

const FAT = 1_500_000;
const CFG: ReformaConfig = CONFIG_DEFAULT;

// -----------------------------------------------------------------------------
// DRE base — Excel Alcir Fat=1.500.000
// -----------------------------------------------------------------------------

describe("calcularDRE — Fat = R$ 1.500.000", () => {
  const dre = calcularDRE(FAT, IDX, CFG.cmv_pct_default);

  it("CMV = 74% do faturamento", () => {
    expect(dre.cmv).toBe(1_110_000);
  });
  it("Resultado Bruto = Fat - CMV = 390k", () => {
    expect(dre.resultado_bruto).toBe(390_000);
  });
  // Tolerância R$ 2 nos subtotais (0.5 é tight demais — motor soma 10dp enquanto
  // o pct de referência é 4dp truncado)
  const near = (v: number, target: number, tol = 2) => Math.abs(v - target) < tol;

  it("Subtotal Pessoal ≈ R$ 138.980 (Excel R24)", () => {
    const g = dre.grupos.find((g) => g.grupo === "Despesas com Pessoal")!;
    expect(near(g.subtotal, 138980, 2)).toBe(true);
    expect(g.rubricas.length).toBe(19);
  });
  it("Subtotal Adm ≈ R$ 108.824 (Excel R44)", () => {
    const g = dre.grupos.find((g) => g.grupo === "Desp. Gerais Administrativas")!;
    expect(near(g.subtotal, 108824, 2)).toBe(true);
    expect(g.rubricas.length).toBe(27);
  });
  it("Subtotal Vendas ≈ R$ 21.129 (Excel R72 corrigido D4 — sem bug K78)", () => {
    const g = dre.grupos.find((g) => g.grupo === "Despesas com Vendas")!;
    expect(near(g.subtotal, 21129, 2)).toBe(true);
    expect(g.rubricas.length).toBe(5);
  });
  it("Subtotal Financeiras ≈ R$ 55.308 (Excel R78)", () => {
    const g = dre.grupos.find((g) => g.grupo === "Despesas Financeiras")!;
    expect(near(g.subtotal, 55308, 2)).toBe(true);
    expect(g.rubricas.length).toBe(9);
  });
  it("Total Despesas Op ≈ R$ 324.242 (Excel R23)", () => {
    expect(near(dre.total_despesas_op, 324242, 3)).toBe(true);
  });
  it("Resultado antes impostos ≈ 4.38% × Fat", () => {
    expect(dre.resultado_antes_impostos_pct).toBeCloseTo(0.0438, 3);
  });
});

// -----------------------------------------------------------------------------
// IBS/CBS — CONGELAMENTO Fat=1.5M → saldo=-20.494 (D2 ground truth)
// -----------------------------------------------------------------------------

describe("calcularIbsCbs — Excel Fat=1.500.000 congelado", () => {
  const dre = calcularDRE(FAT, IDX, CFG.cmv_pct_default);
  const ibs = calcularIbsCbs(FAT, dre, IDX, CFG);

  it("base_venda = CMV × 1.29 = 1.431.900 (D1)", () => {
    expect(ibs.base_venda).toBe(1_431_900);
  });

  it("Débito total ≈ R$ 271.090 (Excel R21)", () => {
    expect(ibs.debito.total).toBeCloseTo(271090.17, 0);
  });
  it("Débito faixa cheia ≈ R$ 184.589 (Excel R19)", () => {
    expect(ibs.debito.cheia).toBeCloseTo(184589.09, 0);
  });
  it("Débito faixa redução ≈ R$ 64.710 (Excel R18)", () => {
    expect(ibs.debito.reducao).toBeCloseTo(64710.42, 0);
  });
  it("Débito faixa seletivo ≈ R$ 21.790 (Excel R20)", () => {
    expect(ibs.debito.seletivo).toBeCloseTo(21790.65, 0);
  });

  it("Crédito compras ≈ R$ 210.147 (Excel R16)", () => {
    expect(ibs.credito_bruto.compras).toBeCloseTo(210147.42, 0);
  });
  it("Crédito folha benefícios ≈ R$ 3.013 (Excel R90)", () => {
    expect(ibs.credito_bruto.folha_beneficios).toBeCloseTo(3013.72, 0);
  });
  it("Crédito Adm ≈ R$ 30.470 (Excel R91)", () => {
    expect(ibs.credito_bruto.adm).toBeCloseTo(30470.82, 0);
  });
  it("Crédito Vendas ≈ R$ 5.916 (Excel R92)", () => {
    expect(ibs.credito_bruto.vendas).toBeCloseTo(5916.17, 0);
  });
  it("Crédito Financeiras ≈ R$ 15.486 (Excel R93)", () => {
    expect(ibs.credito_bruto.financeiras).toBeCloseTo(15486.32, 0);
  });
  it("Crédito bruto total ≈ R$ 265.034 (Excel R88)", () => {
    expect(ibs.credito_bruto.total).toBeCloseTo(265034.44, 0);
  });

  it("Exclusão total ≈ R$ 14.438 (Excel R97)", () => {
    expect(ibs.exclusao.total).toBeCloseTo(14438.83, 0);
  });
  it("Exclusão inclui as 6 rubricas D3", () => {
    const nomes = ibs.exclusao.rubricas.map((r) => r.rubrica).sort();
    expect(nomes).toEqual([
      "Desp. Operacionais de Loja",
      "Juros s/Cheque Especial",
      "Juros s/Empréstimos Bancários",
      "Perdas e Avarias Estoque",
      "Propaganda e Publicidade",
      "S/Vendas Cartão Crédito",
    ]);
  });

  // GUARDRAIL PRINCIPAL — D2 ground truth
  it("GUARDRAIL: saldo total = crédito_bruto - débito - exclusão ≈ -R$ 20.494 (Excel D2)", () => {
    // Convenção Alcir: negativo = a pagar. Excel dá -20.494,55.
    // Tolerância R$ 1,00 pra arredondamento de ponto flutuante.
    expect(ibs.saldo).toBeCloseTo(-20494.55, -1);
    expect(Math.abs(ibs.saldo - (-20494.55))).toBeLessThan(1);
  });
  it("Saldo a pagar (magnitude) ≈ R$ 20.494", () => {
    expect(ibs.saldo_a_pagar).toBeCloseTo(20494.55, -1);
  });
  it("CBS = saldo × 0.3142857 ≈ -R$ 6.441", () => {
    expect(ibs.cbs_saldo).toBeCloseTo(-6441.14, -1);
  });
  it("IBS = saldo × 0.6857143 ≈ -R$ 14.053", () => {
    expect(ibs.ibs_saldo).toBeCloseTo(-14053.40, -1);
  });
});

// -----------------------------------------------------------------------------
// calcularCenarios wrapper
// -----------------------------------------------------------------------------

describe("calcularCenarios wrapper", () => {
  it("retorna dre + reforma consistentes", () => {
    const out = calcularCenarios({ faturamento_mensal: FAT, indices: IDX, config: CFG });
    expect(out.dre.cmv).toBe(1_110_000);
    expect(out.reforma.base_venda).toBe(1_431_900);
    expect(out.reforma.saldo).toBeCloseTo(-20494.55, -1);
  });
});

// -----------------------------------------------------------------------------
// configFromRows
// -----------------------------------------------------------------------------

describe("configFromRows", () => {
  it("converte linhas do banco em ReformaConfig tipado", () => {
    const rows = [
      { chave: "cmv_pct_default", valor: 0.74 },
      { chave: "multiplicador_cmv_vendas", valor: 1.29 },
      { chave: "aliquota_ibs_cbs_total", valor: 0.28 },
    ];
    const c = configFromRows(rows);
    expect(c.cmv_pct_default).toBe(0.74);
    expect(c.multiplicador_cmv_vendas).toBe(1.29);
    expect(c.aliquota_ibs_cbs_total).toBe(0.28);
    // faltantes caem no default
    expect(c.mix_cheia_28).toBe(0.4604);
  });
  it("valores em string também parseiam", () => {
    const c = configFromRows([{ chave: "multiplicador_cmv_vendas", valor: "1.29" as any }]);
    expect(c.multiplicador_cmv_vendas).toBe(1.29);
  });
});
