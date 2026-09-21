import { memo, useMemo, useState } from "react";
import { Link, type NavigateFunction } from "react-router-dom";
import { AlertTriangle, Building2, Clock, Coins, Layers, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  TipoRecuperacaoFilter,
  buildRamoFlagsPorCliente,
  countByRamo,
  type RamoGerencialFiltro,
} from "@/components/StatusCompensacaoFilter";
import type { OperacionalDashboardData } from "@/services/operacionalDashboardService";
import {
  cargaPorResponsavel,
  compensacoesCanonicas,
  comparativoMensal,
  filaPrioridade,
  honorarioDe,
  projetarMensal,
  resumoEsteira,
  serieMensal,
} from "@/lib/operacional-analytics";
import {
  filtrarIdsRecorteGerencial,
  normalizarStatusCompensacao,
  type StatusCompensacao,
} from "@/lib/gerencial-filters";
import { compactCurrency } from "../dashboard-utils";
import { DarkPanel, DarkStat, KpiCard } from "../ui/primitives";
import { EvolucaoMensalChart } from "./EvolucaoMensalChart";
import { EsteiraPorEtapa } from "./EsteiraPorEtapa";
import { CargaTime } from "./CargaTime";
import { FilaPrioridade } from "./FilaPrioridade";

interface Props {
  data: OperacionalDashboardData;
  navigate: NavigateFunction;
}

/**
 * Visão Operacional: execução da carteira hoje — compensações, honorários,
 * saldo, esteira por etapa, carga do time e fila de prioridade — com
 * projeção dos próximos meses a partir do ritmo real.
 */
