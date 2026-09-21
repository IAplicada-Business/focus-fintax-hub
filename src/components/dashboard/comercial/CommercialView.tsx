import { memo, useMemo, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Clock, FileSignature, Sparkles, Target, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useComercialDashboard } from "@/hooks/data/useComercialDashboard";
import { useUpdatePipelineSlaMeta } from "@/hooks/data/usePipelineSla";
import {
  clientesConvertidosNoFunil,
  etapaUnificada,
  leadAtivo,
  leadsParados,
  leadsPorOrigem,
  pipelinePonderado,
  projetarSerieSemanal,
  resumoAtendimento,
  ritmoSemanal,
  serieSemanalLeads,
  tempoMedioAteEtapa,
} from "@/lib/comercial-analytics";
import { resumirSlaFunil, serieGraficoSla, type EtapaFunil, type FiltroFilaSla } from "@/lib/pipeline-sla";
import { agregarMixRegime } from "@/lib/regime-mix";
import { agruparPorSegmento } from "@/lib/segmento-lead";
import { getScoreLabel } from "@/lib/pipeline-constants";
import { compactCurrency, FUNNEL_STAGES_COM, type FunnelRow } from "../dashboard-utils";
import { ErrorCard, KpiCard, LoadingGrid, CountChip } from "../ui/primitives";
import { EvolucaoLeadsChart } from "./EvolucaoLeadsChart";
import { ProjecaoComercial } from "./ProjecaoComercial";
import { FunilConversao } from "./FunilConversao";
import { AtendimentoPulse } from "./AtendimentoPulse";
import { OrigemLeads } from "./OrigemLeads";
import { PerfilLeads } from "./PerfilLeads";
import { SlaFunilChart } from "./sla-funil/SlaFunilChart";
import { SlaFunilTabela } from "./sla-funil/SlaFunilTabela";

const MS_DIA = 86_400_000;

interface Props {
  navigate: NavigateFunction;
}

/**
 * Visão Comercial em uma página só. Antes eram três abas que repetiam KPIs
 * (Visão geral, SLA do funil, Ciclo & SLA); agora a leitura é de cima para
 * baixo: números → evolução e projeção → funil e atendimento → SLA e origem →
 * perfil da carteira → fila de quem destravar.
 */
