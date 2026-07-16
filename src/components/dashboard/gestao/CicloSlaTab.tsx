import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import {
  ETAPA_LABEL,
  fetchCicloSla,
  type EtapaCiclo,
} from "@/services/gestaoDashboardService";
import { SkeletonKpi } from "../SkeletonKpi";
import { Clock, AlertTriangle, UserX } from "lucide-react";

const ETAPAS: EtapaCiclo[] = [
  "cadastrado",
  "com_processo",
  "com_credito",
  "tese_ativa",
  "compensando",
  "compensado",
];

export function CicloSlaTab() {
  const [filtro, setFiltro] = useState<"atrasados" | "todos" | EtapaCiclo>("atrasados");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-gestao-ciclo"],
    queryFn: fetchCicloSla,
    staleTime: 30_000,
  });

  const lista = useMemo(() => {
    if (!data) return [];
    if (filtro === "atrasados") return data.clientes.filter((c) => c.atrasado);
    if (filtro === "todos") return data.clientes;
    return data.clientes.filter((c) => c.etapa === filtro);
  }, [data, filtro]);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Ciclo do cliente até a compensação, com tempos heurísticos (até o macrofluxo oficial).
        Atraso: cadastrado &gt;7d sem processo · processo &gt;15d sem crédito · crédito/tese &gt;30d sem 1ª
        compensação · compensando &gt;45d sem nova compensação.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-ink-35" />
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Atrasados</p>
          </div>
          <p className="font-display text-[22px] font-bold text-[var(--dash-red)]">{data.atrasados}</p>
          <p className="text-[11px] text-ink-35 mt-1.5">acima do SLA da etapa</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <UserX className="w-3.5 h-3.5 text-ink-35" />
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Sem operação / início</p>
          </div>
          <p className="font-display text-[22px] font-bold text-navy">{data.semOperacao}</p>
          <p className="text-[11px] text-ink-35 mt-1.5">ainda sem esteira ativa</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-ink-35" />
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Tempo médio (compensando)</p>
          </div>
          <p className="font-display text-[22px] font-bold text-navy">
            {data.tempoMedioDias.compensando != null ? `${data.tempoMedioDias.compensando}d` : "—"}
          </p>
          <p className="text-[11px] text-ink-35 mt-1.5">na etapa atual</p>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-navy mb-3">Tempo médio por etapa</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {ETAPAS.map((e) => (
            <div key={e} className="rounded-lg border px-3 py-2.5">
              <p className="text-[10px] text-ink-35 leading-tight mb-1">{ETAPA_LABEL[e]}</p>
              <p className="font-display text-lg font-bold text-navy">
                {data.tempoMedioDias[e] != null ? `${data.tempoMedioDias[e]}d` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {data.clientes.filter((c) => c.etapa === e).length} cli
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-navy">Clientes no ciclo</h3>
          <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atrasados">Só atrasados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
              {ETAPAS.map((e) => (
                <SelectItem key={e} value={e}>
                  {ETAPA_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {lista.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum cliente neste filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b text-[10px] text-ink-35 uppercase tracking-wider">
                  <th className="py-1">Cliente</th>
                  <th className="py-1">Etapa</th>
                  <th className="py-1">Tese em uso</th>
                  <th className="text-right py-1">Dias na etapa</th>
                  <th className="text-right py-1">Saldo</th>
                  <th className="py-1">SLA</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, 40).map((c) => (
                  <tr key={c.id} className="border-b border-[rgba(10,21,100,0.06)]">
                    <td className="py-1.5">
                      <Link to={`/clientes/${c.id}`} className="font-medium hover:underline">
                        {c.empresa}
                      </Link>
                    </td>
                    <td className="py-1.5">{ETAPA_LABEL[c.etapa]}</td>
                    <td className="py-1.5 text-muted-foreground">{c.teseAtiva || "—"}</td>
                    <td className="py-1.5 text-right font-semibold">{c.diasNaEtapa}d</td>
                    <td className="py-1.5 text-right">{formatCurrencyBR(c.saldo)}</td>
                    <td className="py-1.5">
                      {c.atrasado ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[9px]">
                          Atrasado
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
