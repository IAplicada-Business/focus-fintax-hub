import { STAGE_MERGE_MAP } from "@/lib/pipeline-constants";
import {
  esteiraStageLabel,
  ordemEsteira,
  type EstagioEsteira,
} from "@/lib/esteira-constants";

/** Etapas comerciais que entregam o lead na esteira operacional. */
export const ETAPAS_FUNIL_HANDOFF = ["contrato_emitido", "cliente_ativo"] as const;

function etapaFunilUnificada(statusFunil: string | null | undefined): string {
  const raw = String(statusFunil ?? "").trim();
  return STAGE_MERGE_MAP[raw] ?? raw;
}

export function funilEntraNaEsteira(statusFunil: string | null | undefined): boolean {
  const etapa = etapaFunilUnificada(statusFunil);
  return etapa === "contrato_emitido" || etapa === "cliente_ativo";
}

/**
 * Continua o fluxo: comercial não recomeça a operação.
 * Contrato emitido no funil → operação espera o assinado.
 * Cliente ativo vindo do contrato permanece nessa etapa (não volta à triagem).
 * Conversão antecipada (exceção) entra em triagem.
 */
export function estagioEsteiraDoFunil(
  paraFunil: string | null | undefined,
  deFunil?: string | null,
): EstagioEsteira {
  const para = etapaFunilUnificada(paraFunil);
  const de = etapaFunilUnificada(deFunil);
  if (para === "contrato_emitido") return "receber_assinado";
  if (para === "cliente_ativo" && (de === "contrato_emitido" || de === "cliente_ativo")) {
    return "receber_assinado";
  }
  return "triagem";
}

export function avancarEstagioEsteira(
  atual: string | null | undefined,
  destino: EstagioEsteira,
): EstagioEsteira {
  if (!atual) return destino;
  if (ordemEsteira(atual) > ordemEsteira(destino)) return atual as EstagioEsteira;
  return destino;
}

export function descricaoHandoff(estagio: EstagioEsteira): string {
  return `Entra na esteira em ${esteiraStageLabel(estagio)}.`;
}