export const OperationalView = memo(function OperationalView({ data, navigate }: Props) {
  const [ramoFiltro, setRamoFiltro] = useState<RamoGerencialFiltro>("todas");
  const m = useMemo(() => {
    const agora = Date.now();
    const { totais, statusRows, esteira, slaConfig, intimacoes, clientes } = data;
    const statusMap = new Map(
      statusRows.map((row) => [row.cliente_id, normalizarStatusCompensacao(row)]),
    );
    const ramosMap = buildRamoFlagsPorCliente(data.processos);
    const idsCompensando = filtrarIdsRecorteGerencial(
      clientes.map((cliente) => cliente.id),
      new Set<StatusCompensacao>(["compensando"]),
      "todas",
      statusMap,
      ramosMap,
    );
    const idsRecorte = filtrarIdsRecorteGerencial(
      [...idsCompensando],
      new Set<StatusCompensacao>(["compensando"]),
      ramoFiltro,
      statusMap,
      ramosMap,
    );
    const totaisRecorte = totais.filter((row) => idsRecorte.has(row.cliente_id));
    const processosRecorte = data.processos.filter((row) => idsRecorte.has(row.cliente_id));
    const comps = compensacoesCanonicas(
      data.comps.filter((row) => idsRecorte.has(row.cliente_id)),
      data.teses,
      processosRecorte,
    );
    const apurado = totaisRecorte.reduce((s, t) => s + t.credito_apurado, 0);
    const compensado = totaisRecorte.reduce((s, t) => s + t.total_compensado, 0);
    const saldo = totaisRecorte.reduce((s, t) => s + t.saldo_restante, 0);
    const honorarios = comps.reduce((s, c) => s + honorarioDe(c), 0);
    const compensadoLancado = comps.reduce((s, c) => s + Number(c.valor_compensado ?? 0), 0);
    const taxaHon = compensadoLancado > 0 ? honorarios / compensadoLancado : 0;

    const serie = serieMensal(comps, 12, agora);
    const projecao = projetarMensal(serie, 3);
    const cmpComp = comparativoMensal(serie, "compensado");
    const cmpHon = comparativoMensal(serie, "honorarios");
    const mediaMensal = cmpComp.mediaFechados;
    const prazoSaldoMeses = mediaMensal > 0 ? saldo / mediaMensal : null;
    const projAnual = mediaMensal * 12;
    const proj3mComp = projecao.reduce((s, p) => s + p.compensado, 0);
    const proj3mHon = projecao.reduce((s, p) => s + p.honorarios, 0);

    const compensando = idsRecorte.size;
    const slaMap = new Map(slaConfig.map((c) => [c.estagio as string, c.sla_dias]));
    const etapas = resumoEsteira(esteira, slaConfig);
    const atrasadosEsteira = etapas.reduce((s, e) => s + e.atrasados, 0);
    const carga = cargaPorResponsavel(esteira, slaMap, agora);
    const saldoPorCliente = new Map(totais.map((t) => [t.cliente_id, t.saldo_restante]));
    const fila = filaPrioridade(esteira, saldoPorCliente, slaConfig, 8, agora);

    const pendentes = intimacoes.filter((i) => ["pendente", "informado_aline", "em_andamento"].includes(i.status));
    const em15 = new Date(agora + 15 * 86_400_000).toISOString().slice(0, 10);
    const vencendo = pendentes.filter((i) => i.prazo_vencimento && i.prazo_vencimento <= em15).length;

    return {
      ativos: clientes.length,
      recorte: idsRecorte.size,
      foraRecorte: clientes.length - idsRecorte.size,
      compensando,
      compensado,
      honorarios,
      taxaHon,
      saldo,
      serie,
      projecao,
      cmpComp,
      cmpHon,
      mediaMensal,
      prazoSaldoMeses,
      projAnual,
      proj3mComp,
      proj3mHon,
      etapas,
      atrasadosEsteira,
      carga,
      fila,
      intimPendentes: pendentes.length,
      intimVencendo: vencendo,
      semDados: comps.length === 0,
      ramoCounts: countByRamo([...idsCompensando], ramosMap),
    };
  }, [data, ramoFiltro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Recorte da visão operacional">
        <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-800">
          Status: Compensando
        </Badge>
        <TipoRecuperacaoFilter
          ramo={ramoFiltro}
          onChange={setRamoFiltro}
          counts={m.ramoCounts}
        />
        <span className="text-[11px] text-ink-35">
          {m.recorte} cliente{m.recorte === 1 ? "" : "s"} no recorte financeiro · {m.foraRecorte} ativo{m.foraRecorte === 1 ? "" : "s"} fora
        </span>
      </div>
      {(data.qualidade.clientesSemBaseFinanceira > 0 ||
        data.qualidade.compensacoesForaDaCarteiraAtiva > 0 ||
        data.qualidade.lancamentosForaDaRegraCanonica > 0 ||
        data.qualidade.clientesComSnapshotManual > 0 ||
        data.qualidade.clientesSemEtapa > 0 ||
        data.qualidade.clientesEmEtapaSemConfig > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-dash-amber/25 bg-dash-amber/[0.05] px-5 py-3 text-xs text-ink-60">
          <AlertTriangle className="h-4 w-4 shrink-0 text-dash-amber" />
          <span className="font-semibold text-ink">Dados incompletos:</span>
          {data.qualidade.compensacoesForaDaCarteiraAtiva > 0 && <span>{data.qualidade.compensacoesForaDaCarteiraAtiva} lançamento(s) de clientes inativos excluídos</span>}
          {data.qualidade.lancamentosForaDaRegraCanonica > 0 && <span>{data.qualidade.lancamentosForaDaRegraCanonica} lançamento(s) REPORTO/duplicado(s) excluídos</span>}
          {data.qualidade.clientesSemBaseFinanceira > 0 && <span>{data.qualidade.clientesSemBaseFinanceira} cliente(s) sem crédito/processo financeiro</span>}
          {data.qualidade.clientesComSnapshotManual > 0 && <span>{data.qualidade.clientesComSnapshotManual} cliente(s) com snapshot manual no mapa</span>}
          {data.qualidade.clientesSemEtapa > 0 && <span>{data.qualidade.clientesSemEtapa} sem etapa</span>}
          {data.qualidade.clientesEmEtapaSemConfig > 0 && <span>{data.qualidade.clientesEmEtapaSemConfig} em etapa sem configuração</span>}
        </div>
      )}
      {m.semDados && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-dash-amber/25 bg-dash-amber/[0.05]">
          <AlertTriangle className="w-4 h-4 text-dash-amber shrink-0" />
          <p className="text-xs text-ink-60 flex-1">Nenhuma compensação encontrada no recorte atual.</p>
          <Link to="/clientes" className="text-[11px] font-bold text-dash-amber hover:underline whitespace-nowrap">Ir para clientes →</Link>
        </div>
      )}

      <div className="animate-slide-up delay-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" role="region" aria-label="KPIs operacionais">
        <KpiCard label="Clientes ativos" raw={m.ativos} sub={`${m.compensando} compensando no recorte`} icon={<Building2 />} onClick={() => navigate("/clientes")} size="md" />
        <KpiCard label="Compensado no mês" raw={m.cmpComp.atual} format={compactCurrency} sub={`mês anterior ${compactCurrency(m.cmpComp.anterior)}`} trend={m.cmpComp.variacaoPct ?? undefined} trendSuffix="%" tom="green" icon={<TrendingUp />} size="md" />
        <KpiCard label="Honorários no mês" raw={m.cmpHon.atual} format={compactCurrency} sub={`taxa média ${(m.taxaHon * 100).toFixed(1)}% · ${compactCurrency(m.honorarios)} acumulados`} trend={m.cmpHon.variacaoPct ?? undefined} trendSuffix="%" tom="gold" icon={<Coins />} size="md" />
        <KpiCard label="Saldo a compensar" raw={m.saldo} format={compactCurrency} sub={m.prazoSaldoMeses != null ? `${m.recorte} clientes · ≈ ${m.prazoSaldoMeses.toFixed(1)} meses` : `${m.recorte} clientes · sem ritmo médio ainda`} tom="navy" icon={<Layers />} size="md" />
        <KpiCard label="Atrasados na esteira" raw={m.atrasadosEsteira} sub={`de ${data.esteira.length} clientes na esteira`} tom={m.atrasadosEsteira > 0 ? "red" : "green"} icon={<Clock />} onClick={() => navigate("/esteira?tab=acompanhamento")} size="md" />
        <KpiCard label="Intimações pendentes" raw={m.intimPendentes} sub={m.intimVencendo > 0 ? `${m.intimVencendo} vencem em 15 dias` : "nenhuma vencendo em 15 dias"} tom={m.intimVencendo > 0 ? "red" : m.intimPendentes > 0 ? "amber" : "muted"} icon={<AlertTriangle />} onClick={() => navigate("/intimacoes")} size="md" />
      </div>

      <div className="animate-slide-up delay-2 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 min-w-0">
          <EvolucaoMensalChart serie={m.serie} projecao={m.projecao} variacaoPct={m.cmpComp.variacaoPct} mediaMensal={m.mediaMensal} />
        </div>
        <div className="xl:col-span-4 min-w-0">
          <DarkPanel eyebrow="Projeção" title="Próximos meses no ritmo atual" className="h-full">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <DarkStat label="Compensado · 3 meses" value={compactCurrency(m.proj3mComp)} sub={m.projecao.map((p) => p.label).join(" · ")} tom="white" />
              <DarkStat label="Honorários · 3 meses" value={compactCurrency(m.proj3mHon)} sub="tendência dos meses fechados" tom="gold" />
              <DarkStat label="Projeção anual" value={compactCurrency(m.projAnual)} sub={`média ${compactCurrency(m.mediaMensal)} × 12`} />
              <DarkStat label="Honorários no saldo" value={compactCurrency(m.saldo * m.taxaHon)} sub={`sobre ${compactCurrency(m.saldo)} a compensar`} tom="gold" />
            </div>
            <div className="mt-5 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between text-[10px] text-white/50 uppercase tracking-[1.4px] font-bold mb-2">
                <span>Prazo do saldo</span>
                <span>{m.prazoSaldoMeses != null ? `${m.prazoSaldoMeses.toFixed(1)} meses` : "—"}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gold" style={{ width: `${m.prazoSaldoMeses != null ? Math.min(100, (m.prazoSaldoMeses / 24) * 100) : 0}%` }} />
              </div>
              <p className="text-[10px] text-white/45 mt-2 leading-snug">
                {m.prazoSaldoMeses != null && m.prazoSaldoMeses < 9
                  ? "Saldo se esgota em menos de 9 meses: é hora de levantar novas teses na carteira atual ou onboardar clientes."
                  : "Barra cheia = 24 meses de saldo no ritmo médio atual."}
              </p>
            </div>
          </DarkPanel>
        </div>
      </div>

      <div className="animate-slide-up delay-3 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 min-w-0">
          <EsteiraPorEtapa etapas={m.etapas} clientes={data.esteira} />
        </div>
        <div className="xl:col-span-5 min-w-0">
          <CargaTime carga={m.carga} />
        </div>
      </div>

      <div className="animate-slide-up delay-4">
        <FilaPrioridade fila={m.fila} />
      </div>
    </div>
  );
});