export const CommercialView = memo(function CommercialView({ navigate }: Props) {
  const { userRole } = useAuth();
  const podeEditarMeta = userRole === "admin" || userRole === "pmo";
  const { data, isLoading, isError, error, refetch } = useComercialDashboard();
  const salvarMeta = useUpdatePipelineSlaMeta();
  const [filtroSla, setFiltroSla] = useState<FiltroFilaSla>("atrasados");
  const [filaAberta, setFilaAberta] = useState(false);
  const filaRef = useRef<HTMLDivElement>(null);

  const m = useMemo(() => {
    if (!data) return null;
    const agora = Date.now();
    const { leads, historico, conversas, slaConfig, motor } = data;
    const ativos = leads.filter(leadAtivo);
    const clientesConvertidos = clientesConvertidosNoFunil(leads);
    const emAndamento = ativos.filter((l) => etapaUnificada(l.status_funil) !== "cliente_ativo");
    const d7 = agora - 7 * MS_DIA;
    const d14 = agora - 14 * MS_DIA;
    const t = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
    const novos7 = leads.filter((l) => t(l.criado_em) >= d7).length;
    const novos7Ant = leads.filter((l) => t(l.criado_em) >= d14 && t(l.criado_em) < d7).length;
    const potencialAberto = emAndamento.reduce((s, l) => s + l.potencial, 0);
    const contratos = emAndamento.filter((l) => etapaUnificada(l.status_funil) === "contrato_emitido").length;
    const taxaConversao = leads.length > 0 ? Math.round((clientesConvertidos / leads.length) * 100) : 0;

    const serie = serieSemanalLeads(leads, historico, 12, agora);
    const projecao = projetarSerieSemanal(serie, 4);
    const ritmoNovos = ritmoSemanal(serie, "novos");
    const ritmoContratos = ritmoSemanal(serie, "contratos");
    const ponderado = pipelinePonderado(emAndamento);
    const tempoAteContrato = tempoMedioAteEtapa(leads, historico);

    const contagem: Record<string, { count: number; potencial: number }> = {};
    for (const s of FUNNEL_STAGES_COM) contagem[s.value] = { count: 0, potencial: 0 };
    for (const l of emAndamento) {
      const etapa = etapaUnificada(l.status_funil);
      // A UI ainda chama esta coluna de levantamento; estágios legados
      // desconhecidos permanecem visíveis em Novo em vez de sumirem do funil.
      const key = etapa === "em_negociacao"
        ? "levantamento_teses"
        : contagem[etapa]
          ? etapa
          : "novo";
      contagem[key].count += 1;
      contagem[key].potencial += l.potencial;
    }
    const funnelData: FunnelRow[] = FUNNEL_STAGES_COM.map((s) => ({
      stage: s.value,
      label: s.label,
      color: s.color,
      count: s.value === "cliente_ativo" ? clientesConvertidos : contagem[s.value].count,
      potencial: contagem[s.value].potencial,
    }));

    const sla = resumirSlaFunil(leads, slaConfig, agora);
    const serieSla = serieGraficoSla(sla);
    const potencialTravado = sla.atrasados.reduce((s, l) => s + Number(l.lead.potencial ?? 0), 0);
    const parados = leadsParados(emAndamento, "contrato_emitido", 3, agora);

    const atendimento = resumoAtendimento(conversas, agora);
    const origens = leadsPorOrigem(ativos);
    const regimeMix = agregarMixRegime(
      emAndamento.map((l) => ({ regime_tributario: l.regime_tributario, potencial: l.potencial })),
      motor.regimes,
    );
    const segmentoData = agruparPorSegmento(emAndamento.map((l) => l.segmento));
    const scoreDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const l of emAndamento) scoreDistribution[getScoreLabel(l.score_lead)] += 1;

    return {
      emAndamento: emAndamento.length,
      novos7,
      trend7: novos7 - novos7Ant,
      potencialAberto,
      contratos,
      parados: parados.length,
      taxaConversao,
      serie,
      projecao,
      ritmoNovos,
      ritmoContratos,
      ponderado,
      tempoAteContrato,
      funnelData,
      sla,
      serieSla,
      potencialTravado,
      atendimento,
      origens,
      regimeMix,
      segmentoData,
      scoreDistribution,
      motor,
      conversas,
      leads,
    };
  }, [data]);

  if (isLoading) return <LoadingGrid />;
  if (isError || !m) {
    return <ErrorCard title="Não foi possível carregar a Visão Comercial" message={(error as Error)?.message} onRetry={() => refetch()} />;
  }

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
  const onSelecionarEtapa = (etapa: EtapaFunil) => {
    setFiltroSla((atual) => (atual === etapa ? "atrasados" : etapa));
    setFilaAberta(true);
  };
  const etapaAtiva = filtroSla !== "atrasados" && filtroSla !== "todos" ? filtroSla : null;
  const abrirFila = () => {
    setFilaAberta(true);
    requestAnimationFrame(() => filaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-4">
      {/* 1. Números do dia */}
      <div className="animate-slide-up delay-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" role="region" aria-label="KPIs comerciais">
        <KpiCard label="Leads em andamento" raw={m.emAndamento} sub="no funil, sem perdidos" icon={<Users />} onClick={() => navigate("/pipeline")} size="md" />
        <KpiCard label="Novos em 7 dias" raw={m.novos7} sub="vs. 7 dias anteriores" trend={m.trend7} trendSuffix=" leads" icon={<UserPlus />} size="md" />
        <KpiCard label="Potencial em aberto" raw={m.potencialAberto} format={compactCurrency} sub="soma do potencial máximo" tom="navy" icon={<Target />} size="md" />
        <KpiCard label="Pipeline ponderado" raw={m.ponderado.total} format={compactCurrency} sub="potencial × probabilidade da etapa" tom="gold" icon={<Sparkles />} size="md" />
        <KpiCard
          label="Contratos emitidos"
          raw={m.contratos}
          sub={m.parados > 0 ? `${m.parados} sem movimento há +3 dias` : "aguardando assinatura"}
          tom="amber"
          icon={<FileSignature />}
          onClick={() => navigate("/pipeline?etapa=contrato_emitido")}
          size="md"
        />
        <KpiCard
          label="Atrasados no SLA"
          raw={m.sla.totalAtrasados}
          sub={m.potencialTravado > 0 ? `${compactCurrency(m.potencialTravado)} travados · ${m.sla.totalNoPrazo} no prazo` : `${m.sla.totalNoPrazo} no prazo`}
          tom={m.sla.totalAtrasados > 0 ? "red" : "green"}
          icon={<Clock />}
          onClick={abrirFila}
          size="md"
        />
      </div>

      {/* 2. Evolução + projeção */}
      <div className="animate-slide-up delay-2 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 min-w-0">
          <EvolucaoLeadsChart serie={m.serie} projecao={m.projecao} ritmoNovos={m.ritmoNovos} ritmoContratos={m.ritmoContratos} />
        </div>
        <div className="xl:col-span-4 min-w-0">
          <ProjecaoComercial
            ponderado={m.ponderado}
            ritmoNovos={m.ritmoNovos}
            ritmoContratos={m.ritmoContratos}
            tempoAteContrato={m.tempoAteContrato}
            taxaConversao={m.taxaConversao}
            contratosEmitidos={m.contratos}
          />
        </div>
      </div>

      {/* 3. Funil + atendimento */}
      <div className="animate-slide-up delay-3 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 min-w-0">
          <FunilConversao funnelData={m.funnelData} navigate={navigate} />
        </div>
        <div className="xl:col-span-5 min-w-0">
          <AtendimentoPulse resumo={m.atendimento} conversas={m.conversas} leads={m.leads} />
        </div>
      </div>

      {/* 4. SLA + origem */}
      <div className="animate-slide-up delay-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 min-w-0">
          <SlaFunilChart
            serie={m.serieSla}
            etapas={m.sla.etapas}
            etapaAtiva={etapaAtiva}
            podeEditarMeta={podeEditarMeta}
            salvandoMeta={salvarMeta.isPending}
            onSelecionarEtapa={onSelecionarEtapa}
            onSalvarMeta={(etapa, raw, atual) => void onSalvarMeta(etapa, raw, atual)}
          />
        </div>
        <div className="xl:col-span-4 min-w-0">
          <OrigemLeads origens={m.origens} />
        </div>
      </div>

      {/* 5. Perfil */}
      <div className="animate-slide-up delay-5">
        <PerfilLeads regimeMix={m.regimeMix} segmentoData={m.segmentoData} scoreDistribution={m.scoreDistribution} motor={m.motor} />
      </div>

      {/* 6. Fila de quem destravar (recolhível) */}
      <div ref={filaRef} className="animate-slide-up delay-5 scroll-mt-24">
        <button
          type="button"
          onClick={() => setFilaAberta((v) => !v)}
          aria-expanded={filaAberta}
          className="w-full card-base px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:shadow-soft-hover transition-shadow"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${m.sla.totalAtrasados > 0 ? "bg-dash-red" : "bg-dash-green"}`} />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-navy">Fila do SLA — quem destravar primeiro</p>
              <p className="text-[11px] text-ink-35">Leads por etapa com etapa editável e abertura direta no pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CountChip tom={m.sla.totalAtrasados > 0 ? "red" : "green"}>{m.sla.totalAtrasados} atrasado{m.sla.totalAtrasados !== 1 ? "s" : ""}</CountChip>
            {filaAberta ? <ChevronUp className="w-4 h-4 text-ink-35" /> : <ChevronDown className="w-4 h-4 text-ink-35" />}
          </div>
        </button>
        {filaAberta && (
          <div className="mt-3">
            <SlaFunilTabela resumo={m.sla} filtro={filtroSla} onFiltro={setFiltroSla} />
          </div>
        )}
      </div>
    </div>
  );
});
