// supabase/functions/_shared/calc-motor.ts
//
// Motor puro da Calculadora da Reforma Tributária.
// TypeScript puro sem deps de Deno/Node — rodável em ambos, testável em Vitest.
//
// Fonte de verdade: Excel do Alcir "Calculadora_RT_2026.xlsx", auditado 06/07.
// Decisões aprovadas pela Mariana (D1..D5 no PR #49):
//   D1  Débito calculado sobre (CMV × multiplicador_cmv_vendas), não sobre Faturamento.
//   D2  Ground truth = Excel. Testes congelam Fat=1.500.000 → saldo=-20.494.
//   D3  Modelo bruto + exclusões separadas (usa flag entra_na_exclusao_credito).
//   D4  Bugs do Excel (R23 F88, K72 K78) não replicados — subtotais só somam
//       suas próprias rubricas.
//   D5  Precisão do Excel col K preservada (numeric(14,10)).

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface FocusIndice {
  id?: string;
  segmento: string;
  grupo: string;
  rubrica: string;
  percentual_sobre_faturamento: number;
  gera_credito_ibs_cbs: boolean;
  entra_na_exclusao_credito: boolean;
  ordem_exibicao?: number;
}

export interface ReformaConfig {
  cmv_pct_default: number;
  multiplicador_cmv_vendas: number;
  aliquota_ibs_cbs_total: number;
  aliquota_reduzida: number;
  aliquota_imposto_seletivo: number;
  mix_isento_zero: number;
  mix_reducao_50: number;
  mix_cheia_28: number;
  mix_seletivo: number;
  cbs_net_split: number;
  ibs_net_split: number;
}

export interface DreRubrica {
  rubrica: string;
  valor: number;
  pct: number;
}

export interface DreGrupo {
  grupo: string;
  subtotal: number;
  subtotal_pct: number;
  rubricas: DreRubrica[];
}

export interface DreOutput {
  faturamento: number;
  cmv: number;
  resultado_bruto: number;
  grupos: DreGrupo[];
  total_despesas_op: number;
  total_despesas_op_pct: number;
  resultado_antes_impostos: number;
  resultado_antes_impostos_pct: number;
}

export interface DebitoBreakdown {
  isento: number;
  reducao: number;
  cheia: number;
  seletivo: number;
  total: number;
}

export interface CreditoBrutoBreakdown {
  compras: number;
  folha_beneficios: number;
  adm: number;
  vendas: number;
  financeiras: number;
  total: number;
}

export interface ExclusaoBreakdown {
  rubricas: { rubrica: string; valor: number }[];
  total: number;
}

export interface IbsCbsOutput {
  base_venda: number; // CMV × multiplicador
  debito: DebitoBreakdown;
  credito_bruto: CreditoBrutoBreakdown;
  exclusao: ExclusaoBreakdown;
  saldo: number; // crédito_bruto - débito - exclusão (Alcir: negativo = a pagar)
  saldo_a_pagar: number; // Math.abs(saldo) se saldo < 0, senão 0
  cbs_saldo: number;
  ibs_saldo: number;
}

export interface CalcularInput {
  faturamento_mensal: number;
  indices: FocusIndice[];
  config: ReformaConfig;
}

export interface CalcularOutput {
  dre: DreOutput;
  reforma: IbsCbsOutput;
}

// -----------------------------------------------------------------------------
// Configuração default (para testes / smoke)
// -----------------------------------------------------------------------------

export const CONFIG_DEFAULT: ReformaConfig = {
  cmv_pct_default: 0.74,
  multiplicador_cmv_vendas: 1.29,
  aliquota_ibs_cbs_total: 0.28,
  aliquota_reduzida: 0.14,
  aliquota_imposto_seletivo: 0.14,
  mix_isento_zero: 0.2193,
  mix_reducao_50: 0.3228,
  mix_cheia_28: 0.4604,
  mix_seletivo: 0.1087,
  cbs_net_split: 0.3142857,
  ibs_net_split: 0.6857143,
};

// -----------------------------------------------------------------------------
// Grupos canônicos (nomes usados nos INSERTs de focus_indices)
// -----------------------------------------------------------------------------

export const GRUPO_CMV = "CMV";
export const GRUPO_PESSOAL = "Despesas com Pessoal";
export const GRUPO_ADM = "Desp. Gerais Administrativas";
export const GRUPO_VENDAS = "Despesas com Vendas";
export const GRUPO_FINANCEIRAS = "Despesas Financeiras";

