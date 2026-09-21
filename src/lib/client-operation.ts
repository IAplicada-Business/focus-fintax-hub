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
  { value: "a_compensar", label: "A compensar" },
  { value: "compensando", label: "Compensando" },
  { value: "compensado", label: "Compensado" },
] as const;

export const STATUS_PROCESSO_REPORTO = {
  value: "pedido_feito_receita",
  label: "Pedido feito pela Receita",
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
