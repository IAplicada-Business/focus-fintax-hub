import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, Search, Target, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useMoverLeadFunil } from "@/hooks/data/usePipelineSla";
import { canEditLead } from "@/lib/role-permissions";
import {
  PIPELINE_SLA_STAGES,
  SLA_FUNIL_STATUS_LABEL,
  diasDeAtraso,
  filtrarFilaSla,
  type EtapaFunil,
  type FiltroFilaSla,
  type LeadFunilLinha,
  type SlaFunilResumo,
} from "@/lib/pipeline-sla";
import type { LeadFunil } from "@/services/pipelineSlaService";
import { compactCurrency, SEGMENTO_LABELS } from "../../dashboard-utils";

const PAGINA = 20;

const STATUS_BADGE: Record<string, string> = {
  estourado: "bg-red-50 text-red-700 border-red-200",
  atencao: "bg-amber-50 text-amber-700 border-amber-200",
  no_prazo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sem_sla: "bg-gray-50 text-gray-600 border-gray-200",
};

interface Props {
  resumo: SlaFunilResumo<LeadFunil>;
  filtro: FiltroFilaSla;
  onFiltro: (f: FiltroFilaSla) => void;
}

/**
 * Fila "quem destravar primeiro" em tabela: etapa editável inline (mesma
 * gravação do kanban) e clique na linha abre o lead no pipeline.
 */
