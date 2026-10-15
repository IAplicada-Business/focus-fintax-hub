/**
 * Tratamento financeiro de uma tese: entra no saldo a compensar ou fica
 * fora (Reporto = possível recebimento; via judicial = em julgamento).
 *
 * Até out/2026 isso era deduzido do código da tese e do ramo. Paulo pediu
 * (review AGF 02/10) uma flag que o time ajuste sozinho na tela de teses, sem
 * depender do time de produto quando uma tese nova (ex.: ICMS estadual)
 * aparecer. A flag do catálogo é o padrão sugerido; o processo do cliente
 * continua podendo sobrescrever.
 */
import { isReportoProcesso } from "@/lib/clientes-constants";
import type { TipoRecuperacao } from "@/lib/tipo-recuperacao";

export const TRATAMENTOS_FINANCEIROS = [
  {
    value: "compensacao",
    label: "Crédito no cálculo",
    curto: "No saldo",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  {
    value: "reporto",
    label: "Possível futuro (REPORTO)",
    curto: "Fora do saldo · Reporto",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
  },
  {
    value: "recuperacao_judicial",
    label: "Recuperação judicial (fora do cálculo)",
    curto: "Fora do saldo · Judicial",
    badge: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
] as const;

export type TratamentoFinanceiro = (typeof TRATAMENTOS_FINANCEIROS)[number]["value"];

export const TRATAMENTO_FINANCEIRO_PADRAO: TratamentoFinanceiro = "compensacao";

export function isTratamentoFinanceiro(value: unknown): value is TratamentoFinanceiro {
  return TRATAMENTOS_FINANCEIROS.some((t) => t.value === value);
}

export function tratamentoFinanceiroInfo(value: string | null | undefined) {
  return (
    TRATAMENTOS_FINANCEIROS.find((t) => t.value === value) ??
    TRATAMENTOS_FINANCEIROS[0]
  );
}

/**
 * Tratamento sugerido ao escolher a tese num processo. A flag do catálogo
 * manda; sem ela vale a dedução antiga (Reporto pelo nome, judicial pelo
 * ramo, o resto no cálculo).
 */
export function tratamentoPadraoDaTese(input: {
  tratamento_financeiro_padrao?: string | null;
  tese?: string | null;
  nome_exibicao?: string | null;
  tipo_recuperacao?: TipoRecuperacao | string | null;
}): TratamentoFinanceiro {
  if (isTratamentoFinanceiro(input.tratamento_financeiro_padrao)) {
    return input.tratamento_financeiro_padrao;
  }
  if (isReportoProcesso({ tese: input.tese, nome_exibicao: input.nome_exibicao })) return "reporto";
  if (input.tipo_recuperacao === "recuperacao_judicial") return "recuperacao_judicial";
  return "compensacao";
}
