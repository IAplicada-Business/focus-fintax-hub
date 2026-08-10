import { describe, it, expect } from "vitest";
import {
  calcularDRE,
  calcularIbsCbs,
  CONFIG_DEFAULT,
  type FocusIndice,
  type ReformaConfig,
} from "../../supabase/functions/_shared/calc-motor";

// Fixture idêntica à de calc-motor-reforma.test.ts (61 rubricas Excel Alcir),
// só pra validar o comportamento do motor nos 3 regimes tributários. Não
// substitui o teste congelado — é validação avulsa (subtask 6 da Épica 2).
const IDX: FocusIndice[] = [
  { segmento: "supermercado", grupo: "CMV", rubrica: "CMV",
    percentual_sobre_faturamento: 0.7400, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 1 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Salários",
    percentual_sobre_faturamento: 0.04628, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 10 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "INSS",
    percentual_sobre_faturamento: 0.0166, gera_credito_ibs_cbs: false, entra_na_exclusao_credito: false, ordem_exibicao: 19 },
  { segmento: "supermercado", grupo: "Despesas com Pessoal", rubrica: "Plano de Saúde/Dental",
    percentual_sobre_faturamento: 0.0024348, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 28 },
  { segmento: "supermercado", grupo: "Desp. Gerais Administrativas", rubrica: "Aluguel e Condomínios",
    percentual_sobre_faturamento: 0.0121309757, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: false, ordem_exibicao: 44 },
  { segmento: "supermercado", grupo: "Despesas com Vendas", rubrica: "Propaganda e Publicidade",
    percentual_sobre_faturamento: 0.002640549, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 81 },
  { segmento: "supermercado", grupo: "Despesas Financeiras", rubrica: "Juros s/Empréstimos Bancários",
    percentual_sobre_faturamento: 0.0027371563, gera_credito_ibs_cbs: true, entra_na_exclusao_credito: true, ordem_exibicao: 107 },
];

const FAT = 1_500_000;
const CFG: ReformaConfig = CONFIG_DEFAULT;

// Réplica exata da lógica de comparação em src/pages/Calculadora.tsx:441-453
function compararRegime(regime: "real" | "presumido" | "simples", impostoReforma: number) {
  const cargaAtualPct = regime === "real" ? 0.115 : regime === "presumido" ? 0.09 : 0.06;
  const irCsllProxyPct = regime === "real" ? 0.08 : regime === "presumido" ? 0.034 : 0;
  const impostoAtual = FAT * cargaAtualPct;
  const impostoAtualComIrCsll = FAT * (cargaAtualPct + irCsllProxyPct);
  const delta = ((impostoReforma - impostoAtual) / Math.max(impostoAtual, 1)) * 100;
  const deltaComIrCsll = ((impostoReforma - impostoAtualComIrCsll) / Math.max(impostoAtualComIrCsll, 1)) * 100;
  return { impostoAtual, impostoAtualComIrCsll, delta, deltaComIrCsll };
}

describe("Motor da Reforma × 3 regimes tributários (Simples, Presumido, Real)", () => {
  const dre = calcularDRE(FAT, IDX, CFG.cmv_pct_default);
  const ibs = calcularIbsCbs(FAT, dre, IDX, CFG);
  const impostoReforma = ibs.saldo_a_pagar;

  it("saldo do motor (IBS/CBS) não depende do regime — regime não é parâmetro do motor", () => {
    // calcularIbsCbs não recebe "regime" em nenhum argumento: o resultado da
    // Reforma é o mesmo faturamento/índices independente do regime tributário
    // hoje. A diferença entre regimes só existe no lado "hoje" (baseline).
    expect(typeof impostoReforma).toBe("number");
    expect(Number.isFinite(impostoReforma)).toBe(true);
  });

  for (const regime of ["simples", "presumido", "real"] as const) {
    it(`regime=${regime}: números "hoje" são finitos, positivos, e IR/CSLL só aumenta a base incorreta`, () => {
      const r = compararRegime(regime, impostoReforma);
      expect(Number.isFinite(r.impostoAtual)).toBe(true);
      expect(Number.isFinite(r.impostoAtualComIrCsll)).toBe(true);
      expect(r.impostoAtual).toBeGreaterThan(0);
      // "Se incluísse IR+CSLL" nunca pode ser MENOR que o correto — senão o
      // erro dos R$225k (economia inflada) já não seria replicável/visível.
      expect(r.impostoAtualComIrCsll).toBeGreaterThanOrEqual(r.impostoAtual);
    });
  }

  it("Simples: proxy de IR/CSLL é zero (Simples não paga IRPJ/CSLL em guia separada)", () => {
    const r = compararRegime("simples", impostoReforma);
    expect(r.impostoAtualComIrCsll).toBe(r.impostoAtual);
    expect(r.deltaComIrCsll).toBe(r.delta);
  });

  it("Presumido e Real: incluir IR/CSLL infla a base 'hoje' e reduz a economia % reportada", () => {
    const presumido = compararRegime("presumido", impostoReforma);
    const real = compararRegime("real", impostoReforma);
    expect(presumido.impostoAtualComIrCsll).toBeGreaterThan(presumido.impostoAtual);
    expect(real.impostoAtualComIrCsll).toBeGreaterThan(real.impostoAtual);
  });

  it("dump para leitura humana (Fat=1.5M)", () => {
    const linhas = (["simples", "presumido", "real"] as const).map((regime) => {
      const r = compararRegime(regime, impostoReforma);
      return `${regime.padEnd(10)} hoje=R$${r.impostoAtual.toFixed(2).padStart(12)}  ` +
        `hoje+IRCSLL(errado)=R$${r.impostoAtualComIrCsll.toFixed(2).padStart(12)}  ` +
        `Δ=${r.delta.toFixed(1)}%  Δ(errado)=${r.deltaComIrCsll.toFixed(1)}%`;
    });
    console.log(`\nsaldo_a_pagar (reforma, igual nos 3 regimes) = R$${impostoReforma.toFixed(2)}\n${linhas.join("\n")}\n`);
    expect(true).toBe(true);
  });
});