const GRUPOS_DESPESA_ORDEM = [
  GRUPO_PESSOAL,
  GRUPO_ADM,
  GRUPO_VENDAS,
  GRUPO_FINANCEIRAS,
];

// -----------------------------------------------------------------------------
// DRE base
// -----------------------------------------------------------------------------

export function calcularDRE(fat: number, indices: FocusIndice[], cmv_pct: number): DreOutput {
  const cmv = fat * cmv_pct;
  const resultado_bruto = fat - cmv;

  const gruposOut: DreGrupo[] = [];
  for (const nomeGrupo of GRUPOS_DESPESA_ORDEM) {
    // D4 — subtotal só das próprias rubricas
    const rubricasDoGrupo = indices
      .filter((r) => r.grupo === nomeGrupo)
      .sort((a, b) => (a.ordem_exibicao ?? 0) - (b.ordem_exibicao ?? 0));

    const rubricas: DreRubrica[] = rubricasDoGrupo.map((r) => ({
      rubrica: r.rubrica,
      valor: fat * r.percentual_sobre_faturamento,
      pct: r.percentual_sobre_faturamento,
    }));

    const subtotal = rubricas.reduce((s, r) => s + r.valor, 0);
    gruposOut.push({
      grupo: nomeGrupo,
      subtotal,
      subtotal_pct: fat > 0 ? subtotal / fat : 0,
      rubricas,
    });
  }

  const total_despesas_op = gruposOut.reduce((s, g) => s + g.subtotal, 0);
  const resultado_antes_impostos = resultado_bruto - total_despesas_op;

  return {
    faturamento: fat,
    cmv,
    resultado_bruto,
    grupos: gruposOut,
    total_despesas_op,
    total_despesas_op_pct: fat > 0 ? total_despesas_op / fat : 0,
    resultado_antes_impostos,
    resultado_antes_impostos_pct: fat > 0 ? resultado_antes_impostos / fat : 0,
  };
}

// -----------------------------------------------------------------------------
// IBS/CBS
// -----------------------------------------------------------------------------

export function calcularIbsCbs(
  fat: number,
  dre: DreOutput,
  indices: FocusIndice[],
  cfg: ReformaConfig,
): IbsCbsOutput {
  const cmv = dre.cmv;
  const base_venda = cmv * cfg.multiplicador_cmv_vendas; // D1

  // Débito S/VENDAS = base_venda × mix × alíquota (por faixa)
  const debitoIsento = 0; // mix isento não tributa
  const debitoReducao = base_venda * cfg.mix_reducao_50 * cfg.aliquota_reduzida;
  const debitoCheia = base_venda * cfg.mix_cheia_28 * cfg.aliquota_ibs_cbs_total;
  const debitoSeletivo = base_venda * cfg.mix_seletivo * cfg.aliquota_imposto_seletivo;
  const debitoTotal = debitoIsento + debitoReducao + debitoCheia + debitoSeletivo;

  // Crédito compras = CMV × mix × alíquota (SEM o multiplicador — só sobre COMPRAS)
  const creditoComprasIsento = 0;
  const creditoComprasReducao = cmv * cfg.mix_reducao_50 * cfg.aliquota_reduzida;
  const creditoComprasCheia = cmv * cfg.mix_cheia_28 * cfg.aliquota_ibs_cbs_total;
  const creditoComprasSeletivo = cmv * cfg.mix_seletivo * cfg.aliquota_imposto_seletivo;
  const creditoCompras =
    creditoComprasIsento + creditoComprasReducao + creditoComprasCheia + creditoComprasSeletivo;

  // Crédito bruto por grupo = subtotal_grupo × alíquota_cheia (28%)
  // D3: bruto sem excluir aqui — exclusão sai em bloco separado
  const aliq = cfg.aliquota_ibs_cbs_total;

  // Folha benefícios = APENAS rubricas de Pessoal com gera_credito_ibs_cbs=true
  // (folha CLT não gera crédito). Excel R90 replicado.
  const beneficiosPessoal = indices
    .filter((r) => r.grupo === GRUPO_PESSOAL && r.gera_credito_ibs_cbs);
  const creditoFolhaBase = beneficiosPessoal.reduce(
    (s, r) => s + fat * r.percentual_sobre_faturamento,
    0,
  );
  const creditoFolha = creditoFolhaBase * aliq;

  // Adm/Vendas/Financeiras — subtotal do grupo × 28% (D3: bruto)
  const findGrupo = (nome: string) => dre.grupos.find((g) => g.grupo === nome);
  const creditoAdm = (findGrupo(GRUPO_ADM)?.subtotal ?? 0) * aliq;
  const creditoVendas = (findGrupo(GRUPO_VENDAS)?.subtotal ?? 0) * aliq;
  const creditoFinanceiras = (findGrupo(GRUPO_FINANCEIRAS)?.subtotal ?? 0) * aliq;

  const creditoBrutoTotal =
    creditoCompras + creditoFolha + creditoAdm + creditoVendas + creditoFinanceiras;

  // Exclusão D3: rubricas com entra_na_exclusao_credito=true × 28%
  const rubricasExclusao = indices.filter((r) => r.entra_na_exclusao_credito);
  const exclusaoRubricas = rubricasExclusao.map((r) => ({
    rubrica: r.rubrica,
    valor: fat * r.percentual_sobre_faturamento * aliq,
  }));
  const exclusaoTotal = exclusaoRubricas.reduce((s, r) => s + r.valor, 0);

  // Saldo: crédito_bruto - débito - exclusão
  // Convenção Alcir: negativo = a pagar
  const saldo = creditoBrutoTotal - debitoTotal - exclusaoTotal;
  const saldoAPagar = saldo < 0 ? -saldo : 0;

  const cbs = saldo * cfg.cbs_net_split;
  const ibs = saldo * cfg.ibs_net_split;

  return {
    base_venda,
    debito: {
      isento: debitoIsento,
      reducao: debitoReducao,
      cheia: debitoCheia,
      seletivo: debitoSeletivo,
      total: debitoTotal,
    },
    credito_bruto: {
      compras: creditoCompras,
      folha_beneficios: creditoFolha,
      adm: creditoAdm,
      vendas: creditoVendas,
      financeiras: creditoFinanceiras,
      total: creditoBrutoTotal,
    },
    exclusao: {
      rubricas: exclusaoRubricas,
      total: exclusaoTotal,
    },
    saldo,
    saldo_a_pagar: saldoAPagar,
    cbs_saldo: cbs,
    ibs_saldo: ibs,
  };
}

