export type OrigemMovimentoEsteira = "kanban" | "ficha" | "organizar" | "funil";

export type MotivoMovimentoEsteira =
  | { ok: true }
  | { ok: false; motivo: string };

export interface ClienteTriagemLike {
  triagem_realizada?: boolean | null;
  triagem_documento_path?: string | null;
}

const PAPEIS_COMERCIAIS = ["comercial", "sdr", "gestor_comercial"] as const;
const PAPEIS_OVERRIDE = ["admin", "pmo"] as const;

export function podeSairDaTriagem(cliente: ClienteTriagemLike): MotivoMovimentoEsteira {
  const realizada = !!cliente.triagem_realizada;
  const documento = !!cliente.triagem_documento_path?.trim();
  if (realizada && documento) return { ok: true };
  const faltas: string[] = [];
  if (!realizada) faltas.push("marcar Triagem realizada");
  if (!documento) faltas.push("anexar o documento de conclusão");
  return {
    ok: false,
    motivo: `Conclua a triagem antes de avançar: ${faltas.join(" e ")}.`,
  };
}

/**
 * Kanban nunca tira de Devolução Comercial para Contrato Emitido — isso é
 * papel do funil comercial. Admin/PMO ainda forçam na ficha ou em Organizar.
 */
export function podeMoverNaEsteira(params: {
  de: string | null | undefined;
  para: string;
  origem: OrigemMovimentoEsteira;
  role?: string | null;
  cliente?: ClienteTriagemLike;
}): MotivoMovimentoEsteira {
  const { de, para, origem, role, cliente } = params;
  if (!de || de === para) return { ok: true };

  if (de === "triagem" && origem !== "organizar" && origem !== "funil") {
    const gate = podeSairDaTriagem(cliente ?? {});
    if (!gate.ok) return gate;
  }

  if (de === "devolucao_comercial" && para === "contrato_emitido") {
    if (origem === "kanban") {
      return {
        ok: false,
        motivo:
          "Quem está em Devolução Comercial só avança para Contrato Emitido pelo funil comercial.",
      };
    }
    if (origem === "funil") return { ok: true };
    const papel = role ?? "";
    if (
      PAPEIS_OVERRIDE.includes(papel as (typeof PAPEIS_OVERRIDE)[number]) ||
      PAPEIS_COMERCIAIS.includes(papel as (typeof PAPEIS_COMERCIAIS)[number])
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      motivo: "Somente o comercial pode mover de Devolução Comercial para Contrato Emitido.",
    };
  }

  return { ok: true };
}
