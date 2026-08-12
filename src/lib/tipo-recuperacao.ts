/**
 * Ramos de recuperação (Épica 3 / 14).
 * Independente de `categoria` (compensacao | reporto) em processos_teses.
 */

export const TIPOS_RECUPERACAO = [
  { value: "compensacao", label: "Compensação" },
  { value: "ressarcimento", label: "Ressarcimento" },
  { value: "recuperacao_judicial", label: "Recuperação Judicial" },
] as const;

export type TipoRecuperacao = (typeof TIPOS_RECUPERACAO)[number]["value"];

export const TIPO_RECUPERACAO_LABEL: Record<TipoRecuperacao, string> = {
  compensacao: "Compensação",
  ressarcimento: "Ressarcimento",
  recuperacao_judicial: "Recuperação Judicial",
};

/** Classes Tailwind para badge/tag por ramo. */
export const TIPO_RECUPERACAO_BADGE: Record<TipoRecuperacao, string> = {
  compensacao: "border-sky-200 bg-sky-50 text-sky-800",
  ressarcimento: "border-amber-200 bg-amber-50 text-amber-800",
  recuperacao_judicial: "border-rose-200 bg-rose-50 text-rose-800",
};

export function isTipoRecuperacao(value: string): value is TipoRecuperacao {
  return TIPOS_RECUPERACAO.some((t) => t.value === value);
}

/**
 * Heurística de UI ao escolher tese: JUD / judicial → ramo judicial.
 * O usuário pode ajustar depois no seletor.
 */
export function sugerirTipoRecuperacao(
  tese: string,
  nomeExibicao = "",
): TipoRecuperacao {
  const blob = `${tese} ${nomeExibicao}`.toLowerCase();
  if (/\bjud(?:icial)?\b|_jud\b|jud_/.test(blob) || blob.includes("judicial")) {
    return "recuperacao_judicial";
  }
  if (blob.includes("ressarc")) {
    return "ressarcimento";
  }
  return "compensacao";
}

/**
 * Resolve o ramo de recuperação de uma tese: prioriza o padrão configurado
 * em `motor_teses_config.tipo_recuperacao_padrao` (editável em
 * /configuracoes/motor); cai pra heurística de regex só quando a tese ainda
 * não tem padrão configurado (linha pré-existente, ou tabela indisponível).
 */
export function resolveTipoRecuperacao(
  tipoRecuperacaoPadrao: string | null | undefined,
  tese: string,
  nomeExibicao = "",
): TipoRecuperacao {
  if (tipoRecuperacaoPadrao && isTipoRecuperacao(tipoRecuperacaoPadrao)) {
    return tipoRecuperacaoPadrao;
  }
  return sugerirTipoRecuperacao(tese, nomeExibicao);
}

/** Tags não-default para o Kanban (compensação pura não polui o card). */
export function ramosVisiveisNoKanban(flags: {
  tem_ramo_ressarcimento?: boolean | null;
  tem_ramo_judicial?: boolean | null;
}): TipoRecuperacao[] {
  const out: TipoRecuperacao[] = [];
  if (flags.tem_ramo_ressarcimento) out.push("ressarcimento");
  if (flags.tem_ramo_judicial) out.push("recuperacao_judicial");
  return out;
}
