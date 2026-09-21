export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

/** Chave YYYY-MM no mesmo calendário de negócio usado pelo banco brasileiro. */
export function monthKeyBrt(value: Date | number = Date.now()): string {
  const parts = monthFormatter.formatToParts(
    typeof value === "number" ? new Date(value) : value,
  );
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Não foi possível calcular a competência em BRT");
  return `${year}-${month}`;
}

/** Mês corrente canônico da aplicação, no fuso America/Sao_Paulo. */
export function currentMonthKey(agora: Date | number = Date.now()): string {
  return monthKeyBrt(agora);
}

/** Desloca uma competência sem depender do fuso local do navegador. */
export function shiftMonthKey(chave: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(chave);
  if (!match) throw new Error(`Competência inválida: ${chave}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
