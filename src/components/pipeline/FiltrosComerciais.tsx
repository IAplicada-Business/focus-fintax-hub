import { CalendarRange } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  PERIODO_PIPELINE_OPCOES,
  isTipoPeriodoPipeline,
  trocarTipoPeriodo,
  type PeriodoPipeline,
} from "@/lib/pipeline-periodo";
import { PRODUTOS_LEAD, PRODUTO_LEAD_COLORS, PRODUTO_LEAD_LABEL, PRODUTO_LEAD_PADRAO, isProdutoLead, type FiltroProduto } from "@/lib/produto-lead";
import {
  closersDaEquipe,
  iniciais,
  nomeDoMembro,
  primeiroNome,
  sdrsDaEquipe,
  type FiltroResponsavel,
  type MembroEquipeComercial,
} from "@/lib/equipe-comercial";
import { cn } from "@/lib/utils";

/** Chips "Todos · AGF Contábil · AGF Fintax · AGF Tax" — mesmo visual do seletor Quadro/Lista. */
export function ProdutoFiltroChips({ value, onChange, className }: { value: FiltroProduto; onChange: (v: FiltroProduto) => void; className?: string }) {
  const opcoes: { value: FiltroProduto; label: string }[] = [{ value: "todos", label: "Todos" }, ...PRODUTOS_LEAD];
  return (
    <div role="radiogroup" aria-label="Filtrar por produto" className={cn("flex rounded-full border border-ink-06 bg-white p-0.5", className)}>
      {opcoes.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 px-3 rounded-full text-xs font-semibold transition-colors whitespace-nowrap",
            value === o.value ? "bg-navy text-white" : "text-ink-60 hover:text-navy",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProdutoBadge({ produto, className }: { produto: string | null | undefined; className?: string }) {
  const p = isProdutoLead(produto) ? produto : PRODUTO_LEAD_PADRAO;
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", PRODUTO_LEAD_COLORS[p], className)} title={`Produto: ${PRODUTO_LEAD_LABEL[p]}`}>
      {PRODUTO_LEAD_LABEL[p]}
    </span>
  );
}

/** Select "Responsável": Todos / Sem responsável / cada SDR / cada closer. */
export function ResponsavelSelect({
  value,
  onChange,
  equipe,
  className,
}: {
  value: FiltroResponsavel;
  onChange: (v: FiltroResponsavel) => void;
  equipe: MembroEquipeComercial[];
  className?: string;
}) {
  const sdrs = sdrsDaEquipe(equipe);
  const closers = closersDaEquipe(equipe);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 w-[190px] text-xs bg-white", className)} aria-label="Filtrar por responsável">
        <SelectValue placeholder="Responsável" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todos os responsáveis</SelectItem>
        <SelectItem value="sem">Sem responsável</SelectItem>
        {sdrs.map((m) => (
          <SelectItem key={m.user_id} value={m.user_id}>
            SDR · {m.full_name || "Sem nome"}
          </SelectItem>
        ))}
        {closers.map((m) => (
          <SelectItem key={m.user_id} value={m.user_id}>
            Closer · {m.full_name || "Sem nome"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Iniciais do SDR e do closer no card. Sem nenhum dos dois não renderiza
 * nada: o card já é denso e "solto" é o estado normal de lista nova.
 */
export function ResponsaveisChip({
  sdrId,
  closerId,
  equipe,
  compacto = true,
}: {
  sdrId: string | null | undefined;
  closerId: string | null | undefined;
  equipe: MembroEquipeComercial[];
  compacto?: boolean;
}) {
  const sdr = nomeDoMembro(equipe, sdrId);
  const closer = nomeDoMembro(equipe, closerId);
  if (!sdrId && !closerId) return null;
  const mostrar = (nome: string | null) => (compacto ? iniciais(nome) : primeiroNome(nome) || "?");
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums">
      {sdrId && (
        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800" title={`SDR: ${sdr ?? "usuário removido"}`}>
          {mostrar(sdr)}
        </span>
      )}
      {closerId && (
        <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800" title={`Closer: ${closer ?? "usuário removido"}`}>
          {mostrar(closer)}
        </span>
      )}
    </span>
  );
}

/**
 * Período de criação do lead: Tudo / Este mês / Mês passado / 30d / 90d ou um
 * mês escolhido no MonthPicker (aparece só quando "Escolher mês" está ativo).
 */
export function PeriodoSelect({
  value,
  onChange,
  className,
}: {
  value: PeriodoPipeline;
  onChange: (v: PeriodoPipeline) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <Select value={value.tipo} onValueChange={(v) => isTipoPeriodoPipeline(v) && onChange(trocarTipoPeriodo(value, v))}>
        <SelectTrigger className="h-9 w-[160px] text-xs bg-white" aria-label="Filtrar por período de criação">
          <CalendarRange className="h-3.5 w-3.5 mr-1.5 text-ink-35 shrink-0" />
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {PERIODO_PIPELINE_OPCOES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.tipo === "mes" && (
        <MonthPicker
          value={value.mes}
          onChange={(mes) => onChange({ tipo: "mes", mes })}
          clearable={false}
          triggerClassName="h-9 bg-white"
          aria-label="Mês de criação do lead"
        />
      )}
    </div>
  );
}
