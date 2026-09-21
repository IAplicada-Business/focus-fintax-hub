import { STAGE_MERGE_MAP } from "@/lib/pipeline-constants";
import {
  esteiraStageLabel,
  ordemEsteira,
  type EstagioEsteira,
} from "@/lib/esteira-constants";

/** Etapas comerciais compartilhadas/sincronizadas com a operação. */
export const ETAPAS_FUNIL_HANDOFF = [
  "triagem",
  "contrato_emitido",
  "contrato_assinado",
  "ganho",
] as const;

function etapaFunilUnificada(statusFunil: string | null | undefined): string {
  const raw = String(statusFunil ?? "").trim();
  return STAGE_MERGE_MAP[raw] ?? raw;
}

export function funilEntraNaEsteira(statusFunil: string | null | undefined): boolean {
  const etapa = etapaFunilUnificada(statusFunil);
  return ETAPAS_FUNIL_HANDOFF.includes(
    etapa as (typeof ETAPAS_FUNIL_HANDOFF)[number],
  );
}

/**
 * Mapeamento explícito das etapas conectadas:
 * comercial Triagem → operação Triagem
 * Contrato Emitido → Contrato Emitido
 * Contrato Assinado → Contrato Assinado
 * Ganho → Em Compensação
 */
export function estagioEsteiraDoFunil(
  paraFunil: string | null | undefined,
  _deFunil?: string | null,
): EstagioEsteira {
  const para = etapaFunilUnificada(paraFunil);
  if (para === "contrato_emitido") return "contrato_emitido";
  if (para === "contrato_assinado") return "contrato_assinado";
  if (para === "ganho") return "em_compensacao";
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
