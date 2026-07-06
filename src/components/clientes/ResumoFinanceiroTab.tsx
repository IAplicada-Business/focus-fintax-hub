import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { FileDown, TrendingUp, BarChart3, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";

// Cargos que podem enxergar KPIs internos financeiros (Honorários, Economia,
// Saldo Restante). Comercial e cliente veem apenas os totais brutos.
const INTERNAL_FINANCIAL_ROLES = new Set(["admin", "pmo", "gestor_tributario"]);

interface Props {
  clienteId: string;
  cliente?: { empresa: string; cnpj: string } | null;
}

export function ResumoFinanceiroTab({ clienteId, cliente }: Props) {
  const { userRole } = useAuth();
  const canSeeInternalFinancials = userRole ? INTERNAL_FINANCIAL_ROLES.has(userRole) : false;

  const [processos, setProcessos] = useState<any[]>([]);
  const [compensacoes, setCompensacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [{ data: proc }, { data: comp }] = await Promise.all([
        supabase.from("processos_teses").select("*").eq("cliente_id", clienteId),
        supabase
          .from("compensacoes_mensais")
          .select("*, processos_teses!compensacoes_mensais_processo_tese_id_fkey(id, tese, nome_exibicao, percentual_honorario, valor_credito)")
          .eq("cliente_id", clienteId)
          .order("mes_referencia", { ascending: false }),
      ]);
      setProcessos(proc || []);
      setCompensacoes(comp || []);
      setLoading(false);
    };
    fetchData();
  }, [clienteId]);

  const assinados = processos.filter((p) => p.status_contrato === "assinado");
  const totalIdentificado = assinados.reduce((s, p) => s + Number(p.valor_credito || 0), 0);
  const totalCompensado = compensacoes.reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
  const totalHonorarios = compensacoes.reduce((s, c) => s + Number(c.valor_nf_servico || 0), 0);
  const economiaLiquida = totalCompensado - totalHonorarios;
  const saldoRestante = totalIdentificado - totalCompensado;
  const pctUtilizado = totalIdentificado > 0 ? Math.round((totalCompensado / totalIdentificado) * 100) : 0;
  const taxaHonorarios = totalCompensado > 0 ? ((totalHonorarios / totalCompensado) * 100).toFixed(1) : "0";

  // Trilhas do cliente (compensação / reporto) — vem da coluna categoria (PR 4).
  const trilhas = new Set(assinados.map((p) => (p.categoria as string) || "compensacao"));
  const temReporto = trilhas.has("reporto");
  const temCompensacao = trilhas.has("compensacao");

  // Chart data grouped by month
  const porMes: Record<string, { compensado: number; honorarios: number }> = {};
  compensacoes.forEach((c) => {
    const mes = c.mes_referencia?.slice(0, 7);
    if (!mes) return;
    if (!porMes[mes]) porMes[mes] = { compensado: 0, honorarios: 0 };
    porMes[mes].compensado += Number(c.valor_compensado || 0);
    porMes[mes].honorarios += Number(c.valor_nf_servico || 0);
  });
  const chartData = Object.entries(porMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, vals]) => ({
      mes: new Date(mes + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      compensado: vals.compensado,
      honorarios: vals.honorarios,
    }));

  const barColor = pctUtilizado > 80 ? "var(--dash-green)" : pctUtilizado > 40 ? "var(--navy)" : "var(--dash-amber)";

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-sm text-ink-35">Carregando resumo...</div>;
  }

  return (
    <div id="report-content" className="space-y-5">
      {/* PRINT HEADER — hidden on screen */}
      <div className="hidden print:block mb-6">
        <h1 className="text-lg font-bold text-[var(--navy)]">Resumo Financeiro — Focus FinTax</h1>
        <p className="text-sm text-ink-60">{cliente?.empresa || "—"} · CNPJ: {cliente?.cnpj || "—"}</p>
        <p className="text-xs text-ink-35 mt-1">
          Gerado em {new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* EXPORT BUTTON */}
      <div className="flex justify-end gap-2 print:hidden">
        <button
          onClick={() => {
            const rows = compensacoes.map((c) => ({
              'Competência': c.mes_referencia
                ? new Date(c.mes_referencia).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                : '',
              'Tese': c.processos_teses?.nome_exibicao ?? '',
              'Tributo': c.tributo || c.observacao || '',
              'Valor Compensado (R$)': Number(c.valor_compensado || 0),
              'Honorários (R$)': Number(c.valor_nf_servico || 0),
              'Economia Líquida (R$)': Number(c.valor_compensado || 0) - Number(c.valor_nf_servico || 0),
              'Status Pagamento': c.status_pagamento === 'pago' ? 'Pago' : 'Pendente',
            }));
            rows.push({
              'Competência': 'TOTAL',
              'Tese': '',
              'Tributo': '',
              'Valor Compensado (R$)': totalCompensado,
              'Honorários (R$)': totalHonorarios,
              'Economia Líquida (R$)': economiaLiquida,
              'Status Pagamento': '',
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [
              { wch: 20 }, { wch: 40 }, { wch: 16 },
              { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 16 }
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Compensações');
            XLSX.writeFile(wb, `${cliente?.empresa || 'Cliente'}_Compensacoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--dash-border)] bg-white hover:bg-[rgba(10,21,100,0.03)] transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar Excel
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--dash-border)] bg-white hover:bg-[rgba(10,21,100,0.03)] transition-colors"
        >
          <FileDown className="w-3.5 h-3.5" />
          Exportar PDF
        </button>
      </div>

      {/* Trilhas — badges de categoria (compensação/reporto) */}
      {(temCompensacao || temReporto) && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold tracking-[0.8px] uppercase text-ink-35 text-[10px]">Trilhas:</span>
          {temCompensacao && (
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
              Compensação
            </Badge>
          )}
          {temReporto && (
            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
              Reporto
            </Badge>
          )}
        </div>
      )}

      {/* KPI STRIP — cards financeiros; internos gated por role (RBAC) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total identificado", value: totalIdentificado, color: "var(--navy)", internal: false },
          { label: "Total compensado", value: totalCompensado, color: "var(--dash-green)", internal: false },
          { label: "Honorários Focus", value: totalHonorarios, color: "var(--navy)", internal: true },
          { label: "Economia líquida", value: economiaLiquida, color: "var(--dash-green)", internal: true },
          { label: "Saldo restante", value: saldoRestante, color: saldoRestante > 0 ? "var(--dash-red)" : "var(--ink-35)", internal: true },
        ]
          .filter((kpi) => !kpi.internal || canSeeInternalFinancials)
          .map((kpi) => (
            <div key={kpi.label} className="card-base px-4 py-3.5">
              <p className="text-[10px] font-bold tracking-[0.8px] uppercase text-ink-35 mb-1">{kpi.label}</p>
              <p className="font-display text-[22px] font-bold leading-none" style={{ color: kpi.color }}>
                {formatCurrencyBR(kpi.value)}
              </p>
            </div>
          ))}
      </div>

      {/* PROGRESS + STATS */}
      <div className="card-base px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.8px] uppercase text-ink-35">Progresso de compensação</p>
            <p className="font-display text-[28px] font-bold leading-none mt-1" style={{ color: barColor }}>
              {pctUtilizado}%
            </p>
            <p className="text-[11px] text-ink-35 mt-0.5">do crédito identificado já compensado</p>
          </div>
          {canSeeInternalFinancials && (
            <div className="text-right">
              <p className="text-[10px] font-bold tracking-[0.8px] uppercase text-ink-35">Taxa de honorários</p>
              <p className="font-display text-[28px] font-bold leading-none mt-1 text-[var(--navy)]">
                {taxaHonorarios}%
              </p>
              <p className="text-[11px] text-ink-35 mt-0.5">média sobre compensações</p>
            </div>
          )}
        </div>
        <div className="w-full h-2.5 bg-[var(--ink-06)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(pctUtilizado, 100)}%`, background: barColor }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-ink-35">R$ 0</span>
          <span className="text-[10px] text-ink-35">{formatCurrencyBR(totalIdentificado)} identificado</span>
        </div>
      </div>

      {/* MONTHLY CHART */}
      {chartData.length > 0 ? (
        <div className="card-base overflow-hidden">
          <div className="px-5 pt-3.5 pb-2 border-b border-[var(--dash-border)]">
            <span className="text-[11px] font-bold tracking-[0.8px] uppercase text-[var(--navy)]">
              Evolução mensal de compensações
            </span>
          </div>
          <div className="px-3 py-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,21,100,0.06)" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "rgba(15,17,23,0.4)" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: "rgba(15,17,23,0.4)" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip formatter={(v: number) => formatCurrencyBR(v)} labelStyle={{ fontSize: 11 }} />
                <Bar dataKey="compensado" name="Compensado" fill="var(--navy)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="honorarios" name="Honorários" fill="var(--dash-green)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-5 px-5 pb-3">
            <span className="flex items-center gap-1.5 text-[10px] text-ink-60">
              <span className="w-2.5 h-2.5 rounded-sm bg-[var(--navy)]" /> Compensado
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-ink-60">
              <span className="w-2.5 h-2.5 rounded-sm bg-[var(--dash-green)]" /> Honorários
            </span>
          </div>
        </div>
      ) : (
        <div className="card-base py-8">
          <EmptyState icon={<BarChart3 className="w-5 h-5 text-ink-35" />} title="Sem histórico mensal" subtitle="Registre compensações para visualizar a evolução" />
        </div>
      )}

      {/* COMPENSAÇÕES TABLE */}
      <div className="card-base overflow-hidden">
        <div className="px-5 pt-3.5 pb-2.5 border-b border-[var(--dash-border)]">
          <span className="text-[11px] font-bold tracking-[0.8px] uppercase text-[var(--navy)]">
            Histórico de compensações ({compensacoes.length})
          </span>
        </div>
        {compensacoes.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                {["Competência", "Tese", "Tributo", "Valor compensado", "Honorários", "Economia", "Status"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {compensacoes.map((c) => {
                const hon = Number(c.valor_nf_servico || 0);
                const eco = Number(c.valor_compensado || 0) - hon;
                const mesLabel = c.mes_referencia
                  ? new Date(c.mes_referencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
                  : "—";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{mesLabel}</TableCell>
                    <TableCell className="text-xs">{c.processos_teses?.nome_exibicao || "—"}</TableCell>
                    <TableCell className="text-xs">{c.tributo || c.observacao || "—"}</TableCell>
                    <TableCell className="text-xs font-semibold">{formatCurrencyBR(c.valor_compensado)}</TableCell>
                    <TableCell className="text-xs">{hon > 0 ? formatCurrencyBR(hon) : "—"}</TableCell>
                    <TableCell className="text-xs">{formatCurrencyBR(eco)}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          c.status_pagamento === "pago"
                            ? "bg-[var(--dash-green-10)] text-[var(--dash-green)] border-0 text-[10px]"
                            : "bg-[var(--dash-amber-10)] text-[var(--dash-amber)] border-0 text-[10px]"
                        }
                      >
                        {c.status_pagamento === "pago" ? "Pago" : "Pendente"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-[rgba(10,21,100,0.03)]">
                <TableCell className="text-xs font-bold" colSpan={3}>Total</TableCell>
                <TableCell className="text-xs font-bold">{formatCurrencyBR(totalCompensado)}</TableCell>
                <TableCell className="text-xs font-bold">{formatCurrencyBR(totalHonorarios)}</TableCell>
                <TableCell className="text-xs font-bold">{formatCurrencyBR(economiaLiquida)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        ) : (
          <div className="py-8">
            <EmptyState icon={<TrendingUp className="w-5 h-5 text-ink-35" />} title="Sem compensações registradas" subtitle="Adicione compensações na aba Compensações" />
          </div>
        )}
      </div>

      {/* PRINT FOOTER */}
      <div className="hidden print:block mt-8 pt-4 border-t text-center">
        <p className="text-[10px] text-ink-35">Focus FinTax · Grupo Focus · A Contabilidade do Supermercado</p>
      </div>
    </div>
  );
}
