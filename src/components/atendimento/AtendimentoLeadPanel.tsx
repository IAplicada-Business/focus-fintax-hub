import { useState } from "react";
import { ExternalLink, MessageCircle, UserCheck, UserX, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PIPELINE_STAGES, STAGE_COLORS, SEGMENTO_LABELS, formatCurrency } from "@/lib/pipeline-constants";
import { useAuth } from "@/hooks/useAuth";
import { assumirAtendimento, liberarAtendimento, type InboxConversa } from "@/services/atendimentoService";
import { toastError } from "@/lib/handle-error";
import type { PipelineLead } from "@/pages/Pipeline";

function stageLabel(val: string) {
  return PIPELINE_STAGES.find((s) => s.value === val)?.label || val;
}

interface TeseIdentificada {
  tese_nome: string;
  estimativa_minima: number;
  estimativa_maxima: number;
}

/**
 * Status "Este atendimento" não é um campo separado no banco — deriva do que
 * já existe: bot_ativo (migration 20260826170000) e a direção da última
 * mensagem (quem falou por último define quem deve responder agora).
 */
function statusAtendimento(conversa: InboxConversa | null): { label: string; tone: string } {
  if (!conversa) return { label: "Sem conversa", tone: "text-muted-foreground border-border" };
  if (conversa.bot_ativo) return { label: "Robô respondendo", tone: "text-primary border-primary/30" };
  if (conversa.ultima_direcao === "entrada") {
    return { label: "Aguardando resposta", tone: "text-amber-700 border-amber-300 bg-amber-50" };
  }
  if (conversa.ultima_direcao === "saida") {
    return { label: "Respondido", tone: "text-emerald-700 border-emerald-300 bg-emerald-50" };
  }
  return { label: "Sem mensagens", tone: "text-muted-foreground border-border" };
}

interface Props {
  lead: PipelineLead | null;
  leadsCount: number;
  /** Conversa selecionada no inbox — é de onde vem status/responsável/canal do bloco "Este atendimento". */
  conversa: InboxConversa | null;
  /** Chamado depois de assumir/liberar, pra recarregar a lista do inbox. */
  onAtualizarConversa?: () => void;
}

export function AtendimentoLeadPanel({ lead, leadsCount, conversa, onAtualizarConversa }: Props) {
  const { user } = useAuth();
  const [processando, setProcessando] = useState(false);

  const status = statusAtendimento(conversa);
  const souResponsavel = Boolean(conversa?.assumido_por && user?.id && conversa.assumido_por === user.id);

  const assumir = async () => {
    if (!conversa?.telefone || !user?.id) return;
    setProcessando(true);
    try {
      await assumirAtendimento(conversa.telefone, user.id);
      onAtualizarConversa?.();
    } catch (e) {
      toastError(e, "Não foi possível assumir o atendimento");
    } finally {
      setProcessando(false);
    }
  };

  const liberar = async () => {
    if (!conversa?.telefone) return;
    setProcessando(true);
    try {
      await liberarAtendimento(conversa.telefone);
      onAtualizarConversa?.();
    } catch (e) {
      toastError(e, "Não foi possível liberar o atendimento");
    } finally {
      setProcessando(false);
    }
  };

  const teses = (lead?.relatorios_leads?.[0]?.teses_identificadas as TeseIdentificada[] | undefined) || [];
  const potMin = lead?.relatorios_leads?.[0]?.estimativa_total_minima || 0;
  const potMax = lead?.relatorios_leads?.[0]?.estimativa_total_maxima || 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Bloco fixo "Este atendimento" — sempre visível, não some sem lead vinculado. */}
      <div className="px-4 py-3 border-b shrink-0 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Este atendimento
        </p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">Status</p>
            <Badge variant="outline" className={`mt-0.5 text-[10px] ${status.tone}`}>
              {status.label}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Canal</p>
            <p className="mt-0.5 font-medium flex items-center gap-1">
              <MessageCircle className="h-3 w-3 text-primary" aria-hidden /> WhatsApp
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Registros vinculados</p>
            <p className="mt-0.5 font-medium">{leadsCount || 1}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Responsável</p>
            <p className="mt-0.5 font-medium truncate" title={conversa?.assumido_por_nome || undefined}>
              {conversa?.assumido_por_nome || "Sem responsável"}
            </p>
          </div>
        </div>
        {conversa && (
          <div className="pt-1">
            {souResponsavel ? (
              <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={liberar} disabled={processando}>
                {processando ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserX className="h-3 w-3 mr-1" />}
                Liberar atendimento
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={assumir} disabled={processando}>
                {processando ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserCheck className="h-3 w-3 mr-1" />}
                Assumir atendimento
              </Button>
            )}
          </div>
        )}
      </div>

      {!lead ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Sem lead vinculado a este número. A conversa continua, mas o diagnóstico fica no cadastro.
          </p>
        </div>
      ) : (
        <>
          {/* Entidade de negócio vinculada — explícito como card, não só um link solto. */}
          <div className="px-4 py-3 border-b shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
              Lead vinculado
            </p>
            <div className="rounded-lg border p-2.5 space-y-1.5">
              <p className="font-semibold text-sm truncate">{lead.empresa}</p>
              <p className="text-xs text-muted-foreground truncate">{lead.nome}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={STAGE_COLORS[lead.status_funil] || ""}>
                  {stageLabel(lead.status_funil)}
                </Badge>
                {lead.score_lead != null && (
                  <span className="text-[11px] text-muted-foreground">Score {lead.score_lead}</span>
                )}
              </div>
              <a href="/pipeline" className="text-xs text-primary hover:underline inline-flex items-center gap-1 pt-0.5">
                Abrir no pipeline <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {leadsCount > 1 && (
              <p className="text-[11px] text-amber-700 mt-2">Este número aparece em {leadsCount} leads.</p>
            )}
          </div>

          <Tabs defaultValue="dados" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-3">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 mt-3">
              <Field label="WhatsApp" value={lead.whatsapp} />
              <Field label="E-mail" value={lead.email} />
              <Field label="CNPJ" value={lead.cnpj} />
              <Field label="Regime" value={lead.regime_tributario} />
              <Field label="Segmento" value={SEGMENTO_LABELS[lead.segmento] || lead.segmento} />
              <Field label="Faturamento" value={lead.faturamento_faixa} />
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
                  {teses.map((t, i) => {
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

            <TabsContent value="historico" className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 mt-3">
              <p className="text-[11px] text-muted-foreground">
                A conversa de WhatsApp é única por número (migration 20260826170000) — o histórico completo de
                mensagens já está na própria janela de chat, ao centro.
              </p>
              <div className="rounded-lg border p-2.5 space-y-1 text-xs">
                <p className="text-muted-foreground">Criado em</p>
                <p className="font-medium">{lead.criado_em ? new Date(lead.criado_em).toLocaleDateString("pt-BR") : "—"}</p>
              </div>
              {conversa?.assumido_em && (
                <div className="rounded-lg border p-2.5 space-y-1 text-xs">
                  <p className="text-muted-foreground">Assumido em</p>
                  <p className="font-medium">{new Date(conversa.assumido_em).toLocaleString("pt-BR")}</p>
                </div>
              )}
              {leadsCount > 1 && (
                <p className="text-[11px] text-amber-700">
                  Este número tem {leadsCount} registros de lead — todos compartilham a mesma conversa.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
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
