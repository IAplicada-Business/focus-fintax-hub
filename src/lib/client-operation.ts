import type { ScreenPermission } from "@/lib/screen-permissions";
import {
  isTipoRecuperacao,
  TIPO_RECUPERACAO_LABEL,
  type TipoRecuperacao,
} from "@/lib/tipo-recuperacao";

export const CLIENTE_STATUS_COMPENSACAO = [
  { value: "compensando", label: "Compensando" },
  { value: "reporto", label: "Possíveis futuros" },
  { value: "encerrado", label: "Encerrado" },
] as const;

export type ClienteStatusCompensacao =
  (typeof CLIENTE_STATUS_COMPENSACAO)[number]["value"];

export const CLIENTE_STATUS_COMPENSACAO_LABEL: Record<
  ClienteStatusCompensacao,
  string
> = {
  compensando: "Compensando",
  reporto: "Possíveis futuros",
  encerrado: "Encerrado",
};

export function isClienteStatusCompensacao(
  value: string | null | undefined,
): value is ClienteStatusCompensacao {
  return CLIENTE_STATUS_COMPENSACAO.some((item) => item.value === value);
}

export function podeEditarFichaCliente(
  role: string | null | undefined,
  permissions: ScreenPermission[],
): boolean {
  if (!["admin", "pmo", "gestor_tributario"].includes(role ?? "")) return false;
  const permission = permissions.find((item) => item.screen_key === "clientes");
  return !permission || (permission.can_access && !permission.read_only);
}

export const STATUS_PROCESSO_PADRAO = [
  { value: "a_compensar", label: "A compensar", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "compensando", label: "Compensando", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "compensado", label: "Compensado", color: "bg-green-100 text-green-800 border-green-200" },
] as const;

export const STATUS_PROCESSO_REPORTO = {
  value: "pedido_feito_receita",
  label: "Pedido feito pela Receita",
  color: "bg-yellow-100 text-yellow-800 border-yellow-200",
} as const;

export type StatusProcessoEditavel =
  | (typeof STATUS_PROCESSO_PADRAO)[number]["value"]
  | typeof STATUS_PROCESSO_REPORTO.value;

export function statusProcessoEditaveis(isReporto: boolean) {
  return isReporto
    ? [...STATUS_PROCESSO_PADRAO, STATUS_PROCESSO_REPORTO]
    : [...STATUS_PROCESSO_PADRAO];
}

export function isStatusProcessoEditavel(
  value: string | null | undefined,
  isReporto: boolean,
): value is StatusProcessoEditavel {
  return statusProcessoEditaveis(isReporto).some((item) => item.value === value);
}

export function tiposRecuperacaoDistintos(
  processos: Array<{ tipo_recuperacao?: string | null }>,
): Array<{ value: TipoRecuperacao; label: string }> {
  const tipos = new Set<TipoRecuperacao>();
  for (const processo of processos) {
    if (isTipoRecuperacao(processo.tipo_recuperacao ?? "")) {
      tipos.add(processo.tipo_recuperacao as TipoRecuperacao);
    }
  }
  return [...tipos].map((value) => ({
    value,
    label: TIPO_RECUPERACAO_LABEL[value],
  }));
}

export function totalProcessosACompensar(
  processos: Array<{
    status_processo?: string | null;
    status_contrato?: string | null;
    categoria?: string | null;
    tese?: string | null;
    nome_exibicao?: string | null;
    valor_credito?: number | string | null;
  }>,
): number {
  return processos
    .filter((processo) => {
      const reporto =
        String(processo.categoria ?? "").toLowerCase() === "reporto" ||
        String(processo.tese ?? "").toUpperCase() === "REPORTO" ||
        String(processo.nome_exibicao ?? "").toUpperCase() === "REPORTO";
      return (
        processo.status_processo === "a_compensar" &&
        processo.status_contrato === "assinado" &&
        !reporto
      );
    })
    .reduce((total, processo) => total + Number(processo.valor_credito || 0), 0);
}
