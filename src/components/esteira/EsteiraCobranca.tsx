import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { ResponsavelAvatar } from "@/components/esteira/ResponsavelAvatar";
import { Button } from "@/components/ui/button";
import type { EsteiraCliente } from "@/services/esteiraService";
import type { EsteiraSlaConfigRow } from "@/services/esteiraSlaConfigService";
import {
  agruparPorResponsavel,
  resumoCobrancaTexto,
  urgenciaTexto,
  type Urgencia,
} from "@/lib/esteira-acompanhamento";
import { cn } from "@/lib/utils";

interface Props {
  clientes: EsteiraCliente[];
  slaConfig: EsteiraSlaConfigRow[];
}

const URGENCIA_STYLE: Record<Urgencia, string> = {
  estourado: "bg-red-50 text-red-700 border-red-200",
  hoje: "bg-amber-50 text-amber-800 border-amber-200",
  amanha: "bg-sky-50 text-sky-800 border-sky-200",
};

/**
 * Aba Cobrança — fim de dia do PMO: por responsável, o que já estourou, o que
 * vence hoje e o que vence amanhã. "Copiar resumo" gera texto puro pra colar
 * no WhatsApp da pessoa.
 */
export function EsteiraCobranca({ clientes, slaConfig }: Props) {
  const navigate = useNavigate();
  const labelEtapa = useMemo(() => {
    const m = new Map(slaConfig.map((r) => [r.estagio as string, r.label]));
    return (e: string) => m.get(e) ?? e;
  }, [slaConfig]);

  const grupos = useMemo(() => agruparPorResponsavel(clientes, slaConfig), [clientes, slaConfig]);
  const totais = useMemo(
    () => grupos.reduce(
      (acc, g) => ({ estourados: acc.estourados + g.estourados, hoje: acc.hoje + g.hoje, amanha: acc.amanha + g.amanha }),
      { estourados: 0, hoje: 0, amanha: 0 },
    ),
    [grupos],
  );

  const copiar = async (texto: string, nome: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`Resumo de ${nome} copiado.`);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  if (grupos.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          title="Nada a cobrar hoje"
          subtitle="Nenhum cliente com SLA estourado, vencendo hoje ou amanhã neste ramo."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto pb-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={cn("rounded-full border px-2.5 py-1 font-semibold", URGENCIA_STYLE.estourado)}>{totais.estourados} estourado{totais.estourados !== 1 ? "s" : ""}</span>
        <span className={cn("rounded-full border px-2.5 py-1 font-semibold", URGENCIA_STYLE.hoje)}>{totais.hoje} vence{totais.hoje !== 1 ? "m" : ""} hoje</span>
        <span className={cn("rounded-full border px-2.5 py-1 font-semibold", URGENCIA_STYLE.amanha)}>{totais.amanha} vence{totais.amanha !== 1 ? "m" : ""} amanhã</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {grupos.map((g) => {
          const semResp = g.responsavel_id === null;
          return (
            <section
              key={g.responsavel_id ?? "__sem__"}
              className={cn("overflow-hidden rounded-lg border bg-card", semResp && "border-amber-300")}
            >
              <header className="flex items-center gap-3 border-b px-4 py-3">
                <ResponsavelAvatar nome={semResp ? null : g.nome} size="md" />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-semibold", semResp ? "text-amber-800" : "text-foreground")}>{g.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {g.itens.length} pendência{g.itens.length !== 1 ? "s" : ""} · {g.estourados} estourado{g.estourados !== 1 ? "s" : ""} · {g.hoje} hoje · {g.amanha} amanhã
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copiar(resumoCobrancaTexto(g, labelEtapa), g.nome)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar resumo
                </Button>
              </header>
              {semResp && (
                <p className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Defina um responsável em Esteira › Organizar para estes clientes aparecerem na cobrança de alguém.
                </p>
              )}
              <ul className="divide-y">
                {g.itens.map((item) => (
                  <li key={item.cliente.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/clientes/${item.cliente.id}`)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className={cn("mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", URGENCIA_STYLE[item.urgencia])}>
                        {urgenciaTexto(item)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{item.cliente.empresa}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {labelEtapa(item.cliente.estagio_esteira)} · {item.sla.dias}d na etapa
                          {item.sla.sla != null ? ` · meta ${item.sla.sla}d` : ""}
                        </span>
                        <span className="block text-[11px] text-foreground/80">{item.acao}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
