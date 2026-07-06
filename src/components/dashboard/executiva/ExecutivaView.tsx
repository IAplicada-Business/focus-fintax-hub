import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Layers, TrendingUp, Coins, PieChart, ArrowRight } from "lucide-react";
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
}

interface Credito {
  cliente_id: string;
  tese_id: string;
  valor_apurado_inicial: number;
}

interface Tese {
  id: string;
  codigo: string;
  label: string;
  visivel_cliente: boolean;
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

export const ExecutivaView = memo(function ExecutivaView({ navigate: _navigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [teses, setTeses] = useState<Tese[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [statusRows, setStatusRows] = useState<StatusRow[]>([]);

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
        supabase.from("clientes").select("id, empresa"),
        (supabase as any).from("creditos_apurados").select("cliente_id, tese_id, valor_apurado_inicial"),
        (supabase as any).from("teses_tributarias").select("id, codigo, label, visivel_cliente"),
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

  const totalApurado = useMemo(
    () => creditos.reduce((s, c) => s + Number(c.valor_apurado_inicial || 0), 0),
    [creditos]
  );
  const totalCompensado = useMemo(
    () => comps.reduce((s, c) => s + Number(c.valor_compensado || 0), 0),
    [comps]
  );
  const totalHonorarios = useMemo(
    () =>
      comps.reduce(
        (s, c) => s + Number(c.honorario_valor ?? c.valor_nf_servico ?? 0),
        0
      ),
    [comps]
  );
  const saldoRestante = totalApurado - totalCompensado;
  const pctUtilizado = totalApurado > 0 ? (totalCompensado / totalApurado) * 100 : 0;
  const economiaLiquida = totalCompensado - totalHonorarios;

  // Contagem por status
  const contagemStatus = useMemo(() => {
    const c: Record<StatusCompensacao, number> = {
      compensando: 0,
      prevista: 0,
      reporto: 0,
      judicial: 0,
      encerrado: 0,
      sem_operacao: 0,
    };
    for (const r of statusRows) c[r.status_principal]++;
    return c;
  }, [statusRows]);

  // Distribuição por tese: crédito, compensado, saldo, # clientes
  const porTese = useMemo(() => {
    const teseMap = new Map(teses.map((t) => [t.id, t]));
    const agg: Record<
      string,
      { tese: Tese; apurado: number; compensado: number; clientes: Set<string> }
    > = {};
    for (const c of creditos) {
      const t = teseMap.get(c.tese_id);
      if (!t) continue;
      if (!agg[c.tese_id]) agg[c.tese_id] = { tese: t, apurado: 0, compensado: 0, clientes: new Set() };
      agg[c.tese_id].apurado += Number(c.valor_apurado_inicial || 0);
      agg[c.tese_id].clientes.add(c.cliente_id);
    }
    for (const c of comps) {
      if (!c.tese_origem_id) continue;
      const t = teseMap.get(c.tese_origem_id);
      if (!t) continue;
      if (!agg[c.tese_origem_id]) agg[c.tese_origem_id] = { tese: t, apurado: 0, compensado: 0, clientes: new Set() };
      agg[c.tese_origem_id].compensado += Number(c.valor_compensado || 0);
      agg[c.tese_origem_id].clientes.add(c.cliente_id);
    }
    return Object.values(agg)
      .map((v) => ({
        tese: v.tese,
        apurado: v.apurado,
        compensado: v.compensado,
        saldo: v.apurado - v.compensado,
        clientes: v.clientes.size,
        pctUtilizado: v.apurado > 0 ? (v.compensado / v.apurado) * 100 : 0,
      }))
      .sort((a, b) => b.apurado - a.apurado);
  }, [creditos, comps, teses]);

  // Distribuição por tributo (das compensações)
  const porTributo = useMemo(() => {
    const agg: Record<string, { compensado: number; clientes: Set<string> }> = {};
    for (const c of comps) {
      const t = c.tributo_enum || c.tributo || "outros";
      if (!agg[t]) agg[t] = { compensado: 0, clientes: new Set() };
      agg[t].compensado += Number(c.valor_compensado || 0);
      agg[t].clientes.add(c.cliente_id);
    }
    return Object.entries(agg)
      .map(([tributo, v]) => ({ tributo, compensado: v.compensado, clientes: v.clientes.size }))
      .sort((a, b) => b.compensado - a.compensado);
  }, [comps]);

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
    for (const c of comps) {
      const k = c.mes_referencia.slice(0, 7);
      const i = idx.get(k);
      if (i === undefined) continue;
      mesesArr[i].compensado += Number(c.valor_compensado || 0);
      mesesArr[i].honorarios += Number(c.honorario_valor ?? c.valor_nf_servico ?? 0);
    }
    return mesesArr;
  }, [comps]);

  // Top clientes por crédito
  const topPorCredito = useMemo(() => {
    const clienteMap = new Map(clientes.map((c) => [c.id, c.empresa]));
    const agg: Record<string, { apurado: number; compensado: number }> = {};
    for (const c of creditos) {
      if (!agg[c.cliente_id]) agg[c.cliente_id] = { apurado: 0, compensado: 0 };
      agg[c.cliente_id].apurado += Number(c.valor_apurado_inicial || 0);
    }
    for (const c of comps) {
      if (!agg[c.cliente_id]) agg[c.cliente_id] = { apurado: 0, compensado: 0 };
      agg[c.cliente_id].compensado += Number(c.valor_compensado || 0);
    }
    return Object.entries(agg)
      .map(([cliente_id, v]) => ({
        cliente_id,
        empresa: clienteMap.get(cliente_id) ?? "—",
        apurado: v.apurado,
        compensado: v.compensado,
        saldo: v.apurado - v.compensado,
      }))
      .sort((a, b) => b.apurado - a.apurado)
      .slice(0, 10);
  }, [creditos, comps, clientes]);

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

      {/* Contagem por status */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-navy">Distribuição por status de compensação</h3>
            <p className="text-[11px] text-ink-35">Clientes agrupados pelo status derivado da view</p>
          </div>
          <Link to="/clientes" className="text-[11px] text-primary hover:underline flex items-center gap-1">
            Ver carteira <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {STATUS_COMPENSACAO_VALUES.map((s) => (
            <div key={s} className="rounded-lg border px-3 py-2.5 flex flex-col gap-1">
              <Badge
                variant="outline"
                className={`${STATUS_COMPENSACAO_COLORS[s]} text-[9px] w-fit`}
              >
                {STATUS_COMPENSACAO_LABELS[s]}
              </Badge>
              <p className="font-display text-xl font-bold text-navy leading-none">
                {contagemStatus[s]}
              </p>
              <p className="text-[10px] text-ink-35">clientes</p>
            </div>
          ))}
        </div>
      </Card>

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

      {/* 2 cols: por tese + por tributo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por tese */}
        <Card className="p-5">
          <h3 className="text-sm font-bold text-navy mb-3">Distribuição por tese tributária</h3>
          {porTese.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sem créditos apurados registrados.</p>
          ) : (
            <div className="space-y-2">
              {porTese.map((t) => (
                <div key={t.tese.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">{t.tese.label}</span>
                      {!t.tese.visivel_cliente && (
                        <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[9px]">
                          interno
                        </Badge>
                      )}
                    </div>
                    <span className="font-bold text-navy whitespace-nowrap">
                      {formatCurrencyBR(t.apurado)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--ink-06)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--dash-green)]"
                        style={{ width: `${Math.min(t.pctUtilizado, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {t.clientes} cli · {t.pctUtilizado.toFixed(0)}% util
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Por tributo */}
        <Card className="p-5">
          <h3 className="text-sm font-bold text-navy mb-3">Compensações por tributo</h3>
          {porTributo.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sem compensações registradas.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b text-[10px] text-ink-35 uppercase tracking-wider">
                  <th className="py-1">Tributo</th>
                  <th className="text-right py-1">Compensado</th>
                  <th className="text-right py-1">Clientes</th>
                </tr>
              </thead>
              <tbody>
                {porTributo.map((row) => (
                  <tr key={row.tributo} className="border-b border-[rgba(10,21,100,0.06)]">
                    <td className="py-1.5">{row.tributo}</td>
                    <td className="text-right font-semibold">{formatCurrencyBR(row.compensado)}</td>
                    <td className="text-right text-ink-35">{row.clientes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Top 10 clientes por crédito */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-navy">Top 10 clientes por crédito apurado</h3>
          <Link to="/clientes" className="text-[11px] text-primary hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {topPorCredito.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sem clientes com crédito apurado.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b text-[10px] text-ink-35 uppercase tracking-wider">
                <th className="py-1">#</th>
                <th className="py-1">Empresa</th>
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
                  <td className="py-1.5 text-ink-35">{i + 1}</td>
                  <td className="py-1.5 font-medium">{r.empresa}</td>
                  <td className="text-right font-semibold py-1.5">{formatCurrencyBR(r.apurado)}</td>
                  <td className="text-right py-1.5">{formatCurrencyBR(r.compensado)}</td>
                  <td className="text-right py-1.5">{formatCurrencyBR(r.saldo)}</td>
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
// Sub-componente KPI
// -----------------------------------------------------------------------------

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
