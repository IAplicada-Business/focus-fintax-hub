import { supabase } from "@/integrations/supabase/client";
import {
  ESTEIRA_STAGES,
  ESTEIRA_SLA_DIAS,
  isClienteAtrasadoSla,
  projetarAtrasoPorEtapa,
  type EstagioEsteira,
  type ProjetaoAtrasoEtapa,
} from "@/lib/esteira-constants";
import { listEsteiraClientes, type EsteiraCliente } from "@/services/esteiraService";

export interface EsteiraSlaEtapaRow {
  estagio: EstagioEsteira;
  label?: string;
  sla_dias: number | null;
  ordem: number;
  clientes_na_etapa: number;
  dias_medios_atuais: number | null;
  atrasados: number;
  atraso_acumulado_dias: number;
  tempo_medio_dias: number | null;
  ciclos_concluidos: number;
}

export interface EsteiraSlaData {
  etapas: EsteiraSlaEtapaRow[];
  clientes: EsteiraCliente[];
  atrasados: EsteiraCliente[];
  totalAtrasados: number;
  totalNoPrazo: number;
  projecao: ProjetaoAtrasoEtapa[];
}

function emptyEtapas(): EsteiraSlaEtapaRow[] {
  return ESTEIRA_STAGES.map((s, i) => ({
    estagio: s.value,
    sla_dias: ESTEIRA_SLA_DIAS[s.value],
    ordem: i + 1,
    clientes_na_etapa: 0,
    dias_medios_atuais: null,
    atrasados: 0,
    atraso_acumulado_dias: 0,
    tempo_medio_dias: null,
    ciclos_concluidos: 0,
  }));
}

/**
 * Preferência: view `v_esteira_sla` (após migration).
 * Fallback: agrega no client a partir de `v_esteira_clientes` se a view
 * ainda não existir no projeto (migration pendente no Lovable).
 */
export async function fetchEsteiraSla(): Promise<EsteiraSlaData> {
  const clientes = await listEsteiraClientes();

  const { data: viewRows, error } = await (supabase as any)
    .from("v_esteira_sla")
    .select("*")
    .order("ordem", { ascending: true });

  let etapas: EsteiraSlaEtapaRow[];

  if (error || !viewRows) {
    if (error) {
      console.warn("v_esteira_sla indisponível — usando agregação client-side", error.message);
    }
    const proj = projetarAtrasoPorEtapa(clientes);
    etapas = emptyEtapas().map((base) => {
      const p = proj.find((x) => x.estagio === base.estagio)!;
      const naEtapa = clientes.filter((c) => c.estagio_esteira === base.estagio);
      const media =
        naEtapa.length === 0
          ? null
          : Math.round(
              (naEtapa.reduce((s, c) => s + (c.dias_na_etapa || 0), 0) / naEtapa.length) * 10,
            ) / 10;
      return {
        ...base,
        clientes_na_etapa: p.clientes,
        dias_medios_atuais: media,
        atrasados: p.atrasados,
        atraso_acumulado_dias: p.atrasoAcumuladoDias,
      };
    });
  } else {
    const byEstagio = new Map(
      (viewRows as EsteiraSlaEtapaRow[]).map((r) => [r.estagio, r]),
    );
    etapas = emptyEtapas().map((base) => {
      const row = byEstagio.get(base.estagio);
      return row
        ? {
            ...base,
            ...row,
            sla_dias: row.sla_dias ?? base.sla_dias,
          }
        : base;
    });
  }

  const atrasados = clientes.filter((c) =>
    typeof c.atrasado === "boolean"
      ? c.atrasado
      : isClienteAtrasadoSla(c.estagio_esteira, c.dias_na_etapa ?? 0),
  );
  const totalAtrasados = atrasados.length;
  const totalNoPrazo = Math.max(0, clientes.length - totalAtrasados);

  return {
    etapas,
    clientes,
    atrasados,
    totalAtrasados,
    totalNoPrazo,
    projecao: projetarAtrasoPorEtapa(clientes),
  };
}
