/**
 * Motor de sugestão de produto (Épica 2).
 *
 * Cruza o resultado da Calculadora RT (economia / IBS-CBS) com o potencial
 * do motor de teses (`motor_teses_config`). Regras grounded nos campos que
 * já existem — textos comerciais são draft até Focus validar.
 *
 * Usado pela edge `submit-calculadora-lead` e pelos testes Vitest.
 */

export type RegimeCalculadora = "simples" | "presumido" | "real" | string;
export type RegimeMotor = "simples" | "lucro_presumido" | "lucro_real";

export type ProdutoSugerido =
  | "compensacao"
  | "reforma_tributaria"
  | "ambos"
  | "analise_personalizada";

export const PRODUTO_LABEL: Record<ProdutoSugerido, string> = {
  compensacao: "Compensação",
  reforma_tributaria: "Consultoria Reforma Tributária",
  ambos: "Compensação + Reforma Tributária",
  analise_personalizada: "Análise personalizada",
};

export type TeseMotorInput = {
  tese: string;
  nome_exibicao: string;
  regimes_elegiveis: string[];
  segmentos_elegiveis: string[];
  percentual_min: number;
  percentual_max: number;
  ativo: boolean;
  ordem_exibicao?: number | null;
};

export type TesePotencial = {
  tese: string;
  nome_exibicao: string;
  estimativa_minima: number;
  estimativa_maxima: number;
};

export type SugestaoProdutoRacional = {
  produto: ProdutoSugerido;
  label: string;
  /** Draft comercial — Focus pode editar depois. */
  resumo: string;
  regime_calculadora: string;
  regime_motor: RegimeMotor | null;
  segmento: string;
  ja_faz_recuperacao: boolean;
  economia_potencial_anual: number;
  ibs_cbs_estimado: number;
  potencial_compensacao_min: number;
  potencial_compensacao_max: number;
  teses: TesePotencial[];
  motivos: string[];
  /** Sempre true até Focus assinar a copy. */
  draft: true;
};

export type SugestaoProdutoInput = {
  regime: RegimeCalculadora;
  segmento: string;
  faturamento_mensal: number;
  economia_potencial_anual: number;
  ibs_cbs_estimado: number;
  ja_faz_recuperacao: boolean;
  teses: TeseMotorInput[];
};

/** Calculadora usa real/presumido/simples; motor usa lucro_real/lucro_presumido/simples. */
export function normalizeRegimeParaMotor(regime: RegimeCalculadora): RegimeMotor | null {
  const r = String(regime || "").toLowerCase().trim();
  if (r === "real" || r === "lucro_real" || r === "lucro real") return "lucro_real";
  if (r === "presumido" || r === "lucro_presumido" || r === "lucro presumido") return "lucro_presumido";
  if (r === "simples" || r === "simples_nacional" || r === "simples nacional") return "simples";
  return null;
}

/**
 * Mesma fórmula do RPC `calcular_diagnostico`:
 * estimativa = faturamento_mensal × 60 × percentual  (5 anos retroativos).
 */
export function estimarTese(
  faturamentoMensal: number,
  percentualMin: number,
  percentualMax: number,
): { min: number; max: number } {
  const fat = Number(faturamentoMensal) || 0;
  const pMin = Number(percentualMin) || 0;
  const pMax = Number(percentualMax) || 0;
  return {
    min: Math.round(fat * 60 * pMin),
    max: Math.round(fat * 60 * pMax),
  };
}

export function filtrarTesesElegiveis(
  teses: TeseMotorInput[],
  regimeMotor: RegimeMotor | null,
  segmento: string,
): TeseMotorInput[] {
  if (!regimeMotor) return [];
  const seg = String(segmento || "supermercado").toLowerCase();
  return teses
    .filter((t) => t.ativo)
    .filter((t) => (t.regimes_elegiveis || []).includes(regimeMotor))
    .filter((t) => (t.segmentos_elegiveis || []).includes(seg))
    .sort((a, b) => (a.ordem_exibicao ?? 0) - (b.ordem_exibicao ?? 0));
}

