/** Só para casar lead ↔ conversa na UI. A RPC do banco continua sendo quem normaliza o WhatsApp. */
export function phoneDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tail = (x: string) => (x.length > 11 ? x.slice(-11) : x);
  return tail(da) === tail(db);
}
