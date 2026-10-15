import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import { formatCurrency } from "@/lib/pipeline-constants";
import { elegivelDiagnostico } from "@/lib/import-leads-parser";
import { montarMensagemDiagnostico } from "@/lib/diagnostico-whatsapp";
import { useAnalyzeLead, useEnviarDiagnosticoWhatsapp } from "@/hooks/data/useLeads";
import type { PipelineLead } from "@/pages/Pipeline";

interface TeseSalva {
  tese_nome: string;
  estimativa_minima: number;
  estimativa_maxima: number;
}

/** Linha de relatorios_leads como vem no embed de listLeads (já a mais nova). */
type RelatorioSalvo = PipelineLead["relatorios_leads"][number] & {
  criado_em?: string | null;
  enviado_em?: string | null;
};

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Aba "Diagnóstico" do painel do lead: o diagnóstico SALVO no lead (o mesmo
 * que o lead vê em /diagnostico/:token), com as ações de abrir, regerar e
 * enviar no WhatsApp. Substitui a antiga página de "relatório" em formato
 * de e-mail — o lead tem uma visão só.
 */
export function LeadDiagnosticoTab({
  lead,
  onRefresh,
  somenteLeitura,
}: {
  lead: PipelineLead;
  onRefresh: () => void;
  somenteLeitura: boolean;
}) {
  const analisar = useAnalyzeLead();
  const enviar = useEnviarDiagnosticoWhatsapp();

  const rel = lead.relatorios_leads?.[0] as RelatorioSalvo | undefined;
  // Mesmo filtro do layout público: tese sem valor não aparece para o lead.
  const teses = ((rel?.teses_identificadas as TeseSalva[] | undefined) ?? []).filter((t) => Number(t.estimativa_maxima) > 0);
  const potMin = Number(rel?.estimativa_total_minima ?? 0);
  const potMax = Number(rel?.estimativa_total_maxima ?? 0);
  const temDiagnostico = !!rel && teses.length > 0;
  const elegivel = elegivelDiagnostico(lead);
  const linkPublico = `/diagnostico/${lead.token}`;

  const regerar = () => analisar.mutate(lead.id, { onSuccess: () => onRefresh() });
  const enviarWhatsapp = () => enviar.mutate(lead.id, { onSuccess: (r) => r.ok && onRefresh() });

  return (
    <div className="space-y-4">
      {temDiagnostico ? (
        <>
          <div className="p-3 rounded-lg bg-primary/5 border">
            <p className="text-xs text-muted-foreground">Potencial total estimado</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(potMin)} — {formatCurrency(potMax)}</p>
            {rel?.criado_em && <p className="text-[11px] text-muted-foreground mt-1">Gerado em {fmtData(rel.criado_em)}</p>}
            {rel?.enviado_em && <p className="text-[11px] text-muted-foreground">Enviado no WhatsApp em {fmtData(rel.enviado_em)}</p>}
          </div>
          {teses.map((t, i) => {
            const max = potMax > 0 ? (Number(t.estimativa_maxima) / potMax) * 100 : 0;
            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs gap-2">
                  <span className="font-medium">{t.tese_nome}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(t.estimativa_minima)} — {formatCurrency(t.estimativa_maxima)}</span>
                </div>
                <Progress value={max} className="h-1.5" />
              </div>
            );
          })}
        </>
      ) : (
        <div className="py-6 text-center space-y-1">
          <p className="text-sm text-muted-foreground">Nenhum diagnóstico gerado ainda.</p>
          {!elegivel && (
            <p className="text-xs text-muted-foreground">Preencha faturamento e regime tributário na aba Dados para gerar.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {temDiagnostico && (
          <Button variant="outline" size="sm" asChild>
            <a href={linkPublico} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir diagnóstico
            </a>
          </Button>
        )}
        {!somenteLeitura && elegivel && (
          <Button variant="outline" size="sm" onClick={regerar} disabled={analisar.isPending}>
            {analisar.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            {temDiagnostico ? "Regerar diagnóstico" : "Gerar diagnóstico"}
          </Button>
        )}
        {!somenteLeitura && temDiagnostico && (
          <Button
            size="sm"
            onClick={enviarWhatsapp}
            disabled={enviar.isPending || !lead.whatsapp}
            title={lead.whatsapp ? "Envia o link pelo WhatsApp da empresa; a resposta cai em Atendimento com o robô ligado" : "Lead sem WhatsApp cadastrado"}
          >
            {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Enviar no WhatsApp
          </Button>
        )}
      </div>

      {!somenteLeitura && temDiagnostico && lead.whatsapp && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Ver mensagem que será enviada</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans rounded-md border bg-muted/40 p-3 text-foreground">
            {montarMensagemDiagnostico(lead.nome, lead.empresa, `${typeof window !== "undefined" ? window.location.origin : ""}${linkPublico}`)}
          </pre>
        </details>
      )}
    </div>
  );
}
