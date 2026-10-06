import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Receipt,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClienteDocumentosPanel } from "@/components/clientes/ClienteDocumentosPanel";
import { EsteiraTimeline } from "@/components/clientes/EsteiraTimeline";
import { ResponsavelAvatar } from "@/components/esteira/ResponsavelAvatar";
import { useClienteHistorico } from "@/hooks/data/useClienteOperacional";
import { useUpdateClienteMotivoParada } from "@/hooks/data/useClientes";
import { useEsteiraCliente, useEsteiraSlaConfig } from "@/hooks/data/useEsteira";
import { ESTEIRA_STAGES_TERMINAIS, esteiraStageLabel, type EstagioEsteira } from "@/lib/esteira-constants";
import { FATURAMENTO_FAIXAS } from "@/lib/lead-constants";
import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";
import { cn } from "@/lib/utils";

type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

interface Props {
  cliente: ClienteRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  intimacoesPendentes: number;
  onEdit: () => void;
  onDelete: () => void;
  onImportLaratex: () => void;
}

type Aba = "resumo" | "esteira" | "documentos" | "historico";

const FAIXA_LABEL: Record<string, string> = Object.fromEntries(
  FATURAMENTO_FAIXAS.map((f) => [f.value, f.label]),
);

const HISTORICO_DOT: Record<string, string> = {
  compensacao_adicionada: "bg-emerald-500",
  compensacao_editada: "bg-sky-500",
  status_mudado: "bg-amber-500",
  comunicado_enviado: "bg-blue-500",
};

function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

function InfoItem({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("min-w-0", full && "sm:col-span-2")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">{label}</p>
      <div className="mt-0.5 break-words text-sm text-foreground">{children}</div>
    </div>
  );
}

const VAZIO = <span className="text-muted-foreground">—</span>;

/**
 * Painel lateral "Dados do cliente": ficha resumida, posição na esteira e
 * histórico, em abas. O motivo da parada só aparece na aba Esteira e só
 * quando o cliente estourou o SLA da etapa (ou já tem motivo gravado) —
 * cliente convertido em dia não é lead perdido, então não vê esse campo.
 */
