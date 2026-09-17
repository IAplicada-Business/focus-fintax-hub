import { memo, useMemo, useState } from "react";
import { Link, type NavigateFunction } from "react-router-dom";
import { Activity, ArrowRight, FileText, GitBranch, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_COMPENSACAO_COLORS, STATUS_COMPENSACAO_LABELS, type StatusCompensacao } from "@/components/StatusCompensacaoFilter";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import type { OperacionalDashboardData } from "@/services/operacionalDashboardService";
import { acoesPorTipo, acoesPorUsuario, movimentosEsteira } from "@/lib/operacional-analytics";
import { compactCurrency } from "../dashboard-utils";
import { BarList, CountChip, InlineEmpty, KpiCard, LinkMore, Panel } from "../ui/primitives";
import { cn } from "@/lib/utils";

const MS_DIA = 86_400_000;
const LIMIT = 10;

interface Props {
  data: OperacionalDashboardData;
  navigate: NavigateFunction;
}

/**
 * Pulso da semana: o que aconteceu nos últimos 7 dias — compensações
 * lançadas, movimentos na esteira, teses novas, ações do time — e quem está
 * com saldo parado sem movimento.
 */
export const ResumoSemanalTab = memo(function ResumoSemanalTab({ data, navigate }: Props) {
  const m = useMemo(() => {
    const agora = Date.now();
    const desde = agora - 7 * MS_DIA;
    const desdeIso = new Date(desde).toISOString();
    const { comps, clientes, totais, statusRows, processos, esteiraHistorico, acoes, nomes, intimacoes, slaConfig, teses } = data;
    const nome = new Map(clientes.map((c) => [c.id, c.empresa]));
    const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

    const compsSemana = comps.filter((c) => t(c.criado_em) >= desde);
    const totalCompensado = compsSemana.reduce((s, c) => s + Number(c.valor_compensado ?? 0), 0);
    const porCliente = new Map<string, { id: string; empresa: string; valor: number; lancamentos: number }>();
    for (const c of compsSemana) {
      const cur = porCliente.get(c.cliente_id) ?? { id: c.cliente_id, empresa: nome.get(c.cliente_id) ?? "—", valor: 0, lancamentos: 0 };
      cur.valor += Number(c.valor_compensado ?? 0);
      cur.lancamentos += 1;
      porCliente.set(c.cliente_id, cur);
    }
    const topClientes = [...porCliente.values()].sort((a, b) => b.valor - a.valor);

    const labels: Record<string, string> = Object.fromEntries(slaConfig.map((c) => [c.estagio, c.label]));
    const movimentos = movimentosEsteira(esteiraHistorico, desdeIso, labels);
    const tiposAcao = acoesPorTipo(acoes);
    const usuariosAcao = acoesPorUsuario(acoes, new Map(Object.entries(nomes)));

    const teseLabel = new Map(teses.map((x) => [String(x.codigo ?? "").toUpperCase(), x.label ?? x.codigo ?? ""]));
    const processosNovos = processos
      .filter((p) => t(p.criado_em) >= desde)
      .map((p) => ({ id: p.id, empresa: nome.get(p.cliente_id) ?? "—", cliente_id: p.cliente_id, nome: p.nome_exibicao || teseLabel.get(String(p.tese).toUpperCase()) || p.tese, criado_em: p.criado_em }))
      .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));

    const intimacoesNovas = intimacoes.filter((i) => t(i.created_at) >= desde).length;

    const saldo = new Map(totais.map((x) => [x.cliente_id, x.saldo_restante]));
    const status = new Map(statusRows.map((s) => [s.cliente_id, s.status_principal]));
    const moved = new Set(compsSemana.map((c) => c.cliente_id));
    const semMovimento = clientes
      .filter((c) => (saldo.get(c.id) ?? 0) > 1000 && !moved.has(c.id))
      .map((c) => ({
        id: c.id,
        empresa: c.empresa,
        saldo: saldo.get(c.id) ?? 0,
        dias: Math.max(0, Math.floor((agora - (t(c.atualizado_em) || t(c.criado_em) || agora)) / MS_DIA)),
        status: (status.get(c.id) ?? "sem_operacao") as StatusCompensacao,
      }))
      .sort((a, b) => b.saldo - a.saldo || b.dias - a.dias);
    const saldoParado = semMovimento.reduce((s, c) => s + c.saldo, 0);

    return { compsSemana, totalCompensado, topClientes, movimentos, tiposAcao, usuariosAcao, processosNovos, intimacoesNovas, semMovimento, saldoParado };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="animate-slide-up delay-1 grid grid-cols-2 xl:grid-cols-4 gap-4" role="region" aria-label="KPIs da semana">
        <KpiCard label="Compensado na semana" raw={m.totalCompensado} format={compactCurrency} sub={`${m.compsSemana.length} lançamento${m.compsSemana.length !== 1 ? "s" : ""} · ${m.topClientes.length} clientes em movimento`} tom="green" icon={<TrendingUp />} />
        <KpiCard label="Movimentos na esteira" raw={m.movimentos.total} sub={`${m.movimentos.clientes} clientes mudaram de etapa · ${m.movimentos.concluidos} concluídos`} icon={<GitBranch />} onClick={() => navigate("/esteira?tab=acompanhamento")} />
        <KpiCard label="Teses novas" raw={m.processosNovos.length} sub="processos cadastrados nos 7 dias" tom="gold" icon={<FileText />} />
        <KpiCard label="Ações do time" raw={data.acoes.length} sub={`${m.usuariosAcao.filter((u) => u.key !== "__sistema__").length} pessoas registraram ação`} icon={<Activity />} />
      </div>

      {m.intimacoesNovas > 0 && (
        <div className="flex items-center justify-between px-5 py-3 rounded-xl border border-dash-red/20 bg-dash-red/[0.04]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-dash-red" />
            <span className="text-sm font-semibold text-ink">{m.intimacoesNovas} {m.intimacoesNovas > 1 ? "intimações novas" : "intimação nova"} na semana</span>
          </div>
          <Link to="/intimacoes" className="text-xs font-bold text-dash-red hover:underline">Ver intimações →</Link>
        </div>
      )}

      <div className="animate-slide-up delay-2 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel eyebrow="Esteira" title="Entradas por etapa" subtitle="Para onde os clientes foram movidos nos últimos 7 dias" className="h-full">
          {m.movimentos.porEtapa.length === 0 ? (
            <InlineEmpty>Nenhum movimento na esteira nesta semana.</InlineEmpty>
          ) : (
            <BarList labelWidth={132} rows={m.movimentos.porEtapa.map((e) => ({ key: e.estagio, label: e.label, value: e.entradas, color: e.estagio === "concluido" ? "#0f7b4e" : "var(--navy)" }))} />
          )}
        </Panel>
        <Panel eyebrow="Time" title="Ações registradas" subtitle="Histórico dos clientes nos últimos 7 dias, por tipo e por pessoa" className="h-full">
          {data.acoes.length === 0 ? (
            <InlineEmpty>Nenhuma ação registrada nesta semana.</InlineEmpty>
          ) : (
            <div className="space-y-4">
              <BarList labelWidth={132} rows={m.tiposAcao.slice(0, 6).map((a) => ({ key: a.key, label: a.label, value: a.count, color: "#c6964f" }))} />
              <div className="border-t border-ink-06 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-35 mb-2 flex items-center gap-1.5"><Users className="w-3 h-3" /> Por pessoa</p>
                <ul className="flex flex-wrap gap-1.5">
                  {m.usuariosAcao.map((u) => (
                    <li key={u.key} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", u.key === "__sistema__" ? "border-ink-12 text-ink-35" : "border-gold/40 text-navy")}>
                      <span className="font-medium truncate max-w-[140px]">{u.label}</span>
                      <span className="font-mono-dm font-bold tabular-nums">{u.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Panel>
        <Panel eyebrow="Teses" title="Teses cadastradas na semana" subtitle="Novos processos por cliente" action={<CountChip tom="gold">{m.processosNovos.length}</CountChip>} flush className="h-full">
          {m.processosNovos.length === 0 ? (
            <InlineEmpty>Nenhuma tese nova nesta semana.</InlineEmpty>
          ) : (
            <ul className="divide-y divide-ink-06">
              {m.processosNovos.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => navigate(`/clientes/${p.cliente_id}`)} className="w-full text-left px-5 py-2.5 hover:bg-ink-03 transition-colors group">
                    <p className="text-xs font-semibold text-ink truncate group-hover:underline">{p.empresa}</p>
                    <p className="text-[11px] text-ink-35 truncate">{p.nome}{p.criado_em ? ` · ${new Date(p.criado_em).toLocaleDateString("pt-BR")}` : ""}</p>
                  </button>
                </li>
              ))}
              {m.processosNovos.length > 8 && <li className="px-5 py-2 text-[10px] text-ink-35 text-center">+{m.processosNovos.length - 8} teses</li>}
            </ul>
          )}
        </Panel>
      </div>

      <PulsoTable topClientes={m.topClientes} semMovimento={m.semMovimento} saldoParado={m.saldoParado} navigate={navigate} />
    </div>
  );
});

type SubTab = "top_semana" | "prioridade";

function PulsoTable({ topClientes, semMovimento, saldoParado, navigate }: { topClientes: { id: string; empresa: string; valor: number; lancamentos: number }[]; semMovimento: { id: string; empresa: string; saldo: number; dias: number; status: StatusCompensacao }[]; saldoParado: number; navigate: NavigateFunction }) {
  const [subTab, setSubTab] = useState<SubTab>(semMovimento.length > 0 && topClientes.length === 0 ? "prioridade" : "top_semana");
  const [expanded, setExpanded] = useState(false);
  const tabs: { value: SubTab; label: string; count: number; tom: "navy" | "red" }[] = [
    { value: "top_semana", label: "Top da semana", count: topClientes.length, tom: "navy" },
    { value: "prioridade", label: "Saldo parado", count: semMovimento.length, tom: "red" },
  ];
  const lista = subTab === "top_semana" ? topClientes : semMovimento;
  const showExpand = lista.length > LIMIT;

  return (
    <Panel
      eyebrow="Carteira"
      title={subTab === "top_semana" ? "Quem mais compensou na semana" : "Saldo parado sem compensação na semana"}
      subtitle={subTab === "top_semana" ? "Volume compensado por cliente nos últimos 7 dias" : `${compactCurrency(saldoParado)} de saldo sem movimento`}
      action={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-ink-06 bg-ink-03 p-0.5">
            {tabs.map((t) => (
              <button key={t.value} type="button" onClick={() => { setSubTab(t.value); setExpanded(false); }} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", subTab === t.value ? "bg-white text-navy shadow-sm" : "text-ink-35 hover:text-ink")}>
                {t.label} <CountChip tom={subTab === t.value ? t.tom : "muted"}>{t.count}</CountChip>
              </button>
            ))}
          </div>
          <LinkMore onClick={() => navigate("/clientes")}>Carteira</LinkMore>
        </div>
      }
      flush
    >
      {lista.length === 0 ? (
        <InlineEmpty>{subTab === "top_semana" ? "Sem compensações lançadas nos últimos 7 dias." : "Nenhum cliente com saldo parado — carteira em movimento."}</InlineEmpty>
      ) : subTab === "top_semana" ? (
        <ul className="divide-y divide-ink-06">
          {(expanded ? topClientes : topClientes.slice(0, LIMIT)).map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => navigate(`/clientes/${c.id}`)} className="w-full grid grid-cols-[2.5rem_1fr_auto] gap-x-3 items-center px-5 py-2.5 text-left hover:bg-ink-03 transition-colors group">
                <span className="text-[11px] font-mono-dm text-ink-35">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate group-hover:underline">{c.empresa}</p>
                  <p className="text-[10px] text-ink-35 mt-0.5">{c.lancamentos} lançamento{c.lancamentos > 1 ? "s" : ""}</p>
                </div>
                <p className="font-display text-sm font-bold text-navy tabular-nums text-right">{formatCurrencyBR(c.valor)}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-ink-06">
          {(expanded ? semMovimento : semMovimento.slice(0, LIMIT)).map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => navigate(`/clientes/${c.id}`)} className="w-full grid grid-cols-[2.5rem_1fr_auto_auto] gap-x-3 items-center px-5 py-2.5 text-left hover:bg-ink-03 transition-colors group">
                <span className="text-[11px] font-mono-dm text-ink-35">{i + 1}</span>
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink truncate group-hover:underline">{c.empresa}</p>
                  {STATUS_COMPENSACAO_LABELS[c.status] && <Badge variant="outline" className={cn(STATUS_COMPENSACAO_COLORS[c.status], "text-[9px] px-1.5 py-0 shrink-0")}>{STATUS_COMPENSACAO_LABELS[c.status]}</Badge>}
                </div>
                <span className="text-[11px] text-ink-35 tabular-nums whitespace-nowrap">{c.dias}d parado</span>
                <p className="font-display text-sm font-bold text-dash-red tabular-nums text-right">{compactCurrency(c.saldo)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showExpand && (
        <div className="px-5 py-2.5 border-t border-ink-06 text-center">
          <button type="button" onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-deep hover:underline">
            {expanded ? "Mostrar menos" : `Ver todos (${lista.length})`} <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </Panel>
  );
}