export function SlaFunilTabela({ resumo, filtro, onFiltro }: Props) {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const mover = useMoverLeadFunil();
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(PAGINA);

  const fila = useMemo(() => filtrarFilaSla(resumo, filtro, busca), [resumo, filtro, busca]);
  const visiveis = fila.slice(0, limite);
  const etapaFiltro = filtro !== "atrasados" && filtro !== "todos" ? filtro : null;
  const labelEtapa = (etapa: EtapaFunil) => resumo.etapas.find((e) => e.etapa === etapa)?.label ?? etapa;

  const abrirNoPipeline = (leadId: string) => navigate(`/pipeline?lead=${encodeURIComponent(leadId)}`);

  const trocarEtapa = async (linha: LeadFunilLinha<LeadFunil>, nova: string) => {
    if (nova === linha.etapa) return;
    const paraEtapa = PIPELINE_SLA_STAGES.find((s) => s.value === nova)?.value;
    if (!paraEtapa) return;
    try {
      await mover.mutateAsync({ leadId: linha.lead.id, deEtapa: linha.lead.status_funil, paraEtapa, usuarioId: user?.id });
      toast.success(`${linha.lead.empresa} movido para ${labelEtapa(paraEtapa)}.`);
    } catch {
      /* toastError já disparou no hook */
    }
  };

  const escolherFiltro = (f: FiltroFilaSla) => {
    onFiltro(f);
    setLimite(PAGINA);
  };

  const chip = (ativo: boolean, tom: "vermelho" | "neutro") =>
    `text-[11px] font-semibold px-3 py-1.5 rounded-md border transition-colors ${
      ativo
        ? tom === "vermelho"
          ? "bg-[rgba(200,0,30,0.08)] border-[rgba(200,0,30,0.25)] text-dash-red"
          : "bg-[rgba(10,21,100,0.06)] border-navy/30 text-navy"
        : "bg-white border-[rgba(10,21,100,0.10)] text-ink-60 hover:text-navy"
    }`;

  return (
    <div className="card-base overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-[rgba(10,21,100,0.10)] flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-ink-35 flex items-center gap-1.5">
            <Target className="w-3 h-3 text-dash-red" />
            Leads atrasados
          </p>
          <h3 className="font-display text-lg font-bold text-navy mt-0.5">Quem destravar primeiro</h3>
          <p className="text-xs text-ink-35 mt-1">
            Ordenado pelo maior atraso. Troque a etapa direto na linha ou clique pra abrir no pipeline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => escolherFiltro("atrasados")} className={chip(filtro === "atrasados", "vermelho")}>
            Atrasados · {resumo.totalAtrasados}
          </button>
          <button type="button" onClick={() => escolherFiltro("todos")} className={chip(filtro === "todos", "neutro")}>
            Todos · {resumo.linhas.length}
          </button>
          {etapaFiltro && (
            <button type="button" onClick={() => escolherFiltro("atrasados")} className={`${chip(true, "neutro")} inline-flex items-center gap-1.5`}>
              {labelEtapa(etapaFiltro)}
              <X className="w-3 h-3" />
            </button>
          )}
          <label className="relative">
            <Search className="w-3.5 h-3.5 text-ink-35 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setLimite(PAGINA);
              }}
              placeholder="Buscar empresa"
              className="h-8 w-[180px] rounded-md border border-[rgba(10,21,100,0.12)] bg-white pl-8 pr-2 text-xs text-navy placeholder:text-ink-35 focus:outline-none focus:ring-1 focus:ring-navy/40"
              aria-label="Buscar empresa"
            />
          </label>
        </div>
      </div>

      {fila.length === 0 ? (
        <p className="px-5 py-10 text-sm text-ink-35 text-center">
          {busca.trim()
            ? "Nenhuma empresa encontrada com esse nome."
            : filtro === "atrasados"
              ? "Nenhum lead acima da meta — funil saudável."
              : etapaFiltro
                ? "Nenhum lead nesta etapa."
                : "Nenhum lead em andamento no funil."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-[rgba(10,21,100,0.08)]">
              <Th className="pl-5">Empresa</Th>
              <Th>Etapa</Th>
              <Th align="right">Na etapa</Th>
              <Th align="right">Meta</Th>
              <Th align="right">Atraso</Th>
              <Th>Status</Th>
              <Th align="right" className="pr-5">
                <span className="sr-only">Abrir</span>
              </Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((l) => {
              const atraso = diasDeAtraso(l);
              const atrasado = l.sla.status === "estourado";
              const editavel = canEditLead(userRole, l.lead.status_funil ?? "novo");
              return (
                <TableRow
                  key={l.lead.id}
                  onClick={() => abrirNoPipeline(l.lead.id)}
                  className={`cursor-pointer border-[rgba(10,21,100,0.06)] transition-colors ${
                    atrasado ? "hover:bg-[rgba(200,0,30,0.04)]" : "hover:bg-[rgba(10,21,100,0.03)]"
                  }`}
                >
                  <TableCell className="pl-5 py-2.5 max-w-[260px]">
                    <p className="text-[13px] font-bold text-ink leading-snug truncate">{l.lead.empresa}</p>
                    <p className="text-[11px] text-ink-35 mt-0.5 truncate">
                      {l.lead.segmento ? SEGMENTO_LABELS[l.lead.segmento] ?? l.lead.segmento : "Sem segmento"}
                      {Number(l.lead.potencial ?? 0) > 0 ? ` · ${compactCurrency(Number(l.lead.potencial))}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                    {editavel ? (
                      <Select value={l.etapa} onValueChange={(v) => void trocarEtapa(l, v)} disabled={mover.isPending}>
                        <SelectTrigger className="h-7 w-[168px] text-[11px] font-semibold bg-white border-[rgba(10,21,100,0.12)]" aria-label={`Etapa de ${l.lead.empresa}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_SLA_STAGES.map((s) => (
                            <SelectItem key={s.value} value={s.value} className="text-xs">
                              {labelEtapa(s.value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-[11px] font-semibold text-navy">{l.label}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono-dm tabular-nums text-[13px]">
                    <span className={atrasado ? "text-dash-red font-bold" : "text-navy font-semibold"}>{l.dias}d</span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono-dm tabular-nums text-[12px] text-ink-60">
                    {l.sla.sla != null ? `${l.sla.sla}d` : "—"}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono-dm tabular-nums text-[12px]">
                    {atrasado ? (
                      <span className="text-dash-red font-bold">+{atraso}d</span>
                    ) : l.sla.status === "atencao" ? (
                      <span className="text-dash-amber font-semibold">{l.sla.restante === 0 ? "vence hoje" : `vence em ${l.sla.restante}d`}</span>
                    ) : (
                      <span className="text-ink-35">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge variant="outline" className={`${STATUS_BADGE[l.sla.status]} text-[9px] gap-1`}>
                      {atrasado && <AlertTriangle className="w-3 h-3" />}
                      {SLA_FUNIL_STATUS_LABEL[l.sla.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2.5 pr-5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirNoPipeline(l.lead.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[rgba(10,21,100,0.12)] bg-white px-2 py-1 text-[10px] font-semibold text-navy hover:bg-[rgba(10,21,100,0.05)] transition-colors"
                      aria-label={`Abrir ${l.lead.empresa} no pipeline`}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Abrir
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {fila.length > visiveis.length && (
        <div className="px-5 py-3 border-t border-[rgba(10,21,100,0.08)] flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-35">
            Mostrando {visiveis.length} de {fila.length}
          </p>
          <button
            type="button"
            onClick={() => setLimite((n) => n + PAGINA)}
            className="text-[11px] font-semibold text-navy underline underline-offset-2"
          >
            Mostrar mais {Math.min(PAGINA, fila.length - visiveis.length)}
          </button>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left", className = "" }: { children: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <TableHead className={`h-9 text-[10px] font-bold uppercase tracking-[1.2px] text-ink-35 ${align === "right" ? "text-right" : ""} ${className}`}>
      {children}
    </TableHead>
  );
}