export function ClienteDadosDrawer({
  cliente,
  open,
  onOpenChange,
  canEdit,
  intimacoesPendentes,
  onEdit,
  onDelete,
  onImportLaratex,
}: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("resumo");
  // Histórico faz duas consultas; só vale a pena quando a aba abre.
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const esteiraQ = useEsteiraCliente(cliente.id);
  const slaConfigQ = useEsteiraSlaConfig();
  const historicoQ = useClienteHistorico(cliente.id, historicoAberto);
  const updateMotivoParada = useUpdateClienteMotivoParada();

  // --- Observações (autosave com debounce) ---
  const [obs, setObs] = useState(cliente.observacoes ?? "");
  const [obsSaved, setObsSaved] = useState(false);
  const obsDebounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setObs(cliente.observacoes ?? "");
  }, [cliente.id, cliente.observacoes]);
  useEffect(() => () => clearTimeout(obsDebounce.current), []);

  const handleObsChange = (value: string) => {
    setObs(value);
    setObsSaved(false);
    clearTimeout(obsDebounce.current);
    obsDebounce.current = setTimeout(async () => {
      const { error } = await supabase
        .from("clientes")
        .update({ observacoes: value, atualizado_em: new Date().toISOString() })
        .eq("id", cliente.id);
      if (error) return;
      qc.setQueryData<ClienteRow | undefined>(["cliente", cliente.id, "record"], (prev) =>
        prev ? { ...prev, observacoes: value } : prev,
      );
      setObsSaved(true);
      setTimeout(() => setObsSaved(false), 2000);
    }, 800);
  };

  // --- Motivo da parada ---
  const [motivoParada, setMotivoParada] = useState(cliente.motivo_parada ?? "");
  useEffect(() => {
    setMotivoParada(cliente.motivo_parada ?? "");
  }, [cliente.id, cliente.motivo_parada]);

  const handleMotivoParadaSave = async () => {
    const normalized = motivoParada.trim() || null;
    try {
      const saved = await updateMotivoParada.mutateAsync({ clienteId: cliente.id, motivoParada: normalized });
      setMotivoParada(saved ?? "");
      qc.setQueryData<ClienteRow | undefined>(["cliente", cliente.id, "record"], (prev) =>
        prev ? { ...prev, motivo_parada: saved } : prev,
      );
      void qc.invalidateQueries({ queryKey: ["esteira", "cliente", cliente.id] });
    } catch {
      // O hook apresenta o erro e mantém o texto para nova tentativa.
    }
  };

  // --- Esteira ---
  const esteira = esteiraQ.data ?? null;
  const estagio = (esteira?.estagio_esteira ?? cliente.estagio_esteira) as EstagioEsteira;
  const etapaLabel = useMemo(() => {
    const m = new Map((slaConfigQ.data ?? []).map((r) => [r.estagio as string, r.label]));
    return m.get(estagio) ?? esteiraStageLabel(estagio);
  }, [slaConfigQ.data, estagio]);
  const etapaTerminal = ESTEIRA_STAGES_TERMINAIS.includes(estagio);
  const atrasado = !etapaTerminal && !!esteira?.atrasado;
  const diasNaEtapa = esteira?.dias_na_etapa ?? diasDesde(cliente.data_entrada_estagio);
  const slaDias = esteira?.sla_dias ?? null;
  const mostrarMotivoParada = !etapaTerminal && (atrasado || !!cliente.motivo_parada?.trim());

  const whatsappDigits = cliente.whatsapp?.replace(/\D/g, "") ?? "";
  const whatsappLink = whatsappDigits ? `https://wa.me/55${whatsappDigits}` : null;
  const cadastradoEm = cliente.criado_em ? new Date(cliente.criado_em).toLocaleDateString("pt-BR") : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:w-[560px] sm:max-w-[560px]">
        <SheetHeader className="space-y-2 border-b px-6 py-4 pr-12 text-left">
          <SheetTitle className="text-base leading-tight">{cliente.empresa}</SheetTitle>
          <SheetDescription className="text-xs">
            CNPJ {cliente.cnpj}
            {cadastradoEm ? ` · cliente desde ${cadastradoEm}` : ""}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{etapaLabel}</Badge>
            {atrasado && (
              <Badge variant="outline" className="border-dash-red/30 bg-dash-red/5 text-[10px] text-dash-red">
                <AlertTriangle className="mr-1 h-3 w-3" /> SLA estourado
              </Badge>
            )}
            {cliente.lead_id && (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800">
                Convertido de lead
              </Badge>
            )}
            {intimacoesPendentes > 0 && (
              <Link to="/intimacoes">
                <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-[10px] text-destructive hover:bg-destructive/10">
                  {intimacoesPendentes} {intimacoesPendentes === 1 ? "intimação pendente" : "intimações pendentes"}
                </Badge>
              </Link>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-1.5 border-b px-6 py-3">
          {canEdit && (
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" className="w-full gap-1" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            </div>
          )}
          <div className={cn("grid gap-1.5", canEdit ? "grid-cols-3" : "grid-cols-2")}>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1 px-2 text-xs"
              aria-label="Mapa de Créditos"
              title="Mapa de Créditos"
              onClick={() => navigate(`/clientes/${cliente.id}/mapa-creditos`)}
            >
              <FileText className="h-3.5 w-3.5" /> Mapa
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1 px-2 text-xs"
              onClick={() => navigate(`/clientes/${cliente.id}/compensacoes`)}
            >
              <Receipt className="h-3.5 w-3.5" /> Compensações
            </Button>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1 px-2 text-xs"
                aria-label="Importar Laratex"
                title="Importar Laratex"
                onClick={onImportLaratex}
              >
                <Upload className="h-3.5 w-3.5" /> Laratex
              </Button>
            )}
          </div>
        </div>

        <Tabs
          value={aba}
          onValueChange={(v) => {
            setAba(v as Aba);
            if (v === "historico") setHistoricoAberto(true);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-6 pt-3">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="esteira" className="gap-1.5">
                Esteira
                {atrasado && <span className="h-1.5 w-1.5 rounded-full bg-dash-red" aria-hidden title="SLA estourado" />}
              </TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="resumo" className="mt-0 space-y-5">
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <InfoItem label="CNPJ">{cliente.cnpj || VAZIO}</InfoItem>
                <InfoItem label="Regime">{cliente.regime_tributario || VAZIO}</InfoItem>
                <InfoItem label="Segmento">
                  {SEGMENTO_LABELS[cliente.segmento ?? ""] || cliente.segmento || VAZIO}
                </InfoItem>
                <InfoItem label="Faturamento">
                  {cliente.faturamento_faixa
                    ? FAIXA_LABEL[cliente.faturamento_faixa] ?? cliente.faturamento_faixa
                    : VAZIO}
                </InfoItem>
                <InfoItem label="Contato">{cliente.nome_contato || VAZIO}</InfoItem>
                <InfoItem label="Telefone">
                  {whatsappLink ? (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-green-600 hover:underline"
                    >
                      {cliente.whatsapp} <MessageCircle className="h-3 w-3" />
                    </a>
                  ) : (
                    VAZIO
                  )}
                </InfoItem>
                <InfoItem label="E-mail">
                  {cliente.email ? (
                    <a
                      href={`mailto:${cliente.email}`}
                      className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline"
                    >
                      <span className="truncate">{cliente.email}</span> <Mail className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    VAZIO
                  )}
                </InfoItem>
                <InfoItem label="Região">{cliente.regiao || VAZIO}</InfoItem>
                <InfoItem label="Responsável">
                  {esteira?.responsavel_nome ? (
                    <ResponsavelAvatar nome={esteira.responsavel_nome} size="xs" comNome />
                  ) : (
                    VAZIO
                  )}
                </InfoItem>
                <InfoItem label="Origem">
                  {cliente.lead_id ? (
                    <Link to="/pipeline" className="inline-flex items-center gap-1 text-primary hover:underline">
                      Ver lead original <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    "Cadastro direto"
                  )}
                </InfoItem>
                {cliente.compensacao_outro_escritorio && (
                  <InfoItem label="Compensação em outro escritório" full>
                    {cliente.compensacao_outro_escritorio}
                  </InfoItem>
                )}
              </div>

              <div className="relative">
                <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Observações</p>
                <textarea
                  value={obs}
                  onChange={(e) => handleObsChange(e.target.value)}
                  disabled={!canEdit}
                  className="mt-1 min-h-[96px] w-full resize-y rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
                  placeholder="Observações internas sobre o cliente..."
                  aria-label="Observações"
                />
                <span
                  className={cn(
                    "absolute bottom-2 right-3 text-[10px] text-emerald-600 transition-opacity duration-300",
                    obsSaved ? "opacity-100" : "opacity-0",
                  )}
                >
                  Salvo ✓
                </span>
              </div>
            </TabsContent>

            <TabsContent value="esteira" className="mt-0 space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="card-base px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Etapa atual</p>
                  <p className="mt-1 text-sm font-semibold leading-tight">{etapaLabel}</p>
                </div>
                <div className="card-base px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Na etapa há</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-ink-35" />
                    {diasNaEtapa != null ? `${diasNaEtapa}d` : "—"}
                  </p>
                </div>
                <div className={cn("card-base px-4 py-3", atrasado && "border-dash-red/30 bg-dash-red/5")}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Meta (SLA)</p>
                  <p className={cn("mt-1 text-sm font-semibold tabular-nums", atrasado && "text-dash-red")}>
                    {etapaTerminal
                      ? "Concluído"
                      : slaDias != null
                        ? atrasado
                          ? `${slaDias}d · +${Math.max(0, (diasNaEtapa ?? 0) - slaDias)}`
                          : `${slaDias}d · no prazo`
                        : "Sem meta"}
                  </p>
                </div>
              </div>

              {mostrarMotivoParada && (
                <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                    <span className="text-xs font-semibold text-amber-900">Motivo da parada na esteira</span>
                  </div>
                  <textarea
                    value={motivoParada}
                    onChange={(e) => setMotivoParada(e.target.value)}
                    disabled={!canEdit}
                    className="min-h-[72px] w-full resize-y rounded-md border border-amber-200 bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
                    placeholder="Ex.: aguardando documentos do cliente"
                    aria-label="Motivo da parada"
                  />
                  <p className="text-[10px] leading-snug text-amber-800/80">
                    Aparece no card da esteira e no pulso semanal enquanto a etapa estiver fora do prazo.
                  </p>
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 w-full gap-1.5 text-xs"
                      disabled={
                        updateMotivoParada.isPending ||
                        (motivoParada.trim() || null) === (cliente.motivo_parada?.trim() || null)
                      }
                      onClick={handleMotivoParadaSave}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {updateMotivoParada.isPending ? "Salvando..." : "Salvar motivo"}
                    </Button>
                  )}
                </div>
              )}

              <EsteiraTimeline clienteId={cliente.id} />
            </TabsContent>

            <TabsContent value="documentos" className="mt-0">
              <ClienteDocumentosPanel clienteId={cliente.id} editable={canEdit} compact />
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              {historicoQ.isPending ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 animate-pulse rounded-md bg-muted/50" />
                  ))}
                </div>
              ) : historicoQ.isError ? (
                <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
              ) : (historicoQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
              ) : (
                <ol className="space-y-2">
                  {(historicoQ.data ?? []).map((h) => (
                    <li key={h.id} className="flex items-start gap-2">
                      <div className="mt-1.5 flex flex-col items-center self-stretch">
                        <div className={cn("h-2 w-2 rounded-full", HISTORICO_DOT[h.tipo ?? ""] ?? "bg-muted-foreground")} />
                        <div className="w-px flex-1 bg-border" />
                      </div>
                      <div className="min-w-0 pb-2">
                        <p className="text-xs leading-snug text-foreground">{h.descricao}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {h.usuario_nome} ·{" "}
                          {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
