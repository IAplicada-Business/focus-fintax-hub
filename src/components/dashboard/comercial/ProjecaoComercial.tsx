import { DarkPanel, DarkStat } from "../ui/primitives";
import { compactCurrency } from "../dashboard-utils";
import type { PipelinePonderado } from "@/lib/comercial-analytics";

interface Props {
  ponderado: PipelinePonderado;
  ritmoNovos: number;
  ritmoContratos: number;
  tempoAteContrato: number | null;
  taxaConversao: number;
  contratosEmitidos: number;
}

/**
 * Painel escuro de projeção: o que o pipeline de hoje deve virar. Fechamentos
 * previstos = ritmo semanal de contratos × 4,3 semanas.
 */
export function ProjecaoComercial({ ponderado, ritmoNovos, ritmoContratos, tempoAteContrato, taxaConversao, contratosEmitidos }: Props) {
  const fechamentos30d = Math.round(ritmoContratos * 4.3 * 10) / 10;
  const leads30d = Math.round(ritmoNovos * 4.3);
  return (
    <DarkPanel eyebrow="Projeção · próximos 30 dias" title="O que o pipeline de hoje deve virar" className="h-full">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <DarkStat label="Pipeline ponderado" value={compactCurrency(ponderado.total)} sub={`de ${compactCurrency(ponderado.potencial)} em aberto · por probabilidade da etapa`} tom="gold" />
        <DarkStat label="Fechamentos previstos" value={fechamentos30d > 0 ? String(fechamentos30d) : "—"} sub={`contratos em 30d no ritmo atual · ${contratosEmitidos} já emitidos`} tom="amber" />
        <DarkStat label="Novos leads previstos" value={leads30d > 0 ? String(leads30d) : "—"} sub={`${ritmoNovos}/semana nas últimas 4 semanas`} />
        <DarkStat label="Tempo até contrato" value={tempoAteContrato != null ? `${Math.round(tempoAteContrato)}d` : "—"} sub="média da criação até Contrato Emitido" />
      </div>
      <div className="mt-5 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between text-[10px] text-white/50 uppercase tracking-[1.4px] font-bold mb-2">
          <span>Probabilidade por etapa</span>
          <span>conversão lead → cliente {taxaConversao}%</span>
        </div>
        <ul className="space-y-1.5">
          {ponderado.porEtapa.map((e) => (
            <li key={e.etapa} className="flex items-center gap-2 text-[11px]">
              <span className="w-[112px] shrink-0 truncate text-white/70 capitalize">{ETAPA_LABEL[e.etapa] ?? e.etapa}</span>
              <span className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <span className="block h-full rounded-full bg-gold" style={{ width: `${Math.round(e.probabilidade * 100)}%` }} />
              </span>
              <span className="w-8 text-right font-mono-dm tabular-nums text-white/60">{Math.round(e.probabilidade * 100)}%</span>
              <span className="w-[68px] text-right font-mono-dm tabular-nums text-gold-soft font-semibold">{compactCurrency(e.ponderado)}</span>
            </li>
          ))}
          {ponderado.porEtapa.length === 0 && <li className="text-[11px] text-white/50">Sem leads em andamento.</li>}
        </ul>
      </div>
    </DarkPanel>
  );
}

const ETAPA_LABEL: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  em_negociacao: "Negociação",
  em_apresentacao: "Apresentação",
  contrato_emitido: "Contrato",
};
