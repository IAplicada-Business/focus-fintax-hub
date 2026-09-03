import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { compactCurrency } from "../dashboard-utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import {
  Layers,
  TrendingUp,
  Coins,
  PieChart,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Trophy,
  Medal,
} from "lucide-react";
import { Link, type NavigateFunction } from "react-router-dom";
import {
  STATUS_COMPENSACAO_LABELS,
  STATUS_COMPENSACAO_COLORS,
  STATUS_COMPENSACAO_VALUES,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import { SkeletonKpi } from "../SkeletonKpi";

interface Props {
  navigate: NavigateFunction;
}

interface Cliente {
  id: string;
  empresa: string | null;
  tese_ativa_id?: string | null;
  status?: string | null;
}

interface Credito {
  cliente_id: string;
  tese_id: string;
  valor_apurado_inicial: number;
  incluir_no_calculo?: boolean | null;
}

interface Tese {
  id: string;
  codigo: string;
  label: string;
  incluir_no_calculo?: boolean | null;
}

interface Comp {
  cliente_id: string;
  mes_referencia: string;
  valor_compensado: number | null;
  honorario_valor: number | null;
  valor_nf_servico: number | null;
  tributo_enum: string | null;
  tributo: string | null;
  tese_origem_id: string | null;
}

interface StatusRow {
  cliente_id: string;
  status_principal: StatusCompensacao;
}

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Cor sólida de cada status — alinhada à paleta dos badges em STATUS_COMPENSACAO_COLORS. */
const STATUS_BAR_COLORS: Record<StatusCompensacao, string> = {
  compensando: "#059669",
  prevista: "#2563eb",
  reporto: "#64748b",
  ressarcimento: "#d97706",
  judicial: "#e11d48",
  encerrado: "#64748b",
  sem_operacao: "#a3a3a3",
};

/** Rótulo amigável dos tributos (enum → exibição). */
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

const MAX_LINHAS_SEM_TESE = 5;

export const ExecutivaView = memo(function ExecutivaView({ navigate: _navigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [teses, setTeses] = useState<Tese[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [statusRows, setStatusRows] = useState<StatusRow[]>([]);
  const [mostrarTodosSemTese, setMostrarTodosSemTese] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const [
        { data: cli },
        { data: ca },
        { data: te },
        { data: cm },
        { data: st },
      ] = await Promise.all([
        supabase.from("clientes").select("id, empresa, tese_ativa_id, status").eq("status", "ativo"),
        (supabase as any).from("creditos_apurados").select("cliente_id, tese_id, valor_apurado_inicial, incluir_no_calculo"),
        (supabase as any).from("teses_tributarias").select("id, codigo, label, incluir_no_calculo"),
        supabase
          .from("compensacoes_mensais")
          .select("cliente_id, mes_referencia, valor_compensado, honorario_valor, valor_nf_servico, tributo_enum, tributo, tese_origem_id"),
        (supabase as any).from("v_clientes_status_compensacao").select("cliente_id, status_principal"),
      ]);
      if (cancelled) return;
      setClientes((cli as any) || []);
      setCreditos((ca as any) || []);
      setTeses((te as any) || []);
      setComps((cm as any) || []);
      setStatusRows((st as any) || []);
      setLoading(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // Agregações
  // ---------------------------------------------------------------------------

  const teseIncluirIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of teses) {
      const incl = (t as any).incluir_no_calculo;
      if (incl === true || (incl == null && (t.codigo === "INSUMOS" || t.codigo === "SUBVENCAO"))) {
        ids.add(t.id);
      }
    }
    return ids;
  }, [teses]);

  const creditosNoCalculo = useMemo(() => {
    return creditos.filter((c) => {
      const flag = (c as any).incluir_no_calculo;
      if (typeof flag === "boolean") return flag;
      return teseIncluirIds.has(c.tese_id);
    });
  }, [creditos, teseIncluirIds]);

  const reportoTeseIds = useMemo(
    () => new Set(teses.filter((t) => t.codigo === "REPORTO").map((t) => t.id)),
    [teses]
  );

  const compsNoCalculo = useMemo(() => {
    // Alinha compensado ao mesmo recorte do crédito apurado (Fox).
    // REPORTO nunca entra no total compensado (saldo ficaria negativo).
    return comps.filter((c) => {
      if (c.tese_origem_id && reportoTeseIds.has(c.tese_origem_id)) return false;
      if (teseIncluirIds.size === 0) return true;
      return !c.tese_origem_id || teseIncluirIds.has(c.tese_origem_id);
    });
  }, [comps, teseIncluirIds, reportoTeseIds]);

  const totalApurado = useMemo(
    () => creditosNoCalculo.reduce((s, c) => s + Number(c.valor_apurado_inicial || 0), 0),
    [creditosNoCalculo]
  );
  const totalCompensado = useMemo(
    () => compsNoCalculo.reduce((s, c) => s + Number(c.valor_compensado || 0), 0),
    [compsNoCalculo]
  );
  const totalHonorarios = useMemo(
    () =>
      compsNoCalculo.reduce(
        (s, c) => s + Number(c.honorario_valor ?? c.valor_nf_servico ?? 0),
        0
      ),
    [compsNoCalculo]
  );
  const saldoRestante = totalApurado - totalCompensado;
  const pctUtilizado = totalApurado > 0 ? (totalCompensado / totalApurado) * 100 : 0;
  const economiaLiquida = totalCompensado - totalHonorarios;

  // Contagem por status — Reporto fora dos cards principais (Review Fox)
  const contagemStatus = useMemo(() => {
    const c: Record<StatusCompensacao, number> = {
      compensando: 0,
      prevista: 0,
      reporto: 0,
      ressarcimento: 0,
      judicial: 0,
      encerrado: 0,
      sem_operacao: 0,
    };
    for (const r of statusRows) {
      if (r.status_principal === "reporto") continue;
      const key = r.status_principal as StatusCompensacao;
      if (key in c) c[key]++;
    }
    return c;
  }, [statusRows]);

  // Barras horizontais de status: ordem decrescente por volume, Reporto fora
  const statusBars = useMemo(() => {
    const rows = STATUS_COMPENSACAO_VALUES
      .filter((s) => s !== "reporto")
      .map((s) => ({ status: s, count: contagemStatus[s] }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
    return { rows, total, max };
  }, [contagemStatus]);

  // Distribuição por tributo (das compensações no cálculo)
  const porTributo = useMemo(() => {
    const agg: Record<string, { compensado: number; clientes: Set<string> }> = {};
    for (const c of compsNoCalculo) {
      const t = c.tributo_enum || c.tributo || "outros";
      if (!agg[t]) agg[t] = { compensado: 0, clientes: new Set() };
      agg[t].compensado += Number(c.valor_compensado || 0);
      agg[t].clientes.add(c.cliente_id);
    }
    return Object.entries(agg)
      .map(([tributo, v]) => ({
        tributo,
        label: TRIBUTO_LABELS[tributo] ?? tributo,
        compensado: v.compensado,
        clientes: v.clientes.size,
      }))
      .sort((a, b) => b.compensado - a.compensado);
  }, [compsNoCalculo]);

  // Timeline: últimos 12 meses
  const chartMensal = useMemo(() => {
    const hoje = new Date();
    const mesesArr: { key: string; label: string; compensado: number; honorarios: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      mesesArr.push({
        key,
        label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        compensado: 0,
        honorarios: 0,
      });
    }
    const idx = new Map(mesesArr.map((m, i) => [m.key, i]));
    for (const c of compsNoCalculo) {
      const k = c.mes_referencia.slice(0, 7);
      const i = idx.get(k);
      if (i === undefined) continue;
      mesesArr[i].compensado += Number(c.valor_compensado || 0);
      mesesArr[i].honorarios += Number(c.honorario_valor ?? c.valor_nf_servico ?? 0);
    }
    return mesesArr;
  }, [compsNoCalculo]);

  // Clientes ativos sem tese em uso
  const semTeseAtiva = useMemo(() => {
    const statusMap = new Map(statusRows.map((s) => [s.cliente_id, s.status_principal]));
    return clientes
      .filter((c) => !c.tese_ativa_id)
      .map((c) => ({
        id: c.id,
        empresa: c.empresa || "—",
        status: (statusMap.get(c.id) || "sem_operacao") as StatusCompensacao,
      }))
      .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
  }, [clientes, statusRows]);

  const semTeseVisiveis = mostrarTodosSemTese
    ? semTeseAtiva
    : semTeseAtiva.slice(0, MAX_LINHAS_SEM_TESE);
  const semTeseOcultos = semTeseAtiva.length - MAX_LINHAS_SEM_TESE;

  // Top clientes por crédito
  const topPorCredito = useMemo(() => {
    const clienteMap = new Map(clientes.map((c) => [c.id, c.empresa]));
    const agg: Record<string, { apurado: number; compensado: number }> = {};
    for (const c of creditosNoCalculo) {
      if (!agg[c.cliente_id]) agg[c.cliente_id] = { apurado: 0, compensado: 0 };
      agg[c.cliente_id].apurado += Number(c.valor_apurado_inicial || 0);
    }
    for (const c of compsNoCalculo) {
      if (!agg[c.cliente_id]) agg[c.cliente_id] = { apurado: 0, compensado: 0 };
      agg[c.cliente_id].compensado += Number(c.valor_compensado || 0);
    }
    const rows = Object.entries(agg)
      .map(([cliente_id, v]) => ({
        cliente_id,
        empresa: clienteMap.get(cliente_id) ?? "—",
        apurado: v.apurado,
        compensado: v.compensado,
        saldo: v.apurado - v.compensado,
        share: totalApurado > 0 ? (v.apurado / totalApurado) * 100 : 0,
      }))
      .sort((a, b) => b.apurado - a.apurado)
      .slice(0, 10);
    const maxApurado = rows[0]?.apurado ?? 0;
    return rows.map((r) => ({
      ...r,
      barPct: maxApurado > 0 ? (r.apurado / maxApurado) * 100 : 0,
    }));
  }, [creditosNoCalculo, compsNoCalculo, clientes, totalApurado]);

  const top10Share = useMemo(
    () => topPorCredito.reduce((s, r) => s + r.share, 0),
    [topPorCredito]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <SkeletonKpi key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs top strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Crédito apurado (carteira)"
          icon={<Layers className="w-3.5 h-3.5" />}
          value={formatCurrencyBR(totalApurado)}
          sub={`${clientes.length} clientes`}
          cor="var(--navy)"
        />
        <Kpi
          label="Total compensado"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          value={formatCurrencyBR(totalCompensado)}
          sub={`${pctUtilizado.toFixed(1)}% do apurado utilizado`}
          cor="var(--dash-green)"
        />
        <Kpi
          label="Honorários acumulados"
          icon={<Coins className="w-3.5 h-3.5" />}
          value={formatCurrencyBR(totalHonorarios)}
          sub={`Economia líquida: ${formatCurrencyBR(economiaLiquida)}`}
          cor="var(--navy)"
        />
        <Kpi
          label="Saldo remanescente"
          icon={<PieChart className="w-3.5 h-3.5" />}
          value={formatCurrencyBR(saldoRestante)}
          sub="a compensar em contratos abertos"
          cor={saldoRestante > 0 ? "var(--dash-red)" : "var(--ink-35)"}
        />
      </div>

      {/* 2 cols: status (barras horizontais) + tributo (gráfico) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribuição por status — barras horizontais */}
        <Card className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-navy">Distribuição por status de compensação</h3>
              <p className="text-[11px] text-ink-35">
                {statusBars.total} clientes · agrupados pelo status derivado da view
              </p>
            </div>
            <Link to="/clientes" className="text-[11px] text-primary hover:underline flex items-center gap-1 whitespace-nowrap">
              Ver carteira <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {statusBars.total === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sem clientes com status calculado.</p>
          ) : (
            <div className="flex flex-col gap-2.5" role="list" aria-label="Clientes por status de compensação">
              {statusBars.rows.map((r) => {
                const pct = statusBars.total > 0 ? (r.count / statusBars.total) * 100 : 0;
                const width = statusBars.max > 0 ? (r.count / statusBars.max) * 100 : 0;
                const cor = STATUS_BAR_COLORS[r.status];
                return (
                  <div key={r.status} role="listitem" className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-[120px] shrink-0 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cor }} aria-hidden />
                      <span className="text-[11px] font-semibold text-ink-60 truncate">
                        {STATUS_COMPENSACAO_LABELS[r.status]}
                      </span>
                    </div>
                    <div
                      className="flex-1 h-2 rounded-[3px] bg-[var(--ink-06)] overflow-hidden"
                      title={`${STATUS_COMPENSACAO_LABELS[r.status]}: ${r.count} clientes (${pct.toFixed(0)}%)`}
                    >
                      <div
                        className="h-full rounded-[3px] transition-[width] duration-300"
                        style={{ background: cor, width: `${width}%` }}
                      />
                    </div>
                    <span className="font-mono-dm tabular-nums text-xs font-bold text-navy w-7 text-right shrink-0">
                      {r.count}
                    </span>
                    <span className="font-mono-dm tabular-nums text-[10px] text-ink-35 w-9 text-right shrink-0">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Compensações por tributo — gráfico de barras horizontais */}
        <Card className="p-5 flex flex-col">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-navy">Compensações por tributo</h3>
            <p className="text-[11px] text-ink-35">Total compensado acumulado · por tributo</p>
          </div>
          {porTributo.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sem compensações registradas.</p>
          ) : (
            <div style={{ height: Math.max(160, porTributo.length * 36 + 24) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porTributo}
                  layout="vertical"
                  margin={{ top: 4, right: 72, bottom: 0, left: 0 }}
                  barCategoryGap={8}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(10,21,100,0.06)" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => compactCurrency(Number(v))}
                    tick={{ fontSize: 10, fill: "rgba(15,17,23,0.4)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={96}
                    tick={{ fontSize: 11, fill: "rgba(15,17,23,0.6)", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(10,21,100,0.04)" }}
                    content={<TributoTooltip />}
                  />
                  <Bar dataKey="compensado" name="Compensado" fill="var(--navy)" radius={[0, 4, 4, 0]} barSize={18}>
                    <LabelList
                      dataKey="compensado"
                      position="right"
                      formatter={(v: number) => compactCurrency(v)}
                      style={{ fontSize: 10, fill: "rgba(15,17,23,0.6)", fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Timeline mensal */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-navy mb-3">
          Evolução mensal — compensações vs honorários
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartMensal} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,21,100,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "rgba(15,17,23,0.4)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 10, fill: "rgba(15,17,23,0.4)" }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                formatter={(v: number) => formatCurrencyBR(v)}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="compensado" name="Compensado" fill="var(--navy)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="honorarios" name="Honorários" fill="var(--dash-green)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Sem tese em uso — largura total, 5 linhas + expandir */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-navy">Sem tese em uso</h3>
            <p className="text-[11px] text-ink-35">Clientes ativos sem tese_ativa definida</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {semTeseAtiva.length}
          </Badge>
        </div>
        {semTeseAtiva.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Todos os ativos têm tese em uso.</p>
        ) : (
          <>
            <table className="w-full text-xs" aria-label="Clientes ativos sem tese em uso">
              <thead>
                <tr className="text-left border-b text-[10px] text-ink-35 uppercase tracking-wider">
                  <th className="py-1 w-8">#</th>
                  <th className="py-1">Empresa</th>
                  <th className="text-right py-1">Status de compensação</th>
                </tr>
              </thead>
              <tbody>
                {semTeseVisiveis.map((c, i) => (
                  <tr
                    key={c.id}
                    className="border-b border-[rgba(10,21,100,0.06)] hover:bg-muted/40 cursor-pointer"
                    onClick={() => _navigate(`/clientes/${c.id}`)}
                  >
                    <td className="py-2 text-ink-35 font-mono-dm tabular-nums">{i + 1}</td>
                    <td className="py-2 font-medium">{c.empresa}</td>
                    <td className="py-2 text-right">
                      <Badge
                        variant="outline"
                        className={`${STATUS_COMPENSACAO_COLORS[c.status] || ""} text-[9px]`}
                      >
                        {STATUS_COMPENSACAO_LABELS[c.status] || c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {semTeseOcultos > 0 && (
              <button
                type="button"
                onClick={() => setMostrarTodosSemTese((v) => !v)}
                aria-expanded={mostrarTodosSemTese}
                className="mt-3 w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-primary hover:underline py-1"
              >
                {mostrarTodosSemTese ? (
                  <>
                    Mostrar menos <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    Ver todos ({semTeseAtiva.length}) <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>
            )}
          </>
        )}
      </Card>

      {/* Top 10 clientes por crédito */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-navy">Top 10 clientes por crédito apurado</h3>
            <p className="text-[11px] text-ink-35">
              {topPorCredito.length > 0
                ? `Os ${topPorCredito.length} maiores concentram ${top10Share.toFixed(0)}% do crédito da carteira`
                : "Relevância de cada cliente na carteira"}
            </p>
          </div>
          <Link to="/clientes" className="text-[11px] text-primary hover:underline flex items-center gap-1 whitespace-nowrap">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {topPorCredito.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sem clientes com crédito apurado.</p>
        ) : (
          <table className="w-full text-xs" aria-label="Top 10 clientes por crédito apurado">
            <thead>
              <tr className="text-left border-b text-[10px] text-ink-35 uppercase tracking-wider">
                <th className="py-1 w-10">#</th>
                <th className="py-1">Empresa</th>
                <th className="py-1 w-[220px]">Relevância na carteira</th>
                <th className="text-right py-1">Apurado</th>
                <th className="text-right py-1">Compensado</th>
                <th className="text-right py-1">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {topPorCredito.map((r, i) => (
                <tr
                  key={r.cliente_id}
                  className="border-b border-[rgba(10,21,100,0.06)] hover:bg-muted/40 cursor-pointer"
                  onClick={() => _navigate(`/clientes/${r.cliente_id}`)}
                >
                  <td className="py-2">
                    <RankBadge rank={i + 1} />
                  </td>
                  <td className={`py-2 ${i < 3 ? "font-bold text-navy" : "font-medium"}`}>{r.empresa}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-[3px] bg-[var(--ink-06)] overflow-hidden">
                        <div
                          className="h-full rounded-[3px]"
                          style={{ width: `${r.barPct}%`, background: RANK_COLORS[i] ?? "var(--navy)" }}
                        />
                      </div>
                      <span className="font-mono-dm tabular-nums text-[10px] text-ink-60 w-10 text-right shrink-0">
                        {r.share.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="text-right font-semibold py-2 font-mono-dm tabular-nums">{formatCurrencyBR(r.apurado)}</td>
                  <td className="text-right py-2 font-mono-dm tabular-nums text-dash-green">{formatCurrencyBR(r.compensado)}</td>
                  <td className={`text-right py-2 font-mono-dm tabular-nums ${r.saldo > 0 ? "text-ink" : "text-ink-35"}`}>
                    {formatCurrencyBR(r.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
});

// -----------------------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------------------

/** Cores de destaque das barras de relevância: ouro, prata, bronze; demais em navy. */
const RANK_COLORS: Record<number, string> = {
  0: "#d97706",
  1: "#64748b",
  2: "#b45309",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 border border-amber-300 text-amber-800"
        title="1º lugar"
        aria-label="1º lugar"
      >
        <Trophy className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (rank === 2 || rank === 3) {
    const cls =
      rank === 2
        ? "bg-slate-100 border-slate-300 text-slate-700"
        : "bg-orange-100 border-orange-300 text-orange-800";
    return (
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${cls}`}
        title={`${rank}º lugar`}
        aria-label={`${rank}º lugar`}
      >
        <Medal className="w-3.5 h-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--ink-06)] text-ink-35 font-mono-dm tabular-nums text-[10px] font-bold">
      {rank}
    </span>
  );
}

interface TributoTooltipProps {
  active?: boolean;
  payload?: { payload: { label: string; compensado: number; clientes: number } }[];
}

function TributoTooltip({ active, payload }: TributoTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border bg-white px-3 py-2 shadow-md text-[11px]">
      <p className="font-bold text-navy mb-0.5">{row.label}</p>
      <p className="text-ink-60">
        Compensado: <span className="font-semibold text-ink">{formatCurrencyBR(row.compensado)}</span>
      </p>
      <p className="text-ink-35">
        {row.clientes} {row.clientes === 1 ? "cliente" : "clientes"}
      </p>
    </div>
  );
}

function Kpi({
  label,
  icon,
  value,
  sub,
  cor,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  cor: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-ink-35">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">{label}</p>
      </div>
      <p className="font-display text-[22px] font-bold leading-none" style={{ color: cor }}>
        {value}
      </p>
      <p className="text-[11px] text-ink-35 mt-1.5">{sub}</p>
    </Card>
  );
}
