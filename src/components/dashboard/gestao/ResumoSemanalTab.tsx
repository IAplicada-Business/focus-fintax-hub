import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { fetchResumoSemanal } from "@/services/gestaoDashboardService";
import { STATUS_COMPENSACAO_LABELS, STATUS_COMPENSACAO_COLORS, type StatusCompensacao } from "@/components/StatusCompensacaoFilter";
import { SkeletonKpi } from "../SkeletonKpi";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, Banknote, FilePlus2, History, AlertTriangle } from "lucide-react";

export function ResumoSemanalTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-gestao-resumo"],
    queryFn: fetchResumoSemanal,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
    );
  }

  const desdeLabel = format(new Date(data.desde), "dd/MM", { locale: ptBR });

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Movimentação da carteira desde {desdeLabel} (últimos 7 dias). Visão para gestão — não substitui Comercial/Executiva.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={<Banknote className="w-3.5 h-3.5" />}
          label="Compensado na semana"
          value={formatCurrencyBR(data.totalCompensado)}
          sub={`${data.comps.length} lançamento(s)`}
        />
        <Kpi
          icon={<FilePlus2 className="w-3.5 h-3.5" />}
          label="Novas teses/processos"
          value={String(data.processosNovos.length)}
          sub="cadastrados na semana"
        />
        <Kpi
          icon={<History className="w-3.5 h-3.5" />}
          label="Eventos no histórico"
          value={String(data.historico.length)}
          sub="últimos registros"
        />
        <Kpi
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Intimações novas"
          value={String(data.intimacoesNovas)}
          sub="abertas na semana"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-navy">Compensações da semana</h3>
            <Link to="/clientes" className="text-[11px] text-primary hover:underline flex items-center gap-1">
              Carteira <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {data.comps.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhuma compensação lançada nos últimos 7 dias.</p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left border-b text-[10px] text-ink-35 uppercase tracking-wider">
                    <th className="py-1">Cliente</th>
                    <th className="py-1">Tese</th>
                    <th className="text-right py-1">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comps.slice(0, 30).map((c) => (
                    <tr key={c.id} className="border-b border-[rgba(10,21,100,0.06)]">
                      <td className="py-1.5">
                        <Link to={`/clientes/${c.cliente_id}`} className="font-medium hover:underline">
                          {c.empresa}
                        </Link>
                      </td>
                      <td className="py-1.5 text-muted-foreground">{c.tese_label || "—"}</td>
                      <td className="py-1.5 text-right font-semibold">{formatCurrencyBR(c.valor_compensado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-navy mb-3">Com saldo e sem movimento na semana</h3>
          {data.clientesSemMovimento.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum cliente parado com saldo relevante.</p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {data.clientesSemMovimento.map((c) => {
                const st = c.status as StatusCompensacao;
                return (
                  <Link
                    key={c.id}
                    to={`/clientes/${c.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{c.empresa}</p>
                      <p className="text-[10px] text-muted-foreground">{c.dias} dias sem atualização</p>
                    </div>
                    {STATUS_COMPENSACAO_LABELS[st] ? (
                      <Badge variant="outline" className={`${STATUS_COMPENSACAO_COLORS[st]} text-[9px]`}>
                        {STATUS_COMPENSACAO_LABELS[st]}
                      </Badge>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {(data.processosNovos.length > 0 || data.historico.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-navy mb-3">Processos / teses criados</h3>
            {data.processosNovos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum processo novo na semana.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {data.processosNovos.slice(0, 12).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 border-b border-[rgba(10,21,100,0.06)] pb-1.5">
                    <Link to={`/clientes/${p.cliente_id}`} className="font-medium hover:underline truncate">
                      {p.empresa}
                    </Link>
                    <span className="text-muted-foreground shrink-0">{p.nome_exibicao}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-bold text-navy mb-3">Histórico recente</h3>
            {data.historico.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem eventos no histórico.</p>
            ) : (
              <ul className="space-y-2 text-xs max-h-[280px] overflow-y-auto">
                {data.historico.slice(0, 15).map((h) => (
                  <li key={h.id} className="border-b border-[rgba(10,21,100,0.06)] pb-1.5">
                    <div className="flex justify-between gap-2">
                      <Link to={`/clientes/${h.cliente_id}`} className="font-medium hover:underline truncate">
                        {h.empresa}
                      </Link>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(h.created_at), "dd/MM HH:mm")}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{h.descricao}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-ink-35">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">{label}</p>
      </div>
      <p className="font-display text-[22px] font-bold leading-none text-navy">{value}</p>
      <p className="text-[11px] text-ink-35 mt-1.5">{sub}</p>
    </Card>
  );
}
