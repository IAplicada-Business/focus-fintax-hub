export const STATUS_CONTRATO = [
  { value: "assinado", label: "Assinado", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "aguardando_assinatura", label: "Aguardando", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "nao_vai_fazer", label: "Não vai fazer", color: "bg-gray-100 text-gray-600 border-gray-200" },
] as const;

export const STATUS_PROCESSO = [
  { value: "compensando", label: "Compensando", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "pedido_feito_receita", label: "Pedido feito Receita", color: "bg-orange-100 text-orange-800 border-orange-200" },
  { value: "nao_protocolado", label: "Não protocolado", color: "bg-red-100 text-red-800 border-red-200" },
  { value: "a_iniciar", label: "A iniciar", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "compensado", label: "Compensado", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "a_compensar", label: "A compensar", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "protocolado", label: "Protocolado", color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "desistiu", label: "Desistiu", color: "bg-gray-200 text-gray-700 border-gray-300" },
] as const;

export const STATUS_PAGAMENTO = [
  { value: "pago", label: "Pago", color: "bg-green-100 text-green-800" },
  { value: "pendente", label: "Pendente", color: "bg-orange-100 text-orange-800" },
] as const;

export function getStatusContratoConfig(value: string) {
  return STATUS_CONTRATO.find((s) => s.value === value) ?? STATUS_CONTRATO[1];
}

export function getStatusProcessoConfig(value: string) {
  return STATUS_PROCESSO.find((s) => s.value === value) ?? STATUS_PROCESSO[3];
}

export function getStatusPagamentoConfig(value: string) {
  return STATUS_PAGAMENTO.find((s) => s.value === value) ?? STATUS_PAGAMENTO[1];
}

export function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const MESES_PT_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

/** Formata competência YYYY-MM ou YYYY-MM-DD sem shift de fuso (evita out/2025 p/ 2025-11-01). */
export function formatCompetenciaPT(mesRef: string | null | undefined): string {
  if (!mesRef) return "—";
  const m = String(mesRef).match(/^(\d{4})-(\d{2})/);
  if (!m) return String(mesRef);
  const mesIdx = parseInt(m[2], 10) - 1;
  if (mesIdx < 0 || mesIdx > 11) return String(mesRef);
  return `${MESES_PT_CURTO[mesIdx]}/${m[1]}`;
}

/** REPORTO / possíveis futuros — fora do Total Compensado (mesmo com tese_origem_id nulo). */
export function isReportoCompensacao(c: {
  tese_origem_id?: string | null;
  processo_tese_id?: string | null;
  processos_teses?: { tese?: string | null; categoria?: string | null; nome_exibicao?: string | null } | null;
}, opts?: {
  reportoTeseIds?: Set<string>;
  reportoProcessoIds?: Set<string>;
}): boolean {
  const tese = (c.processos_teses?.tese || "").toUpperCase();
  const cat = (c.processos_teses?.categoria || "").toLowerCase();
  const nome = (c.processos_teses?.nome_exibicao || "").toUpperCase();
  if (tese === "REPORTO" || cat === "reporto" || nome.includes("REPORTO")) return true;
  if (c.tese_origem_id && opts?.reportoTeseIds?.has(c.tese_origem_id)) return true;
  if (c.processo_tese_id && opts?.reportoProcessoIds?.has(c.processo_tese_id)) return true;
  return false;
}
