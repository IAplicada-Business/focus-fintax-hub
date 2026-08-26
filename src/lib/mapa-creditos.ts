import {
  statusUtilizacaoFromSaldo,
  sumCompensadoForTese,
  type CompensacaoSumRow,
} from "@/lib/clientes-constants";

/**
 * Cálculo das linhas do Mapa Tributário, extraído de MapaCreditos.tsx.
 *
 * Vive aqui porque DUAS páginas precisam dele: /clientes/:id/mapa-creditos (time)
 * e /mapa/:token (cliente). Se cada uma recalculasse, o cliente veria um total e
 * o time veria outro — e ninguém saberia qual está certo.
 */

export interface LinhaMapa {
  cliente_id: string;
  tese_id: string;
  tese_codigo: string;
  tese_label: string;
  visivel_cliente: boolean;
  valor_apurado_inicial: number;
  total_compensado: number;
  saldo_final: number;
  incluir_no_calculo?: boolean;
  status_utilizacao?: "utilizado" | "em_uso" | "a_utilizar" | null;
}

export interface ClienteMapa {
  id: string;
  empresa: string | null;
  cnpj: string | null;
  data_apuracao: string | null;
}

/** Labels de produto (DB continua utilizado / em_uso / a_utilizar). */
export const STATUS_LABEL: Record<string, string> = {
  utilizado: "Compensado",
  em_uso: "Compensando",
  a_utilizar: "Não iniciado",
};

export const STATUS_STYLE: Record<string, string> = {
  utilizado: "bg-emerald-100 text-emerald-800",
  em_uso: "bg-amber-100 text-amber-800",
  a_utilizar: "bg-slate-100 text-slate-700",
};

// Ordem canônica das teses (matcheia a planilha SISTEMA do Alcir).
export const ORDEM_TESES: Record<string, number> = {
  INSUMOS: 1,
  SUBVENCAO: 2,
  ICMS_ST: 3,
  EXCLUSAO_ICMS_BC: 4,
  PIS_COFINS_JUD: 5,
  PREVIDENCIARIO: 6,
  REPORTO: 7,
};

export interface MapaRawInput {
  /** Linhas de v_mapa_creditos do cliente. */
  mapa: LinhaMapa[];
  /** Linhas de compensacoes_mensais do cliente. */
  compensacoes: CompensacaoSumRow[];
  /** processos_teses do cliente (id + código da tese). */
  processos: { id: string; tese: string | null }[];
  /** creditos_apurados do cliente (override manual do compensado). */
  creditos: { tese_id: string; valor_compensado_manual: number | null }[];
}

/**
 * Recalcula no client (sem depender de migration SQL no Lovable):
 * GREATEST(Detalhamento, soma aba com órfãs/tributo).
 *
 * Já devolve ordenado pela ordem canônica das teses.
 */
export function buildLinhasMapa(input: MapaRawInput): LinhaMapa[] {
  const processoIdsByTese = new Map<string, Set<string>>();
  for (const p of input.processos || []) {
    const cod = String(p.tese || "").toUpperCase();
    if (!cod) continue;
    if (!processoIdsByTese.has(cod)) processoIdsByTese.set(cod, new Set());
    processoIdsByTese.get(cod)!.add(p.id);
  }

  const manualByTese = new Map<string, number>();
  for (const row of input.creditos || []) {
    if (row.valor_compensado_manual != null) {
      manualByTese.set(row.tese_id, Number(row.valor_compensado_manual));
    }
  }

  return (input.mapa || [])
    .map((r) => {
      const codigo = String(r.tese_codigo || "").toUpperCase();
      if (codigo === "REPORTO") {
        return {
          ...r,
          total_compensado: 0,
          saldo_final: Number(r.valor_apurado_inicial || 0),
          status_utilizacao: "a_utilizar" as const,
        };
      }
      const fromAba = sumCompensadoForTese(input.compensacoes || [], {
        teseCodigo: codigo,
        teseId: r.tese_id,
        processoIds: processoIdsByTese.get(codigo),
      });
      const manual = manualByTese.get(r.tese_id);
      const compensado = Math.max(
        fromAba,
        manual != null ? manual : 0,
        Number(r.total_compensado || 0),
      );
      const apurado = Number(r.valor_apurado_inicial || 0);
      return {
        ...r,
        total_compensado: compensado,
        saldo_final: apurado - compensado,
        status_utilizacao: statusUtilizacaoFromSaldo(apurado, compensado),
      };
    })
    .sort((a, b) => (ORDEM_TESES[a.tese_codigo] ?? 99) - (ORDEM_TESES[b.tese_codigo] ?? 99));
}

export interface TotaisMapa {
  apurado: number;
  compensado: number;
  saldo: number;
}

/**
 * Totais do rodapé = só as teses incluídas no cálculo financeiro.
 *
 * Está aqui, e não no componente, pelo mesmo motivo de buildLinhasMapa: é regra
 * de negócio, e as duas páginas do Mapa precisam chegar no mesmo número.
 * Quando `incluir_no_calculo` não foi decidido pelo time, o default é INSUMOS e
 * SUBVENCAO — as teses do cálculo Fox.
 */
export function calcularTotais(linhas: LinhaMapa[]): TotaisMapa {
  return (linhas || [])
    .filter((r) => {
      if (typeof r.incluir_no_calculo === "boolean") return r.incluir_no_calculo;
      return r.tese_codigo === "INSUMOS" || r.tese_codigo === "SUBVENCAO";
    })
    .reduce(
      (acc, r) => ({
        apurado: acc.apurado + Number(r.valor_apurado_inicial || 0),
        compensado: acc.compensado + Number(r.total_compensado || 0),
        saldo: acc.saldo + Number(r.saldo_final || 0),
      }),
      { apurado: 0, compensado: 0, saldo: 0 },
    );
}
