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
  StatusCompensacaoFilter,
  TipoRecuperacaoFilter,
  buildRamoFlagsPorCliente,
  countByRamo,
  countByStatus,
  type RamoGerencialFiltro,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import type { OperacionalDashboardData } from "@/services/operacionalDashboardService";
import { carteiraPorTese, geracaoTesesPorMes, honorarioDe } from "@/lib/operacional-analytics";
import {
  filtrarIdsRecorteGerencial,
  normalizarStatusCompensacao,
} from "@/lib/gerencial-filters";
import { compactCurrency } from "../dashboard-utils";
import { BarList, KpiCard, LinkMore, Panel, InlineEmpty, CountChip } from "../ui/primitives";
import { cn } from "@/lib/utils";

interface Props {
  data: OperacionalDashboardData;
  navigate: NavigateFunction;
}

const STATUS_BAR_COLORS: Record<StatusCompensacao, string> = {
  compensando: "#0f7b4e",
  prevista: "#1c3150",
  reporto: "#8a8f98",
  encerrado: "#8a8f98",
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
const MAX_SEM_TESE = 5;

/**
 * Visão Executiva: a carteira pelo ângulo das teses — quanto cada tese
 * apurou, compensou e ainda tem de saldo; quantas teses novas o time gerou
 * por mês; status da carteira; tributos; quem concentra o crédito.
 */
export const ExecutivaView = memo(function ExecutivaView({ data, navigate }: Props) {
  const [verTodosSemTese, setVerTodosSemTese] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<Set<StatusCompensacao>>(
    new Set(STATUS_COMPENSACAO_VALUES),
  );
  const [ramoFiltro, setRamoFiltro] = useState<RamoGerencialFiltro>("todas");

  const m = useMemo(() => {
    const statusMapCompleto = new Map(
      data.statusRows.map((row) => [row.cliente_id, normalizarStatusCompensacao(row)]),
    );
    const ramosMap = buildRamoFlagsPorCliente(data.processos);
    const ids = filtrarIdsRecorteGerencial(
      data.clientes.map((cliente) => cliente.id),
      statusFiltro,
      ramoFiltro,
      statusMapCompleto,
      ramosMap,
    );
    const clientes = data.clientes.filter((cliente) => ids.has(cliente.id));
    const totais = data.totais.filter((row) => ids.has(row.cliente_id));
    const comps = data.comps.filter((row) => ids.has(row.cliente_id));
    const creditos = data.creditos.filter((row) => ids.has(row.cliente_id));
    const processos = data.processos.filter((row) => ids.has(row.cliente_id));
    const statusRows = data.statusRows.filter((row) => ids.has(row.cliente_id));
    const { teses } = data;
    const apurado = totais.reduce((s, t) => s + t.credito_apurado, 0);
    const compensado = totais.reduce((s, t) => s + t.total_compensado, 0);
    const saldo = totais.reduce((s, t) => s + t.saldo_restante, 0);
    const honorarios = comps.reduce((s, c) => s + honorarioDe(c), 0);
    const pctUtilizado = apurado > 0 ? (compensado / apurado) * 100 : 0;

    const porTese = carteiraPorTese(teses, creditos, comps, processos);
    const geracao = geracaoTesesPorMes(processos, 6);
    const desde30 = Date.now() - 30 * 86_400_000;
    const teses30d = processos.filter((p) => p.criado_em && new Date(p.criado_em).getTime() >= desde30).length;

    const contagem = countByStatus(
      statusRows.map((row) => row.cliente_id),
      new Map(statusRows.map((row) => [row.cliente_id, normalizarStatusCompensacao(row)])),
    );
    const statusRowsOrd = STATUS_COMPENSACAO_VALUES
      .map((status) => ({ status, count: contagem[status] }))
      .sort((a, b) => b.count - a.count);
    const totalStatus = statusRowsOrd.reduce((s, r) => s + r.count, 0);

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

    const semTese = clientes
      .filter((c) => !c.tese_ativa_id)
      .map((c) => ({ id: c.id, empresa: c.empresa, status: statusMapCompleto.get(c.id) ?? "sem_operacao" }))
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
      teses30d,
      statusRowsOrd,
      totalStatus,
      porTributo,
      semTese,
      top,
      topShare,
      clientes: clientes.length,
      statusCounts: countByStatus(data.clientes.map((c) => c.id), statusMapCompleto),
      ramoCounts: countByRamo(data.clientes.map((c) => c.id), ramosMap),
    };
  }, [data, ramoFiltro, statusFiltro]);

  const semTeseVisiveis = verTodosSemTese ? m.semTese : m.semTese.slice(0, MAX_SEM_TESE);
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
        <span className="text-[11px] text-ink-35">
          {m.clientes} cliente{m.clientes === 1 ? "" : "s"} no recorte
        </span>
      </div>
      <div className="animate-slide-up delay-1 grid grid-cols-2 xl:grid-cols-4 gap-4" role="region" aria-label="KPIs da carteira">
        <KpiCard label="Crédito apurado" raw={m.apurado} format={compactCurrency} sub={`${m.clientes} clientes ativos · ${m.porTese.filter((t) => t.apurado > 0).length} teses com crédito`} icon={<Layers />} />
        <KpiCard label="Total compensado" raw={m.compensado} format={compactCurrency} sub={`${m.pctUtilizado.toFixed(1)}% do apurado utilizado`} tom="green" icon={<TrendingUp />} />
        <KpiCard label="Honorários acumulados" raw={m.honorarios} format={compactCurrency} sub={`economia líquida dos clientes ${compactCurrency(m.compensado - m.honorarios)}`} tom="gold" icon={<Coins />} />
        <KpiCard label="Saldo remanescente" raw={m.saldo} format={compactCurrency} sub="a compensar em contratos abertos" tom={m.saldo > 0 ? "navy" : "muted"} icon={<PieChart />} />
      </div>

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
                          <p className="font-semibold text-ink truncate max-w-[220px]">{t.label}</p>
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
          <Panel eyebrow="Geração de teses" title="Processos cadastrados por mês" subtitle="Teses assinadas / cadastradas na carteira nos últimos 6 meses" action={<CountChip tom="gold">{m.teses30d} nos últimos 30d</CountChip>} className="h-full">
            {m.geracao.every((g) => g.novos === 0) ? (
              <InlineEmpty>Nenhum processo cadastrado no período.</InlineEmpty>
            ) : (
              <div className="h-[220px]">
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

      <div className="animate-slide-up delay-3 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel eyebrow="Status" title="Distribuição por status de compensação" subtitle={`${m.totalStatus} clientes · status derivado da carteira`} action={<LinkMore onClick={() => navigate("/clientes")}>Ver carteira</LinkMore>}>
          {m.totalStatus === 0 ? (
            <InlineEmpty>Sem clientes com status calculado.</InlineEmpty>
          ) : (
            <BarList
              labelWidth={130}
              rows={m.statusRowsOrd.map((r) => ({
                key: r.status,
                label: STATUS_COMPENSACAO_LABELS[r.status],
                value: r.count,
                display: `${r.count} · ${m.totalStatus > 0 ? Math.round((r.count / m.totalStatus) * 100) : 0}%`,
                color: STATUS_BAR_COLORS[r.status],
              }))}
            />
          )}
        </Panel>
        <Panel eyebrow="Tributos" title="Compensações por tributo" subtitle="Total compensado acumulado por tributo">
          {m.porTributo.length === 0 ? (
            <InlineEmpty>Sem compensações registradas.</InlineEmpty>
          ) : (
            <div style={{ height: Math.max(160, m.porTributo.length * 34 + 24) }}>
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
          <Panel eyebrow="Concentração" title="Top 10 clientes por crédito apurado" subtitle={m.top.length ? `Os ${m.top.length} maiores concentram ${m.topShare.toFixed(0)}% do crédito` : "Relevância de cada cliente"} action={<LinkMore onClick={() => navigate("/clientes")}>Ver todos</LinkMore>} flush>
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
          <Panel eyebrow="Atenção" title="Sem tese em uso" subtitle="Clientes ativos sem tese ativa definida" action={<CountChip tom={m.semTese.length > 0 ? "amber" : "green"}>{m.semTese.length}</CountChip>} flush className="h-full">
            {m.semTese.length === 0 ? (
              <InlineEmpty>Todos os ativos têm tese em uso.</InlineEmpty>
            ) : (
              <>
                <ul className="divide-y divide-ink-06">
                  {semTeseVisiveis.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => navigate(`/clientes/${c.id}`)} className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-ink-03 transition-colors group">
                        <span className="text-xs font-medium text-ink truncate group-hover:underline">{c.empresa}</span>
                        <Badge variant="outline" className={cn(STATUS_COMPENSACAO_COLORS[c.status], "text-[9px] shrink-0")}>{STATUS_COMPENSACAO_LABELS[c.status] ?? c.status}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
                {m.semTese.length > MAX_SEM_TESE && (
                  <button type="button" onClick={() => setVerTodosSemTese((v) => !v)} aria-expanded={verTodosSemTese} className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-gold-deep hover:underline py-2.5 border-t border-ink-06">
                    {verTodosSemTese ? <>Mostrar menos <ChevronUp className="w-3 h-3" /></> : <>Ver todos ({m.semTese.length}) <ChevronDown className="w-3 h-3" /></>}
                  </button>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-[10px] text-ink-35 px-1">
        Totais seguem o recorte de status e o mesmo ramo da esteira; Administrativo agrupa Compensação + Ressarcimento. Régua de <Link to="/configuracoes/motor" className="underline">teses no cálculo</Link>.
      </p>
    </div>
  );
});
