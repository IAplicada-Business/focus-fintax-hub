import type { NavigateFunction } from "react-router-dom";
import { ArrowDown } from "lucide-react";
import { compactCurrency, type FunnelRow } from "../dashboard-utils";
import { Panel, LinkMore } from "../ui/primitives";
import { taxasConversaoFunil } from "@/lib/comercial-analytics";
import { labelGapConversao, tomConversao, type TomConversao } from "@/lib/pipeline-sla";
import { cn } from "@/lib/utils";

const TOM_CONVERSAO_TEXT: Record<TomConversao, string> = {
  green: "text-dash-green",
  amber: "text-dash-amber",
  red: "text-dash-red",
  muted: "text-ink-35",
};

interface Props {
  funnelData: FunnelRow[];
  navigate: NavigateFunction;
  /** Meta de conversão (%) por etapa (pipeline_sla_config.meta_conversao_pct); etapa ausente = sem meta. */
  metasConversao?: Record<string, number>;
}

/**
 * Funil-fotografia com a conversão entre etapas ("quem chegou aqui e já
 * passou adiante") comparada à meta da etapa, quando definida — a cor do
 * percentual é o desvio contra a meta. Clique na etapa filtra o pipeline.
 */
export function FunilConversao({ funnelData, navigate, metasConversao = {} }: Props) {
  const linhas = taxasConversaoFunil(funnelData);
  const temMeta = Object.keys(metasConversao).length > 0;
  const max = Math.max(...funnelData.map((f) => f.count), 1);
  const total = funnelData.filter((f) => f.stage !== "ganho").reduce((s, f) => s + f.count, 0);
  const potencial = funnelData.reduce((s, f) => s + f.potencial, 0);

  return (
    <Panel
      eyebrow="Funil comercial"
      title="Onde os leads estão e quanto avança"
      subtitle={`${total} leads em andamento · ${compactCurrency(potencial)} de potencial · clique para filtrar o pipeline`}
      action={<LinkMore onClick={() => navigate("/pipeline")}>Abrir pipeline</LinkMore>}
      flush
    >
      <ul className="divide-y divide-ink-06">
        {linhas.map(({ row: f, taxaProxima }, i) => {
          const isContrato = f.stage === "contrato_emitido";
          const isCliente = f.stage === "ganho";
          const largura = Math.max((f.count / max) * 100, f.count > 0 ? 4 : 0);
          return (
            <li key={f.stage}>
              <button
                type="button"
                onClick={() => navigate(isCliente ? "/clientes" : `/pipeline?etapa=${f.stage}`)}
                className={cn("w-full text-left px-5 py-3 flex items-center gap-4 transition-colors hover:bg-ink-03 group", isContrato && "bg-[rgba(198,150,79,0.06)]")}
              >
                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: isContrato ? "#c6964f" : f.color }} />
                <div className="w-[150px] shrink-0 min-w-0">
                  <p className={cn("text-[13px] font-semibold truncate", isContrato ? "text-gold-deep" : isCliente ? "text-dash-green" : "text-ink")}>{f.label}</p>
                  <p className="text-[10px] text-ink-35 font-mono-dm tabular-nums">{f.potencial > 0 ? compactCurrency(f.potencial) : "—"}</p>
                </div>
                <div className="flex-1 min-w-[60px]">
                  <div className="h-2 rounded-full bg-ink-06 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${largura}%`, background: isContrato ? "#c6964f" : f.color }} />
                  </div>
                </div>
                <span className={cn("w-10 text-right font-display text-lg font-extrabold tabular-nums leading-none", isContrato ? "text-gold-deep" : isCliente ? "text-dash-green" : "text-navy")}>{f.count}</span>
                <span className="w-[96px] shrink-0 text-right">
                  {taxaProxima != null ? (
                    (() => {
                      const meta = metasConversao[f.stage];
                      const tom = meta != null ? tomConversao(taxaProxima, meta) : taxaProxima >= 50 ? "green" : taxaProxima >= 25 ? "amber" : "muted";
                      const gap = labelGapConversao(taxaProxima, meta);
                      return (
                        <span className="inline-flex flex-col items-end leading-tight" title={meta != null ? `Meta ${meta}% · observado ${taxaProxima}%` : undefined}>
                          <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-bold font-mono-dm tabular-nums", TOM_CONVERSAO_TEXT[tom])}>
                            <ArrowDown className="w-3 h-3" /> {taxaProxima}%
                          </span>
                          {meta != null && (
                            <span className={cn("text-[9px] font-mono-dm tabular-nums", TOM_CONVERSAO_TEXT[tom])}>
                              meta {meta}% · {gap}
                            </span>
                          )}
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-[10px] text-ink-35">{i === linhas.length - 1 ? "destino" : ""}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-5 py-2.5 text-[10px] text-ink-35 border-t border-ink-06">
        A seta indica quantos dos leads que chegaram à etapa já avançaram para a seguinte ou além.
        {temMeta
          ? " Verde = na meta de conversão; âmbar = até 10 pp abaixo; vermelho = mais que isso."
          : " Defina metas de conversão por etapa na régua do SLA para comparar."}
      </p>
    </Panel>
  );
}
