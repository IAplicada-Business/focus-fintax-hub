import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SkeletonKpi } from "@/components/dashboard/SkeletonKpi";
import { useCountUp } from "@/hooks/useCountUp";
import { useAuth } from "@/hooks/useAuth";
import { useLeadsFunil, usePipelineSlaConfig, useUpdatePipelineSlaMeta } from "@/hooks/data/usePipelineSla";
import { resumirSlaFunil, serieGraficoSla, type EtapaFunil, type FiltroFilaSla } from "@/lib/pipeline-sla";
import { compactCurrency } from "../dashboard-utils";
import { SlaFunilChart } from "./sla-funil/SlaFunilChart";
import { SlaFunilTabela } from "./sla-funil/SlaFunilTabela";

/**
 * Aba "SLA do funil" do Dashboard comercial: tempo parado por etapa do
 * pipeline de leads vs meta (gráfico barras + linha) e a fila de leads
 * atrasados em tabela, com etapa editável e abertura direta no pipeline.
 */
export function SlaFunilTab() {
  const { userRole } = useAuth();
  const podeEditarMeta = userRole === "admin" || userRole === "pmo";
  const [filtro, setFiltro] = useState<FiltroFilaSla>("atrasados");

  const leadsQ = useLeadsFunil();
  const cfgQ = usePipelineSlaConfig();
  const salvarMeta = useUpdatePipelineSlaMeta();

  const resumo = useMemo(
    () => (leadsQ.data && cfgQ.data ? resumirSlaFunil(leadsQ.data, cfgQ.data) : null),
    [leadsQ.data, cfgQ.data],
  );
  const serie = useMemo(() => (resumo ? serieGraficoSla(resumo) : []), [resumo]);
  const potencialTravado = useMemo(
    () => resumo?.atrasados.reduce((s, l) => s + Number(l.lead.potencial ?? 0), 0) ?? 0,
    [resumo],
  );

  const animAtrasados = useCountUp(resumo?.totalAtrasados ?? 0);
  const animNoPrazo = useCountUp(resumo?.totalNoPrazo ?? 0);
  const animAtraso = useCountUp(resumo?.atrasoAcumulado ?? 0);

  const onSalvarMeta = async (etapa: EtapaFunil, raw: string, atual: number | null) => {
    const trimmed = raw.trim();
    const novo = trimmed === "" ? null : Math.max(0, Math.floor(Number(trimmed)));
    if (novo !== null && !Number.isFinite(novo)) return;
    if (novo === atual) return;
    try {
      await salvarMeta.mutateAsync({ etapa, slaDias: novo });
      toast.success("Meta atualizada.");
    } catch {
      /* toastError já disparou */
    }
  };

  const onSelecionarEtapa = (etapa: EtapaFunil) => setFiltro((atual) => (atual === etapa ? "atrasados" : etapa));
  const etapaAtiva = filtro !== "atrasados" && filtro !== "todos" ? filtro : null;

  if (leadsQ.isLoading || cfgQ.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonKpi />
        <div className="card-base h-[360px] animate-pulse" />
        <div className="card-base h-[320px] animate-pulse" />
      </div>
    );
  }

  if (leadsQ.isError || !resumo) {
    return (
      <div className="card-base px-5 py-10 text-center space-y-3">
        <p className="text-sm font-semibold text-navy">Não foi possível carregar o SLA do funil</p>
        <p className="text-xs text-ink-35">{(leadsQ.error as Error)?.message || "Tente novamente em instantes."}</p>
        <button type="button" onClick={() => leadsQ.refetch()} className="text-xs font-semibold text-navy underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="animate-slide-up delay-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Leads atrasados" valor={String(animAtrasados)} sub="acima da meta da etapa" tom="text-dash-red" />
        <Kpi label="No prazo" valor={String(animNoPrazo)} sub={`de ${resumo.linhas.length} no funil`} tom="text-dash-green" />
        <Kpi label="Atraso acumulado" valor={`${animAtraso}d`} sub="soma dos dias acima da meta" tom="text-navy" />
        <Kpi
          label="Potencial travado"
          valor={potencialTravado > 0 ? compactCurrency(potencialTravado) : "—"}
          sub="potencial máx. dos leads atrasados"
          tom={potencialTravado > 0 ? "text-dash-amber" : "text-navy"}
        />
      </div>

      <div className="animate-slide-up delay-2">
        <SlaFunilChart
          serie={serie}
          etapas={resumo.etapas}
          etapaAtiva={etapaAtiva}
          podeEditarMeta={podeEditarMeta}
          salvandoMeta={salvarMeta.isPending}
          onSelecionarEtapa={onSelecionarEtapa}
          onSalvarMeta={(etapa, raw, atual) => void onSalvarMeta(etapa, raw, atual)}
        />
      </div>

      <div className="animate-slide-up delay-3">
        <SlaFunilTabela resumo={resumo} filtro={filtro} onFiltro={setFiltro} />
      </div>
    </div>
  );
}

function Kpi({ label, valor, sub, tom }: { label: string; valor: string; sub: string; tom: string }) {
  return (
    <div className="card-base p-5 min-h-[110px] flex flex-col justify-between">
      <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35">{label}</p>
      <div>
        <p className={`font-display text-[36px] font-bold leading-none ${tom}`}>{valor}</p>
        <p className="text-xs text-ink-35 mt-1.5">{sub}</p>
      </div>
    </div>
  );
}
