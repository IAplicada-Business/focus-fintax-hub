import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PIPELINE_STAGES, STAGE_COLORS, SEGMENTO_LABELS, formatCurrency } from "@/lib/pipeline-constants";
import type { PipelineLead } from "@/pages/Pipeline";

function stageLabel(val: string) {
  return PIPELINE_STAGES.find((s) => s.value === val)?.label || val;
}

export function AtendimentoLeadPanel({
  lead,
  leadsCount,
}: {
  lead: PipelineLead | null;
  leadsCount: number;
}) {
  if (!lead) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Sem lead vinculado a este número. A conversa continua, mas o diagnóstico fica no cadastro.
        </p>
      </div>
    );
  }

  const teses = (lead.relatorios_leads?.[0]?.teses_identificadas as any[]) || [];
  const potMin = lead.relatorios_leads?.[0]?.estimativa_total_minima || 0;
  const potMax = lead.relatorios_leads?.[0]?.estimativa_total_maxima || 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b shrink-0">
        <p className="font-semibold text-sm truncate">{lead.empresa}</p>
        <p className="text-xs text-muted-foreground truncate">{lead.nome}</p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className={STAGE_COLORS[lead.status_funil] || ""}>
            {stageLabel(lead.status_funil)}
          </Badge>
          {lead.score_lead != null && (
            <span className="text-[11px] text-muted-foreground">Score {lead.score_lead}</span>
          )}
        </div>
        {leadsCount > 1 && (
          <p className="text-[11px] text-amber-700 mt-2">
            Este número aparece em {leadsCount} leads.
          </p>
        )}
      </div>

      <Tabs defaultValue="dados" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 mt-3">
          <Field label="WhatsApp" value={lead.whatsapp} />
          <Field label="E-mail" value={lead.email} />
          <Field label="CNPJ" value={lead.cnpj} />
          <Field label="Regime" value={lead.regime_tributario} />
          <Field label="Segmento" value={SEGMENTO_LABELS[lead.segmento] || lead.segmento} />
          <Field label="Faturamento" value={lead.faturamento_faixa} />
          <a href="/pipeline" className="text-xs text-primary hover:underline inline-flex items-center gap-1 pt-1">
            Abrir no pipeline <ExternalLink className="h-3 w-3" />
          </a>
        </TabsContent>

        <TabsContent value="diagnostico" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 mt-3">
          {teses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum diagnóstico gerado ainda.</p>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-primary/5 border">
                <p className="text-xs text-muted-foreground">Potencial estimado</p>
                <p className="text-sm font-bold text-primary">
                  {formatCurrency(potMin)} — {formatCurrency(potMax)}
                </p>
              </div>
              {teses.map((t: any, i: number) => {
                const max = potMax > 0 ? (Number(t.estimativa_maxima) / potMax) * 100 : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs gap-2">
                      <span className="font-medium truncate">{t.tese_nome}</span>
                      <span className="text-muted-foreground shrink-0">
                        {formatCurrency(t.estimativa_minima)} — {formatCurrency(t.estimativa_maxima)}
                      </span>
                    </div>
                    <Progress value={max} className="h-1.5" />
                  </div>
                );
              })}
              <a
                href={`/diagnostico/${lead.token}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
              >
                Ver diagnóstico completo <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-medium break-words">{value || "—"}</p>
    </div>
  );
}
