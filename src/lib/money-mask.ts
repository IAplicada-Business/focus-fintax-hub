/** Converte máscara pt-BR (1.234,56) ou número/string "1234.56" em number. */
export function parseMoneyBR(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null || value === "") return 0;
  const s = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s) || 0;
  const digits = s.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

/** Formata número ou string numérica para máscara pt-BR (1.234,56). */
export function formatMoneyBR(value: string | number | null | undefined): string {
  if (value === "" || value == null) return "";
  const n = typeof value === "number" ? value : parseMoneyBR(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Aplica máscara a partir das teclas: só dígitos, últimos 2 são centavos. */
export function maskMoneyInput(raw: string): { display: string; amount: number } {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  if (!digits) return { display: "", amount: 0 };
  const amount = parseInt(digits, 10) / 100;
  return {
    display: amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    amount,
  };
}
