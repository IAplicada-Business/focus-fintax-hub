/**
 * Mix de leads por regime tributário — card do Dashboard comercial.
 * Cruza o regime informado pelo lead (texto livre: "Lucro Real", "Simples
 * Nacional"…) com os regimes que as teses ativas do motor cobrem (slugs
 * `lucro_real` / `lucro_presumido` / `simples`), pra mostrar onde há lead sem
 * tese pra vender.
 */

export type RegimeSlug = "lucro_real" | "lucro_presumido" | "simples";
export type RegimeMixKey = RegimeSlug | "nao_informado";

export const REGIME_MIX_LABEL: Record<RegimeMixKey, string> = {
  lucro_real: "Lucro Real",
  lucro_presumido: "Lucro Presumido",
  simples: "Simples Nacional",
  nao_informado: "Não informado",
};

/** Ordem fixa (a cor segue a entidade, nunca a posição). */
export const REGIME_MIX_ORDEM: readonly RegimeMixKey[] = ["lucro_real", "lucro_presumido", "simples", "nao_informado"];

/** "Lucro Real" / "lucro_real" / "Simples Nacional" / "simples_nacional" → slug do motor. */
export function regimeSlug(raw: string | null | undefined): RegimeSlug | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!s) return null;
  if (s.startsWith("lucro re")) return "lucro_real";
  if (s.startsWith("lucro pr")) return "lucro_presumido";
  if (s.startsWith("simples") || s.includes("nacional")) return "simples";
  return null;
}

export interface RegimeMixRow {
  key: RegimeMixKey;
  label: string;
  leads: number;
  potencial: number;
  /** Teses ativas do motor elegíveis pra esse regime (null = não se aplica). */
  teses: number | null;
}

/**
 * Agrega leads por regime. Só devolve regimes com pelo menos 1 lead, na ordem
 * fixa. `motorRegimes` = `regimes_elegiveis` de cada tese ativa.
 */
export function agregarMixRegime(
  leads: Array<{ regime_tributario?: string | null; potencial?: number | null }>,
  motorRegimes: Array<string[] | null | undefined> = [],
): RegimeMixRow[] {
  const acc = new Map<RegimeMixKey, { leads: number; potencial: number }>();
  for (const l of leads) {
    const key: RegimeMixKey = regimeSlug(l.regime_tributario) ?? "nao_informado";
    const cur = acc.get(key) ?? { leads: 0, potencial: 0 };
    cur.leads += 1;
    cur.potencial += Number(l.potencial ?? 0);
    acc.set(key, cur);
  }
  const cobertura = (slug: RegimeSlug) =>
    motorRegimes.filter((r) => Array.isArray(r) && r.includes(slug)).length;

  return REGIME_MIX_ORDEM.filter((k) => acc.has(k)).map((k) => {
    const v = acc.get(k)!;
    return {
      key: k,
      label: REGIME_MIX_LABEL[k],
      leads: v.leads,
      potencial: v.potencial,
      teses: k === "nao_informado" ? null : cobertura(k),
    };
  });
}
