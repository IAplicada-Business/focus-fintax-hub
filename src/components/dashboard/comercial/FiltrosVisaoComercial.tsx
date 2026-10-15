import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodoSelect, ProdutoFiltroChips, ResponsavelSelect } from "@/components/pipeline/FiltrosComerciais";
import type { MembroEquipeComercial } from "@/lib/equipe-comercial";
import {
  contarFiltrosAtivos,
  FAIXAS_VALOR,
  FILTROS_COMERCIAL_PADRAO,
  isFaixaValor,
  type FiltrosDashboardComercial,
} from "@/lib/filtros-dashboard-comercial";
import { FUNNEL_STAGES_COM } from "../dashboard-utils";

interface Props {
  value: FiltrosDashboardComercial;
  onChange: (next: FiltrosDashboardComercial) => void;
  equipe: MembroEquipeComercial[];
  /** Leads no recorte × total, para o contador ao lado do "Limpar". */
  total: number;
  noRecorte: number;
}

/** Barra de filtros da Visão Comercial — mesma posição dos filtros da Visão Executiva. */
export function FiltrosVisaoComercial({ value, onChange, equipe, total, noRecorte }: Props) {
  const set = <K extends keyof FiltrosDashboardComercial>(k: K, v: FiltrosDashboardComercial[K]) => onChange({ ...value, [k]: v });
  const ativos = contarFiltrosAtivos(value);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros da visão comercial">
      <ProdutoFiltroChips value={value.produto} onChange={(v) => set("produto", v)} />
      <PeriodoSelect value={value.periodo} onChange={(v) => set("periodo", v)} />
      <Select value={value.etapa} onValueChange={(v) => set("etapa", v)}>
        <SelectTrigger className="h-9 w-[170px] text-xs bg-white" aria-label="Filtrar por etapa">
          <Filter className="h-3.5 w-3.5 mr-1.5 text-ink-35 shrink-0" />
          <SelectValue placeholder="Etapa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas as etapas</SelectItem>
          {FUNNEL_STAGES_COM.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ResponsavelSelect value={value.responsavel} onChange={(v) => set("responsavel", v)} equipe={equipe} />
      <Select value={value.valor} onValueChange={(v) => isFaixaValor(v) && set("valor", v)}>
        <SelectTrigger className="h-9 w-[190px] text-xs bg-white" aria-label="Filtrar por valor estimado">
          <SelectValue placeholder="Valor" />
        </SelectTrigger>
        <SelectContent>
          {FAIXAS_VALOR.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {ativos > 0 && (
        <>
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => onChange(FILTROS_COMERCIAL_PADRAO)}>
            <X className="h-3.5 w-3.5 mr-1" />
            Limpar filtros
          </Button>
          <span className="text-[11px] text-ink-35 tabular-nums">
            {noRecorte} de {total} leads
          </span>
        </>
      )}
    </div>
  );
}
