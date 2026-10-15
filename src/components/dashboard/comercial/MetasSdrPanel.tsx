import { useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarCheck, Info } from "lucide-react";
import { MonthPicker } from "@/components/ui/month-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEquipeComercial } from "@/hooks/data/useEquipeComercial";
import { useMetasComerciais, useSalvarMetaComercial } from "@/hooks/data/useMetasComerciais";
import {
  METRICAS_META,
  METRICA_META_LABEL_CURTO,
  consolidarMetas,
  labelAtingimento,
  mesLabel,
  normalizarMetaDigitada,
  tomAtingimento,
  type LinhaMetaSdr,
  type MetricaMeta,
  type TomAtingimento,
  type ValorMeta,
} from "@/lib/metas-comerciais";
import { cn } from "@/lib/utils";
import { Panel, InlineEmpty, TOM_BG, TOM_TEXT } from "../ui/primitives";

interface Props {
  mes: string;
  onMes: (mes: string) => void;
  podeEditar: boolean;
}

/**
 * "Metas do mês · SDR": agendadas e realizadas (meta × realizado, com barra
 * de atingimento), leads novos e contratos por SDR, mais a linha da equipe.
 * As metas são editáveis inline por admin/PMO/gestor comercial; o realizado
 * vem do histórico de etapas (ver convenção em `metas-comerciais.ts`).
 */