export function potencialCompensacao(
  faturamentoMensal: number,
  elegiveis: TeseMotorInput[],
): { min: number; max: number; teses: TesePotencial[] } {
  const teses: TesePotencial[] = elegiveis.map((t) => {
    const est = estimarTese(faturamentoMensal, t.percentual_min, t.percentual_max);
    return {
      tese: t.tese,
      nome_exibicao: t.nome_exibicao,
      estimativa_minima: est.min,
      estimativa_maxima: est.max,
    };
  });
  return {
    min: teses.reduce((s, t) => s + t.estimativa_minima, 0),
    max: teses.reduce((s, t) => s + t.estimativa_maxima, 0),
    teses,
  };
}

/** Impacto material na reforma: saldo IBS/CBS a pagar ou economia anual |≥| R$ 1.000. */
export function temImpactoReforma(
  economiaPotencialAnual: number,
  ibsCbsEstimado: number,
): boolean {
  return Math.abs(Number(economiaPotencialAnual) || 0) >= 1_000
    || Number(ibsCbsEstimado) > 0;
}

export function sugerirProduto(input: SugestaoProdutoInput): SugestaoProdutoRacional {
  const regimeMotor = normalizeRegimeParaMotor(input.regime);
  const elegiveis = filtrarTesesElegiveis(input.teses, regimeMotor, input.segmento);
  const pot = potencialCompensacao(input.faturamento_mensal, elegiveis);
  const temComp = pot.max > 0;
  const temRef = temImpactoReforma(input.economia_potencial_anual, input.ibs_cbs_estimado);
  const motivos: string[] = [];

  let produto: ProdutoSugerido;

  if (!temComp && String(input.regime).toLowerCase() === "simples") {
    // LP bloqueia Compensação no Simples; Calculadora ainda gera RT.
    if (temRef) {
      produto = "reforma_tributaria";
      motivos.push(
        "Simples Nacional sem tese de Compensação elegível — priorizar Consultoria RT (impacto IBS/CBS).",
      );
    } else {
      produto = "analise_personalizada";
      motivos.push(
        "Regime Simples Nacional sem tese elegível e sem impacto material na Reforma.",
      );
    }
  } else if (temComp && temRef) {
    produto = "ambos";
    motivos.push(
      `Teses elegíveis somam até R$ ${pot.max.toLocaleString("pt-BR")} de potencial de Compensação (5 anos).`,
    );
    motivos.push(
      `Calculadora RT indica impacto anual de R$ ${Math.abs(input.economia_potencial_anual).toLocaleString("pt-BR")} (IBS/CBS).`,
    );
  } else if (temComp) {
    produto = "compensacao";
    motivos.push(
      `Teses elegíveis somam R$ ${pot.min.toLocaleString("pt-BR")} – R$ ${pot.max.toLocaleString("pt-BR")} (janela de 5 anos).`,
    );
  } else if (temRef) {
    produto = "reforma_tributaria";
    motivos.push(
      "Sem tese elegível no motor para este regime/segmento; lead veio pela Calculadora RT com impacto IBS/CBS.",
    );
  } else {
    produto = "analise_personalizada";
    motivos.push("Sem potencial de Compensação e sem impacto material na Reforma — revisar manualmente.");
  }

  if (input.ja_faz_recuperacao) {
    motivos.push(
      "Lead já faz recuperação — priorizar complementares / Reforma se Compensação já estiver coberta.",
    );
  }

  if (elegiveis.length > 0) {
    motivos.push(
      `Teses: ${elegiveis.map((t) => t.nome_exibicao).join(", ")}.`,
    );
  }

  const label = PRODUTO_LABEL[produto];
  const resumo =
    produto === "ambos"
      ? "Lead tem potencial de Compensação (teses) e impacto na Reforma Tributária — oferecer os dois."
      : produto === "compensacao"
        ? "Priorizar Compensação com base no motor de teses elegíveis."
        : produto === "reforma_tributaria"
          ? "Priorizar Consultoria de Reforma Tributária (Calculadora RT)."
          : "Sem match automático claro — análise comercial personalizada.";

  return {
    produto,
    label,
    resumo,
    regime_calculadora: String(input.regime),
    regime_motor: regimeMotor,
    segmento: String(input.segmento || "supermercado").toLowerCase(),
    ja_faz_recuperacao: !!input.ja_faz_recuperacao,
    economia_potencial_anual: Number(input.economia_potencial_anual) || 0,
    ibs_cbs_estimado: Number(input.ibs_cbs_estimado) || 0,
    potencial_compensacao_min: pot.min,
    potencial_compensacao_max: pot.max,
    teses: pot.teses,
    motivos,
    draft: true,
  };
}