// -----------------------------------------------------------------------------
// Wrapper high-level
// -----------------------------------------------------------------------------

export function calcularCenarios(input: CalcularInput): CalcularOutput {
  const dre = calcularDRE(input.faturamento_mensal, input.indices, input.config.cmv_pct_default);
  const reforma = calcularIbsCbs(input.faturamento_mensal, dre, input.indices, input.config);
  return { dre, reforma };
}

// -----------------------------------------------------------------------------
// Helpers pra converter reforma_config (chave/valor jsonb) → ReformaConfig
// -----------------------------------------------------------------------------

/** Converte linhas do banco `reforma_config` em objeto tipado.
 *  Cai no default se algum campo faltar. */
export function configFromRows(rows: { chave: string; valor: unknown }[]): ReformaConfig {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = typeof r.valor === "number" ? r.valor : Number(r.valor);
    if (Number.isFinite(v)) map.set(r.chave, v);
  }
  return {
    cmv_pct_default: map.get("cmv_pct_default") ?? CONFIG_DEFAULT.cmv_pct_default,
    multiplicador_cmv_vendas:
      map.get("multiplicador_cmv_vendas") ?? CONFIG_DEFAULT.multiplicador_cmv_vendas,
    aliquota_ibs_cbs_total:
      map.get("aliquota_ibs_cbs_total") ?? CONFIG_DEFAULT.aliquota_ibs_cbs_total,
    aliquota_reduzida: map.get("aliquota_reduzida") ?? CONFIG_DEFAULT.aliquota_reduzida,
    aliquota_imposto_seletivo:
      map.get("aliquota_imposto_seletivo") ?? CONFIG_DEFAULT.aliquota_imposto_seletivo,
    mix_isento_zero: map.get("mix_isento_zero") ?? CONFIG_DEFAULT.mix_isento_zero,
    mix_reducao_50: map.get("mix_reducao_50") ?? CONFIG_DEFAULT.mix_reducao_50,
    mix_cheia_28: map.get("mix_cheia_28") ?? CONFIG_DEFAULT.mix_cheia_28,
    mix_seletivo: map.get("mix_seletivo") ?? CONFIG_DEFAULT.mix_seletivo,
    cbs_net_split: map.get("cbs_net_split") ?? CONFIG_DEFAULT.cbs_net_split,
    ibs_net_split: map.get("ibs_net_split") ?? CONFIG_DEFAULT.ibs_net_split,
  };
}