export function MetasSdrPanel({ mes, onMes, podeEditar }: Props) {
  const { data, isLoading, isError } = useMetasComerciais(mes);
  const { data: equipe = [] } = useEquipeComercial();
  const salvar = useSalvarMetaComercial();

  const consolidado = useMemo(
    () => (data ? consolidarMetas(data.realizado, data.metas, equipe) : null),
    [data, equipe],
  );

  const onSalvar = async (linha: LinhaMetaSdr, metrica: MetricaMeta, raw: string, atual: number | null) => {
    const valor = normalizarMetaDigitada(raw);
    if (valor === atual) return;
    try {
      await salvar.mutateAsync({
        escopo: linha.user_id ? "sdr" : "equipe",
        userId: linha.user_id,
        mes,
        metrica,
        valor,
      });
      toast.success(`Meta de ${linha.nome} atualizada.`);
    } catch {
      /* toastError já disparou no hook */
    }
  };

  const sdrs = consolidado?.linhas ?? [];
  const equipeLinha = consolidado?.equipe ?? null;

  return (
    <Panel
      eyebrow="Metas do mês · SDR"
      title="Reuniões agendadas e realizadas por SDR"
      subtitle={
        <span className="inline-flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          Agendada = lead movido para Apresentação; realizada = saiu de Apresentação para etapa seguinte. Mês em {mesLabel(mes)}.
        </span>
      }
      action={<MonthPicker value={mes} onChange={(v) => v && onMes(v)} clearable={false} aria-label="Mês das metas" />}
      flush
    >
      {isLoading ? (
        <InlineEmpty>Carregando metas…</InlineEmpty>
      ) : isError || !consolidado ? (
        <InlineEmpty>Não foi possível carregar as metas do mês.</InlineEmpty>
      ) : sdrs.length === 0 ? (
        <InlineEmpty>Nenhuma SDR cadastrada e nenhum movimento no mês. Defina o cargo comercial em Usuários.</InlineEmpty>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-ink-06">
                <Th className="pl-5">SDR</Th>
                {METRICAS_META.map((k) => (
                  <Th key={k} align="right">
                    {METRICA_META_LABEL_CURTO[k]}
                  </Th>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sdrs.map((l) => (
                <TableRow key={l.user_id ?? "sem-sdr"} className="border-ink-06 hover:bg-ink-03">
                  <TableCell className="pl-5 py-2.5">
                    <p className={cn("text-[13px] font-bold leading-snug", l.semSdr ? "text-ink-35 italic" : "text-ink")}>{l.nome}</p>
                    {l.semSdr && <p className="text-[10px] text-ink-35">leads sem dono — não recebe meta</p>}
                  </TableCell>
                  {METRICAS_META.map((k) => (
                    <TableCell key={k} className="py-2.5 text-right align-top">
                      <CelulaMeta
                        valor={l.metricas[k]}
                        comBarra={k === "reunioes_agendadas" || k === "reunioes_realizadas"}
                        editavel={podeEditar && !l.semSdr}
                        salvando={salvar.isPending}
                        ariaLabel={`Meta de ${METRICA_META_LABEL_CURTO[k].toLowerCase()} de ${l.nome}`}
                        onSalvar={(raw) => void onSalvar(l, k, raw, l.metricas[k].meta)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {equipeLinha && (
                <TableRow className="border-t-2 border-ink-12 bg-ink-03 hover:bg-ink-03">
                  <TableCell className="pl-5 py-2.5">
                    <p className="text-[13px] font-bold text-navy inline-flex items-center gap-1.5">
                      <CalendarCheck className="w-3.5 h-3.5 text-gold-deep" />
                      Equipe
                    </p>
                    <p className="text-[10px] text-ink-35">
                      {consolidado.metaEquipeExplicita ? "meta própria da equipe" : "meta = soma das SDRs"}
                    </p>
                  </TableCell>
                  {METRICAS_META.map((k) => (
                    <TableCell key={k} className="py-2.5 text-right align-top">
                      <CelulaMeta
                        valor={equipeLinha.metricas[k]}
                        comBarra={k === "reunioes_agendadas" || k === "reunioes_realizadas"}
                        editavel={podeEditar}
                        salvando={salvar.isPending}
                        ariaLabel={`Meta de ${METRICA_META_LABEL_CURTO[k].toLowerCase()} da equipe`}
                        onSalvar={(raw) => void onSalvar(equipeLinha, k, raw, consolidado.metaEquipeExplicita ? equipeLinha.metricas[k].meta : null)}
                        destaque
                      />
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

const TOM_META: Record<TomAtingimento, { text: string; bg: string }> = {
  green: { text: TOM_TEXT.green, bg: TOM_BG.green },
  amber: { text: TOM_TEXT.amber, bg: TOM_BG.amber },
  red: { text: TOM_TEXT.red, bg: TOM_BG.red },
  muted: { text: TOM_TEXT.muted, bg: TOM_BG.muted },
};

interface CelulaMetaProps {
  valor: ValorMeta;
  comBarra: boolean;
  editavel: boolean;
  salvando: boolean;
  ariaLabel: string;
  onSalvar: (raw: string) => void;
  destaque?: boolean;
}

/** "realizado / meta" com barra de atingimento; a meta vira input quando editável. */
function CelulaMeta({ valor, comBarra, editavel, salvando, ariaLabel, onSalvar, destaque }: CelulaMetaProps) {
  const tom = tomAtingimento(valor.pct);
  const largura = valor.pct == null ? 0 : Math.min(100, Math.max(valor.pct > 0 ? 3 : 0, valor.pct));
  return (
    <div className="inline-flex flex-col items-end gap-1 min-w-[96px]" title={labelAtingimento(valor)}>
      <div className="flex items-baseline gap-1 font-mono-dm tabular-nums">
        <span className={cn("text-[15px] font-extrabold font-display leading-none", destaque ? "text-navy" : TOM_META[tom].text)}>{valor.realizado}</span>
        <span className="text-[11px] text-ink-35">/</span>
        {editavel ? (
          <input
            type="number"
            min={0}
            step={1}
            key={valor.meta ?? "vazio"}
            defaultValue={valor.meta ?? ""}
            placeholder="meta"
            disabled={salvando}
            onBlur={(ev) => onSalvar(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
            }}
            className="h-6 w-14 rounded border border-[rgba(8,17,29,0.15)] bg-white px-1.5 text-right font-mono-dm text-[11px] tabular-nums text-navy placeholder:text-ink-35 focus:outline-none focus:ring-1 focus:ring-navy/40 disabled:opacity-60"
            aria-label={ariaLabel}
          />
        ) : (
          <span className="text-[11px] text-ink-60">{valor.meta ?? "—"}</span>
        )}
        {valor.pct != null && <span className={cn("text-[10px] font-semibold w-9 text-right", TOM_META[tom].text)}>{valor.pct}%</span>}
      </div>
      {comBarra && (
        <div className="h-1.5 w-full rounded-full bg-ink-06 overflow-hidden" aria-hidden>
          <div className={cn("h-full rounded-full transition-[width] duration-500", TOM_META[tom].bg)} style={{ width: `${largura}%` }} />
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left", className = "" }: { children: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <TableHead className={cn("h-9 text-[10px] font-bold uppercase tracking-[1.2px] text-ink-35", align === "right" && "text-right", className)}>
      {children}
    </TableHead>
  );
}
