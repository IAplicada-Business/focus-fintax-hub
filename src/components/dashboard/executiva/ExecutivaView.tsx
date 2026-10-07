import { memo, useMemo, useState } from "react";
import { Link, type NavigateFunction } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronUp, Coins, Layers, PieChart, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import {
  STATUS_COMPENSACAO_COLORS,
  STATUS_COMPENSACAO_LABELS,
  STATUS_COMPENSACAO_VALUES,
  STATUS_FILTRO_VALUES,
  StatusCompensacaoFilter,
  TipoRecuperacaoFilter,
  buildRamoFlagsPorCliente,
  countByStatus,
  type RamoGerencialFiltro,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import type { OperacionalDashboardData } from "@/services/operacionalDashboardService";
import {
  carteiraPorTese,
  compensacoesCanonicas,
  geracaoTesesPorMes,
  honorarioDe,
  resumirFinanceiroPorCliente,
} from "@/lib/operacional-analytics";
import { STATUS_FILTRO_EXTRAS, normalizarStatusCompensacao } from "@/lib/gerencial-filters";
import { makeRecorteGerencial } from "@/lib/recorte-gerencial";
import { ramosDoCliente } from "@/lib/esteira-acompanhamento";
import { TIPO_RECUPERACAO_LABEL } from "@/lib/tipo-recuperacao";
import { compactCurrency } from "../dashboard-utils";
import { BarList, KpiCard, LinkMore, Panel, InlineEmpty, CountChip } from "../ui/primitives";
import { cn } from "@/lib/utils";
import { TipoTeseFilter } from "@/components/TipoTeseFilter";
import {
  filtrarCreditosPorTipoTese,
  filtrarProcessosPorTipoTese,
  listarTiposTese,
  rotuloFiltroTese,
  teseFiltroAtivo,
  type TipoTeseFiltro,
} from "@/lib/tese-filter";
import { DashboardPeriodFilter } from "@/components/DashboardPeriodFilter";
import {
  dashboardPeriodEndMonth,
  dashboardPeriodLabel,
  dashboardPeriodOptions,
  defaultDashboardPeriod,
  filterCompsByDashboardPeriod,
  filterProcessosByDashboardPeriod,
  type DashboardPeriod,
} from "@/lib/dashboard-period";

interface Props {
  data: OperacionalDashboardData;
  navigate: NavigateFunction;
}

const STATUS_BAR_COLORS: Record<StatusCompensacao, string> = {
  compensando: "#0f7b4e",
  prevista: "#1c3150",
  reporto: "#8a8f98",
  encerrado: "#8a8f98",
  recuperacao_judicial: "#4f46e5",
  ressarcimento_concluido: "#0f766e",
  sem_operacao: "#c9c9c9",
};

const TRIBUTO_LABELS: Record<string, string> = {
  INSS_52: "INSS",
  INSS_retidos: "INSS retidos",
  PIS: "PIS",
  COFINS: "COFINS",
  ICMS: "ICMS",
  IRPJ_CSLL_agregado: "IRPJ/CSLL",
  DCTWEB_trimestral: "DCTFWeb",
  outros: "Outros",
};

const AXIS_TICK = { fontSize: 10, fill: "var(--ink-35)", fontFamily: "'DM Mono', monospace", fontWeight: 500 };
const MAX_RECORTE = 8;

/**
 * Visão Executiva: a carteira pelo ângulo das teses — quanto cada tese
 * apurou, compensou e ainda tem de saldo; quantas teses novas o time gerou
 * por mês; status da carteira; tributos; quem concentra o crédito.
 */
export const ExecutivaView = memo(function ExecutivaView({ data, navigate }: Props) {
  const [verTodosRecorte, setVerTodosRecorte] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<Set<StatusCompensacao>>(
    new Set(STATUS_FILTRO_VALUES),
  );
  const [ramoFiltro, setRamoFiltro] = useState<RamoGerencialFiltro>("todas");
  const [tipoTeseFiltro, setTipoTeseFiltro] = useState<TipoTeseFiltro>([]);
  const [periodo, setPeriodo] = useState<DashboardPeriod>(() =>
    defaultDashboardPeriod(data.compsRaw),
  );

  const m = useMemo(() => {
    const statusMapCompleto = new Map(
      data.statusRows.map((row) => [row.cliente_id, normalizarStatusCompensacao(row)]),
    );
    const ramosMap = buildRamoFlagsPorCliente(data.processos);
    const recorte = makeRecorteGerencial({
      clienteIds: data.clientes.map((cliente) => cliente.id),
      statusMap: statusMapCompleto,
      ramosMap,
      tipoTese: tipoTeseFiltro,
      periodo,
      processos: data.processos,
      creditos: data.creditos,
      teses: data.teses,
      comps: data.compsRaw,
    });
    const ids = recorte.recortePara(ramoFiltro, statusFiltro);
    const { ramoCounts, statusCounts } = recorte.contagens(ramoFiltro, statusFiltro);
    const clientes = data.clientes.filter((cliente) => ids.has(cliente.id));
    const compsRawPeriodo = filterCompsByDashboardPeriod(
      data.compsRaw.filter((row) => ids.has(row.cliente_id)),
      periodo,
    );
    // Apurado, compensado e saldo são estoque: subtraem tudo que foi compensado
    // até o fim do período (não só o mês escolhido), como o card da ficha.
    const periodoOptionsBase = dashboardPeriodOptions(data.compsRaw);
    const totaisCalculados = resumirFinanceiroPorCliente(
      ids,
      data.compsRaw.filter((row) => ids.has(row.cliente_id)),
      data.creditos,
      data.teses,
      data.processos,
      tipoTeseFiltro,
      { mesFim: periodo.mode === "accumulated" ? null : dashboardPeriodEndMonth(periodo, periodoOptionsBase) },
    );
    const totaisBase = new Map(data.totais.map((total) => [total.cliente_id, total]));
    const totais = totaisCalculados.map((total) =>
      !teseFiltroAtivo(tipoTeseFiltro) && total.sem_base_financeira
        ? { ...total, ...(totaisBase.get(total.cliente_id) ?? {}) }
        : total,
    );
    const processosDoCliente = data.processos.filter((row) => ids.has(row.cliente_id));
    const processos = filterProcessosByDashboardPeriod(
      filtrarProcessosPorTipoTese(processosDoCliente, tipoTeseFiltro),
      periodo,
    );
    const creditos = filtrarCreditosPorTipoTese(
      data.creditos.filter((row) => ids.has(row.cliente_id)),
      data.teses,
      tipoTeseFiltro,
    );
    const comps = compensacoesCanonicas(
      compsRawPeriodo,
      data.teses,
      processosDoCliente,
      tipoTeseFiltro,
    );
    const compsReporto = teseFiltroAtivo(tipoTeseFiltro)
      ? []
      : compensacoesCanonicas(
          compsRawPeriodo,
          data.teses,
          processosDoCliente,
          ["REPORTO"],
        );
    const statusRows = data.statusRows.filter((row) => ids.has(row.cliente_id));
    const { teses } = data;
    const apurado = totais.reduce((s, t) => s + t.credito_apurado, 0);
    const compensado = totais.reduce((s, t) => s + t.total_compensado, 0);
    const saldo = totais.reduce((s, t) => s + t.saldo_restante, 0);
    const honorarios = comps.reduce((s, c) => s + honorarioDe(c), 0);
    const pctUtilizado = apurado > 0 ? (compensado / apurado) * 100 : 0;

    const porTese = carteiraPorTese(
      teses,
      creditos,
      [...comps, ...compsReporto],
      processos,
      {
        incluirForaDoCalculo: true,
        processosParaVinculo: processosDoCliente,
      },
    );
    const periodoOptions = dashboardPeriodOptions(data.compsRaw);
    const fimMes = dashboardPeriodEndMonth(periodo, periodoOptions);
    const mesesGeracao = periodo.mode === "year" ? 12 : 6;
    const geracao = fimMes
      ? geracaoTesesPorMes(processos, mesesGeracao, Date.now(), fimMes)
      : [];
    const tesesPeriodo = processos.length;

    const contagem = countByStatus(
      statusRows.map((row) => row.cliente_id),
      new Map(statusRows.map((row) => [row.cliente_id, normalizarStatusCompensacao(row)])),
      ramosMap,
    );
    const statusRowsOrd = STATUS_COMPENSACAO_VALUES
      .map((status) => ({ status, count: contagem[status] }))
      .sort((a, b) => b.count - a.count);
    const totalStatus = statusRowsOrd.reduce((s, r) => s + r.count, 0);
    const statusExtras = STATUS_FILTRO_EXTRAS.map((status) => ({ status, count: contagem[status] }));
    const semOperacao = contagem.sem_operacao;

    const tributo = new Map<string, { compensado: number; clientes: Set<string> }>();
    for (const c of comps) {
      const t = c.tributo_enum || c.tributo || "outros";
      const cur = tributo.get(t) ?? { compensado: 0, clientes: new Set<string>() };
      cur.compensado += Number(c.valor_compensado ?? 0);
      cur.clientes.add(c.cliente_id);
      tributo.set(t, cur);
    }
    const porTributo = [...tributo.entries()]
      .map(([k, v]) => ({ tributo: k, label: TRIBUTO_LABELS[k] ?? k, compensado: v.compensado, clientes: v.clientes.size }))
      .filter((r) => r.compensado > 0)
      .sort((a, b) => b.compensado - a.compensado);

    const saldoPorCliente = new Map(totais.map((t) => [t.cliente_id, t]));
    const semTese = clientes
      .filter((c) => !c.tese_ativa_id)
      .map((c) => ({
        id: c.id,
        empresa: c.empresa,
        status: statusMapCompleto.get(c.id) ?? "sem_operacao",
        apurado: saldoPorCliente.get(c.id)?.credito_apurado ?? 0,
        saldo: saldoPorCliente.get(c.id)?.saldo_restante ?? 0,
      }))
      .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));

    const recorteLista = clientes
      .map((c) => ({
        id: c.id,
        empresa: c.empresa,
        status: statusMapCompleto.get(c.id) ?? ("sem_operacao" as StatusCompensacao),
        ramos: ramosDoCliente(ramosMap.get(c.id) ?? {})
          .map((ramo) => TIPO_RECUPERACAO_LABEL[ramo])
          .join(" · "),
      }))
      .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));

    const nome = new Map(clientes.map((c) => [c.id, c.empresa]));
    const top = [...totais]
      .filter((t) => t.credito_apurado > 0)
      .sort((a, b) => b.credito_apurado - a.credito_apurado)
      .slice(0, 10)
      .map((t) => ({ ...t, empresa: nome.get(t.cliente_id) ?? "—", share: apurado > 0 ? (t.credito_apurado / apurado) * 100 : 0 }));
    const topShare = top.reduce((s, t) => s + t.share, 0);

    return {
      apurado,
      compensado,
      saldo,
      honorarios,
      pctUtilizado,
      porTese,
      geracao,
      tesesPeriodo,
      statusRowsOrd,
      totalStatus,
      statusExtras,
      semOperacao,
      porTributo,
      semTese,
      top,
      topShare,
      clientes: clientes.length,
      statusCounts,
      ramoCounts,
      recorteLista,
      tiposTese: listarTiposTese(data.processos, data.creditos, data.teses),
      periodoOptions,
      periodoLabel: dashboardPeriodLabel(periodo),
    };
  }, [data, periodo, ramoFiltro, statusFiltro, tipoTeseFiltro]);

  const semTeseSaldo = m.semTese.reduce((s, c) => s + c.saldo, 0);
  const semTesePorStatus = [...m.semTese.reduce((acc, c) => acc.set(c.status, (acc.get(c.status) ?? 0) + 1), new Map<StatusCompensacao, number>())]
    .sort((a, b) => b[1] - a[1]);
  const recorteAtivo =
    ramoFiltro !== "todas" ||
    (statusFiltro.size > 0 && statusFiltro.size < STATUS_FILTRO_VALUES.length);
  const recorteVisiveis = verTodosRecorte ? m.recorteLista : m.recorteLista.slice(0, MAX_RECORTE);
  const maxTeseApurado = Math.max(...m.porTese.map((t) => t.apurado), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Filtros da visão executiva">
        <StatusCompensacaoFilter
          selectedStatuses={statusFiltro}
          onChange={setStatusFiltro}
          counts={m.statusCounts}
        />
        <TipoRecuperacaoFilter
          ramo={ramoFiltro}
          onChange={setRamoFiltro}
          counts={m.ramoCounts}
        />
        <TipoTeseFilter
          value={tipoTeseFiltro}
          onChange={setTipoTeseFiltro}
          options={m.tiposTese}
        />
        <DashboardPeriodFilter
          value={periodo}
          onChange={setPeriodo}
          options={m.periodoOptions}
        />
        <span className="text-[11px] text-ink-35">
          {m.clientes} cliente{m.clientes === 1 ? "" : "s"} no recorte · período: {m.periodoLabel} · tese: {rotuloFiltroTese(tipoTeseFiltro, m.tiposTese)}
        </span>
      </div>
      <div className="animate-slide-up delay-1 grid grid-cols-2 xl:grid-cols-4 gap-4" role="region" aria-label="KPIs da carteira">
        <KpiCard label="Crédito apurado" raw={m.apurado} format={compactCurrency} sub={`${m.clientes} clientes ativos · ${m.porTese.filter((t) => t.apurado > 0).length} teses com crédito`} icon={<Layers />} />
        <KpiCard label="Total compensado" raw={m.compensado} format={compactCurrency} sub={`${m.pctUtilizado.toFixed(1)}% do apurado utilizado`} tom="green" icon={<TrendingUp />} />
        <KpiCard label="Honorários acumulados" raw={m.honorarios} format={compactCurrency} sub={`economia líquida dos clientes ${compactCurrency(m.compensado - m.honorarios)}`} tom="gold" icon={<Coins />} />
        <KpiCard label="Saldo remanescente" raw={m.saldo} format={compactCurrency} sub="a compensar em contratos abertos" tom={m.saldo > 0 ? "navy" : "muted"} icon={<PieChart />} />
      </div>

      {recorteAtivo && (
        <Panel
          eyebrow="Recorte"
          title="Clientes no recorte"
          subtitle="Exatamente os clientes contados nos filtros de status e tipo de recuperação"
          action={<CountChip tom="gold">{m.recorteLista.length}</CountChip>}
          flush
        >
          {m.recorteLista.length === 0 ? (
            <InlineEmpty>Nenhum cliente neste recorte.</InlineEmpty>
          ) : (
            <>
              <ul className="divide-y divide-ink-06">
                {recorteVisiveis.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => navigate(`/clientes/${c.id}`)} className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-ink-03 transition-colors group">
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-ink truncate group-hover:underline">{c.empresa}</span>
                        <span className="block text-[10px] text-ink-35 truncate">{c.ramos}</span>
                      </span>
                      <Badge variant="outline" className={cn(STATUS_COMPENSACAO_COLORS[c.status], "text-[9px] shrink-0")}>{STATUS_COMPENSACAO_LABELS[c.status] ?? c.status}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
              {m.recorteLista.length > MAX_RECORTE && (
                <button type="button" onClick={() => setVerTodosRecorte((v) => !v)} aria-expanded={verTodosRecorte} className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-gold-deep hover:underline py-2.5 border-t border-ink-06">
                  {verTodosRecorte ? <>Mostrar menos <ChevronUp className="w-3 h-3" /></> : <>Ver todos ({m.recorteLista.length}) <ChevronDown className="w-3 h-3" /></>}
                </button>
              )}
            </>
          )}
        </Panel>
      )}

      <div className="animate-slide-up delay-2 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 min-w-0">
          <Panel eyebrow="Teses" title="Carteira por tese" subtitle="Crédito apurado, compensado e saldo por tese · processos assinados" action={<LinkMore onClick={() => navigate("/benchmarks")}>Benchmarks e teses</LinkMore>} flush className="h-full">
            {m.porTese.length === 0 ? (
              <InlineEmpty>Nenhum crédito apurado ou compensação vinculada a tese.</InlineEmpty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-[1px] text-ink-35 border-b border-ink-06">
                      <th className="text-left px-5 py-2">Tese</th>
                      <th className="text-right px-2 py-2">Clientes</th>
                      <th className="text-right px-2 py-2">Processos</th>
                      <th className="text-right px-2 py-2">Apurado</th>
                      <th className="text-right px-2 py-2">Compensado</th>
                      <th className="text-right px-2 py-2">Saldo</th>
                      <th className="text-left px-5 py-2 w-[150px]">Utilizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-06">
                    {m.porTese.map((t) => (
                      <tr key={t.tese_id} className="hover:bg-ink-03 transition-colors">
                        <td className="px-5 py-2.5">
                          <p className="font-semibold text-ink truncate max-w-[220px]">
                            {t.label}
                            {String(t.codigo).toUpperCase() === "REPORTO" && (
                              <span className="ml-1 text-[9px] font-normal text-ink-35">· fora do saldo padrão</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono-dm text-[10px] text-ink-35">{t.codigo}</span>
                            <span className="h-1 w-16 rounded-full bg-ink-06 overflow-hidden"><span className="block h-full rounded-full bg-gold" style={{ width: `${(t.apurado / maxTeseApurado) * 100}%` }} /></span>
                            <span className="text-[10px] text-ink-35 tabular-nums">{t.share}% da carteira</span>
                          </div>
                        </td>
                        <td className="text-right px-2 py-2.5 font-mono-dm tabular-nums text-navy font-bold">{t.clientes}</td>
                        <td className="text-right px-2 py-2.5 font-mono-dm tabular-nums text-ink-60">{t.processos}</td>
                        <td className="text-right px-2 py-2.5 font-mono-dm tabular-nums text-navy font-semibold whitespace-nowrap">{formatCurrencyBR(t.apurado)}</td>
                        <td className="text-right px-2 py-2.5 font-mono-dm tabular-nums text-dash-green whitespace-nowrap">{formatCurrencyBR(t.compensado)}</td>
                        <td className={cn("text-right px-2 py-2.5 font-mono-dm tabular-nums whitespace-nowrap", t.saldo > 0 ? "text-ink" : "text-ink-35")}>{formatCurrencyBR(t.saldo)}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex-1 h-1.5 rounded-full bg-ink-06 overflow-hidden"><span className={cn("block h-full rounded-full", t.pctUtilizado >= 100 ? "bg-dash-green" : "bg-navy")} style={{ width: `${Math.min(100, t.pctUtilizado)}%` }} /></span>
                            <span className="w-9 text-right font-mono-dm text-[10px] tabular-nums text-ink-60">{t.pctUtilizado}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        <div className="xl:col-span-5 min-w-0">
        <Panel eyebrow="Geração de teses" title="Processos cadastrados por mês" subtitle={`Teses assinadas / cadastradas · ${m.periodoLabel}`} action={<CountChip tom="gold">{m.tesesPeriodo} no período</CountChip>} className="h-full">
            {m.geracao.every((g) => g.novos === 0) ? (
              <InlineEmpty>Nenhum processo cadastrado no período.</InlineEmpty>
            ) : (
              // h-full acompanha o painel vizinho em vez de deixar o resto do
              // card vazio; o mínimo mantém o gráfico legível quando a linha é baixa.
              <div className="h-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={m.geracao} margin={{ top: 16, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-12)" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RechartsTooltip cursor={{ fill: "rgba(8,17,29,0.04)" }} contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number, name: string) => [v, name]} />
                    <Bar dataKey="novos" name="Teses novas" fill="#c6964f" radius={[4, 4, 0, 0]} maxBarSize={34}>
                      <LabelList dataKey="novos" position="top" style={{ fontSize: 10, fill: "var(--ink-60)", fontFamily: "'DM Mono', monospace" }} formatter={(v: number) => (v > 0 ? String(v) : "")} />
                    </Bar>
                    <Bar dataKey="clientes" name="Clientes" fill="rgba(8,17,29,0.25)" radius={[4, 4, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Os dois cards da linha têm a mesma altura: o de status distribui
          destaques, barras e ramos pelo espaço em vez de deixar vão em branco. */}
      <div className="animate-slide-up delay-3 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel className="h-full" bodyClassName="flex flex-col" eyebrow="Status" title="Distribuição por status de compensação" subtitle={`${m.totalStatus} clientes · status derivado da carteira`} action={<LinkMore onClick={() => navigate("/clientes")}>Ver carteira</LinkMore>}>
          {m.totalStatus === 0 ? (
            <InlineEmpty>Sem clientes com status calculado.</InlineEmpty>
          ) : (
            <div className="flex flex-1 flex-col justify-between gap-4">
              <div className="grid grid-cols-3 gap-2">
                {STATUS_COMPENSACAO_VALUES.map((status) => {
                  const count = m.statusRowsOrd.find((r) => r.status === status)?.count ?? 0;
                  return (
                    <div key={status} className="rounded-lg border border-ink-06 px-3 py-2.5 min-w-0">
                      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-35 truncate">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_BAR_COLORS[status] }} />
                        {STATUS_COMPENSACAO_LABELS[status]}
                      </p>
                      <p className="mt-1 font-mono-dm text-xl font-bold tabular-nums text-navy leading-none">
                        {count}
                        <span className="ml-1 text-[11px] font-medium text-ink-35">
                          {m.totalStatus > 0 ? Math.round((count / m.totalStatus) * 100) : 0}%
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
              <BarList
                labelWidth={130}
                className="gap-3"
                rows={m.statusRowsOrd.map((r) => ({
                  key: r.status,
                  label: STATUS_COMPENSACAO_LABELS[r.status],
                  value: r.count,
                  display: `${r.count} · ${m.totalStatus > 0 ? Math.round((r.count / m.totalStatus) * 100) : 0}%`,
                  color: STATUS_BAR_COLORS[r.status],
                }))}
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-06 pt-3 text-[11px] text-ink-60">
                <span className="text-[10px] font-bold uppercase tracking-[1px] text-ink-35">Ramos</span>
                {m.statusExtras.map((r) => (
                  <span key={r.status} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_BAR_COLORS[r.status] }} />
                    {STATUS_COMPENSACAO_LABELS[r.status]} <strong className="font-mono-dm text-navy">{r.count}</strong>
                  </span>
                ))}
                {m.semOperacao > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_BAR_COLORS.sem_operacao }} />
                    Dados incompletos <strong className="font-mono-dm text-navy">{m.semOperacao}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </Panel>
        <Panel className="h-full" bodyClassName="flex flex-col" eyebrow="Tributos" title="Compensações por tributo" subtitle="Total compensado acumulado por tributo">
          {m.porTributo.length === 0 ? (
            <InlineEmpty>Sem compensações registradas.</InlineEmpty>
          ) : (
            <div className="flex-1" style={{ minHeight: Math.max(180, m.porTributo.length * 34 + 24) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.porTributo} layout="vertical" margin={{ top: 4, right: 72, bottom: 0, left: 0 }} barCategoryGap={8}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--ink-12)" />
                  <XAxis type="number" tickFormatter={(v) => compactCurrency(Number(v))} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 11, fill: "rgba(8,17,29,0.6)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: "rgba(8,17,29,0.04)" }} contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => formatCurrencyBR(v)} />
                  <Bar dataKey="compensado" name="Compensado" radius={[0, 4, 4, 0]} barSize={18}>
                    {m.porTributo.map((_, i) => <Cell key={i} fill={i === 0 ? "#c6964f" : "var(--navy)"} />)}
                    <LabelList dataKey="compensado" position="right" formatter={(v: number) => compactCurrency(v)} style={{ fontSize: 10, fill: "rgba(8,17,29,0.6)", fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="animate-slide-up delay-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 min-w-0">
          <Panel className="h-full" eyebrow="Concentração" title="Top 10 clientes por crédito apurado" subtitle={m.top.length ? `Os ${m.top.length} maiores concentram ${m.topShare.toFixed(0)}% do crédito` : "Relevância de cada cliente"} action={<LinkMore onClick={() => navigate("/clientes")}>Ver todos</LinkMore>} flush>
            {m.top.length === 0 ? (
              <InlineEmpty>Sem clientes com crédito apurado.</InlineEmpty>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-[1px] text-ink-35 border-b border-ink-06">
                    <th className="text-left px-5 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2">Empresa</th>
                    <th className="text-left px-2 py-2 w-[160px]">Relevância</th>
                    <th className="text-right px-2 py-2">Apurado</th>
                    <th className="text-right px-2 py-2">Compensado</th>
                    <th className="text-right px-5 py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-06">
                  {m.top.map((r, i) => (
                    <tr key={r.cliente_id} onClick={() => navigate(`/clientes/${r.cliente_id}`)} className="cursor-pointer hover:bg-ink-03 transition-colors group">
                      <td className="px-5 py-2.5"><span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full font-mono-dm text-[10px] font-bold", i === 0 ? "bg-gold text-navy" : i < 3 ? "bg-gold/20 text-gold-deep" : "bg-ink-06 text-ink-35")}>{i + 1}</span></td>
                      <td className={cn("px-2 py-2.5 group-hover:underline truncate max-w-[220px]", i < 3 ? "font-bold text-navy" : "font-medium text-ink")}>{r.empresa}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 h-1.5 rounded-full bg-ink-06 overflow-hidden"><span className="block h-full rounded-full bg-navy" style={{ width: `${(r.credito_apurado / (m.top[0]?.credito_apurado || 1)) * 100}%` }} /></span>
                          <span className="w-10 text-right font-mono-dm text-[10px] tabular-nums text-ink-60">{r.share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="text-right px-2 py-2.5 font-mono-dm tabular-nums font-semibold whitespace-nowrap">{formatCurrencyBR(r.credito_apurado)}</td>
                      <td className="text-right px-2 py-2.5 font-mono-dm tabular-nums text-dash-green whitespace-nowrap">{formatCurrencyBR(r.total_compensado)}</td>
                      <td className={cn("text-right px-5 py-2.5 font-mono-dm tabular-nums whitespace-nowrap", r.saldo_restante > 0 ? "text-ink" : "text-ink-35")}>{formatCurrencyBR(r.saldo_restante)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
        <div className="xl:col-span-5 min-w-0">
          {/* Mesma altura do Top 10: a lista rola dentro do card em vez de
              esticar a linha, e o rodapé resume o impacto. */}
          <Panel className="h-full" bodyClassName="flex flex-col" eyebrow="Atenção" title="Sem tese em uso" subtitle="Clientes ativos sem tese ativa definida" action={<CountChip tom={m.semTese.length > 0 ? "amber" : "green"}>{m.semTese.length}</CountChip>} flush>
            {m.semTese.length === 0 ? (
              <InlineEmpty>Todos os ativos têm tese em uso.</InlineEmpty>
            ) : (
              <>
                <div className="relative flex-1 min-h-0">
                  {/* Linhas crescem até preencher a altura do Top 10 (com teto) e rolam quando não cabem. */}
                  <ul className="flex flex-col divide-y divide-ink-06 max-h-[360px] overflow-y-auto xl:absolute xl:inset-0 xl:max-h-none">
                    {m.semTese.map((c) => (
                      <li key={c.id} className="flex flex-1 min-h-[52px] xl:max-h-[76px]">
                        <button type="button" onClick={() => navigate(`/clientes/${c.id}`)} className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-ink-03 transition-colors group">
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-ink truncate group-hover:underline">{c.empresa}</span>
                            <span className="block text-[10px] text-ink-35 font-mono-dm tabular-nums">
                              {c.apurado > 0 ? `Saldo ${formatCurrencyBR(c.saldo)}` : "Sem crédito apurado"}
                            </span>
                          </span>
                          <Badge variant="outline" className={cn(STATUS_COMPENSACAO_COLORS[c.status], "text-[9px] shrink-0")}>{STATUS_COMPENSACAO_LABELS[c.status] ?? c.status}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-ink-06 bg-ink-03 px-5 py-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[1px] text-ink-35">Saldo sem tese definida</span>
                    <span className="font-mono-dm text-sm font-bold tabular-nums text-navy">{formatCurrencyBR(semTeseSaldo)}</span>
                  </div>
                  <p className="text-[10px] text-ink-60">
                    {semTesePorStatus.map(([status, n]) => `${n} ${STATUS_COMPENSACAO_LABELS[status] ?? status}`).join(" · ")}
                    {" · "}defina a tese em uso na ficha do cliente.
                  </p>
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-[10px] text-ink-35 px-1">
        Totais seguem status, ramo e tipo de tese. REPORTO aparece em processos, mas só entra nos valores quando selecionado explicitamente. Régua de <Link to="/configuracoes/motor" className="underline">teses no cálculo</Link>.
      </p>
    </div>
  );
});
