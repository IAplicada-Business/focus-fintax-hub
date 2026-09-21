import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  invalidateClienteOperacional,
  useClienteCreditos,
  useClienteProcessos,
  useMotorTesesAtivas,
  useTesesTributarias,
} from "@/hooks/data/useClienteOperacional";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronRight, Pencil, Plus, AlertTriangle, Trash2, Layers } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ProcessoFormModal } from "./ProcessoFormModal";
import {
  formatCurrencyBR,
  getStatusContratoConfig,
  getStatusProcessoConfig,
  isReportoProcesso,
  processoTeseCatalogCodigo,
} from "@/lib/clientes-constants";
import { deleteCreditoApuradoForProcesso } from "@/lib/sync-credito-apurado";
import { logClienteHistorico } from "@/lib/cliente-historico";
import {
  TIPO_RECUPERACAO_BADGE,
  TIPO_RECUPERACAO_LABEL,
  type TipoRecuperacao,
} from "@/lib/tipo-recuperacao";
import { totalProcessosACompensar } from "@/lib/client-operation";
import type { Database } from "@/integrations/supabase/types";

type ProcessoRow = Database["public"]["Tables"]["processos_teses"]["Row"];

interface Props {
  clienteId: string;
  compensacoesTotal: number;
  editable: boolean;
  /** Incrementar para abrir o modal de adicionar tese */
  addTeseSignal?: number;
  presetTese?: string | null;
  onProcessosChanged?: () => void;
}

export function ProcessosTesesTab({
  clienteId,
  compensacoesTotal,
  editable,
  addTeseSignal = 0,
  presetTese = null,
  onProcessosChanged,
}: Props) {
  const qc = useQueryClient();
  const processosQ = useClienteProcessos(clienteId);
  const motorQ = useMotorTesesAtivas();
  const creditosQ = useClienteCreditos(clienteId);
  const tesesQ = useTesesTributarias();
  const processosRemote = processosQ.data;
  const [processos, setProcessos] = useState<ProcessoRow[]>([]);
  const loading = processosQ.isPending && processosQ.data === undefined;
  const [modalOpen, setModalOpen] = useState(false);
  const [editProcesso, setEditProcesso] = useState<ProcessoRow | null>(null);
  const [modalPreset, setModalPreset] = useState<string | null>(null);
  const [selectedProcessoId, setSelectedProcessoId] = useState<string | null>(null);
  const opcoesTese = motorQ.data ?? [];
  const [lastSignal, setLastSignal] = useState(0);

  useEffect(() => {
    if (!processosRemote) return;
    setProcessos(processosRemote);
    setSelectedProcessoId((current) =>
      current && processosRemote.some((processo) => processo.id === current)
        ? current
        : processosRemote[0]?.id ?? null,
    );
  }, [processosRemote]);

  const refreshAll = async () => {
    await invalidateClienteOperacional(qc, clienteId);
    await qc.invalidateQueries({ queryKey: ["cliente", clienteId, "record"] });
    onProcessosChanged?.();
  };

  useEffect(() => {
    if (!addTeseSignal || addTeseSignal === lastSignal) return;
    setLastSignal(addTeseSignal);
    setEditProcesso(null);
    setModalPreset(presetTese);
    setModalOpen(true);
  }, [addTeseSignal, lastSignal, presetTese]);

  const openAdd = (teseCodigo?: string) => {
    setEditProcesso(null);
    setModalPreset(teseCodigo ?? null);
    setModalOpen(true);
  };

  const assinados = processos.filter((p) => p.status_contrato === "assinado");
  const totalCreditoAssinado = assinados.reduce((s, p) => s + Number(p.valor_credito || 0), 0);
  const totalHonorarios = assinados.reduce((s, p) => s + Number(p.valor_honorario || 0), 0);
  const totalACompensar = totalProcessosACompensar(processos);

  // Por que a tese não mexe nos cards do cabeçalho: sem crédito apurado ou
  // com o checkbox do Mapa de Créditos desmarcado (caso ICMS-ST da São Fernando).
  const calculoPorCodigo = useMemo(() => {
    const creditos = creditosQ.data ?? [];
    const teses = tesesQ.data ?? [];
    const codigoByTeseId = new Map(
      teses.map((t) => [t.id, String(t.codigo || "").toUpperCase()]),
    );
    const hasFlag = creditos.some(
      (c) => c.incluir_no_calculo === true || c.incluir_no_calculo === false,
    );
    const map = new Map<string, boolean>();
    for (const c of creditos) {
      const codigo = codigoByTeseId.get(c.tese_id);
      if (!codigo) continue;
      map.set(codigo, !hasFlag || c.incluir_no_calculo === true);
    }
    return map;
  }, [creditosQ.data, tesesQ.data]);

  const now = Date.now();
  const alertAguardando = processos.filter(
    (p) =>
      p.status_contrato === "aguardando_assinatura" &&
      !!p.criado_em &&
      now - new Date(p.criado_em).getTime() > 7 * 86400000,
  );
  const existingCodes = processos.map((p) => p.tese);
  const tesesDisponiveis = opcoesTese.filter((t) => !existingCodes.includes(t.tese));
  const processoSelecionado =
    processos.find((processo) => processo.id === selectedProcessoId) ??
    processos[0] ??
    null;

  const handleDelete = async (processo: ProcessoRow) => {
    const { error } = await supabase
      .from("processos_teses")
      .delete()
      .eq("id", processo.id);
    if (error) {
      toast.error("Erro ao excluir.");
      return;
    }
    try {
      await deleteCreditoApuradoForProcesso({
        clienteId,
        tese: processo.tese,
        nomeExibicao: processo.nome_exibicao,
      });
    } catch {
      // Processo já removido; o refetch mostra o card sem essa tese.
    }
    toast.success("Tese excluída.");
    void logClienteHistorico(
      clienteId,
      "processo_removido",
      `Tese removida: ${processo.nome_exibicao}`,
    );
    setSelectedProcessoId(null);
    await refreshAll();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Possíveis créditos</p>
            <p className="text-lg font-bold">{formatCurrencyBR(totalCreditoAssinado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Honorários</p>
            <p className="text-lg font-bold">{formatCurrencyBR(totalHonorarios)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">A Compensar</p>
            <p className="text-lg font-bold">{formatCurrencyBR(totalACompensar)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Já Compensado</p>
            <p className="text-lg font-bold">{formatCurrencyBR(compensacoesTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {alertAguardando.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4" />
          {alertAguardando.length} processo(s) aguardando assinatura há mais de 7 dias.
        </div>
      )}
      {!loading && processos.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold">Nenhuma tese cadastrada</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Escolha uma tese abaixo para começar o processo deste cliente. Você pode ajustar valor,
            contrato e honorários depois.
          </p>
          {editable && tesesDisponiveis.length > 0 ? (
            <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
              {tesesDisponiveis.map((t) => (
                <Button
                  key={t.tese}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => openAdd(t.tese)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t.nome_exibicao}
                </Button>
              ))}
            </div>
          ) : editable ? (
            <Button type="button" size="sm" className="mt-5" onClick={() => openAdd()}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar tese
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {editable && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => openAdd()}
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar tese
              </Button>
            </div>
          )}
          {loading ? (
            <div className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[minmax(230px,0.75fr)_minmax(0,1.7fr)]">
              <div
                role="tablist"
                aria-label="Teses do cliente"
                className="space-y-1.5 rounded-xl border bg-muted/15 p-2"
              >
                {processos.map((processo) => {
                  const active = processo.id === processoSelecionado?.id;
                  const status = getStatusProcessoConfig(processo.status_processo);
                  return (
                    <button
                      key={processo.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedProcessoId(processo.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-primary/30 bg-background shadow-sm"
                          : "border-transparent hover:border-border hover:bg-background/70"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{processo.nome_exibicao}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {status.label} · {formatCurrencyBR(Number(processo.valor_credito || 0))}
                        </p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                  );
                })}
              </div>

              {processoSelecionado && (
                <TeseDetailCard
                  processo={processoSelecionado}
                  noCalculo={calculoPorCodigo.get(
                    String(processoTeseCatalogCodigo(processoSelecionado) || ""),
                  )}
                  editable={editable}
                  onEdit={() => {
                    setEditProcesso(processoSelecionado);
                    setModalPreset(null);
                    setModalOpen(true);
                  }}
                  onDelete={() => void handleDelete(processoSelecionado)}
                />
              )}
            </div>
          )}
        </>
      )}

      <ProcessoFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        clienteId={clienteId}
        existingTeses={existingCodes}
        processo={editProcesso}
        presetTese={modalPreset}
        onSuccess={refreshAll}
        editable={editable}
      />
    </div>
  );
}

export function TeseDetailCard({
  processo,
  noCalculo,
  editable,
  onEdit,
  onDelete,
}: {
  processo: ProcessoRow;
  noCalculo: boolean | undefined;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const contrato = getStatusContratoConfig(processo.status_contrato);
  const etapa = getStatusProcessoConfig(processo.status_processo);
  const tipo = processo.tipo_recuperacao as TipoRecuperacao;
  const reporto = isReportoProcesso(processo);
  const percentual = Number(processo.percentual_honorario || 0);
  const percentualLabel = percentual <= 1 ? percentual * 100 : percentual;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/15 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-muted-foreground">
              Tese selecionada
            </p>
            <h3 className="mt-1 text-base font-semibold leading-tight">{processo.nome_exibicao}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tipo && TIPO_RECUPERACAO_LABEL[tipo] && (
                <Badge variant="outline" className={TIPO_RECUPERACAO_BADGE[tipo]}>
                  {TIPO_RECUPERACAO_LABEL[tipo]}
                </Badge>
              )}
              {reporto ? (
                <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
                  Possíveis futuros
                </Badge>
              ) : noCalculo === true ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  Incluída no cálculo
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  {noCalculo === false ? "Fora do cálculo" : "Fora do Mapa de Créditos"}
                </Badge>
              )}
            </div>
          </div>
          {editable && (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
                Editar tese
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label="Excluir tese"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. A tese{" "}
                      <strong>{processo.nome_exibicao}</strong> será removida permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-[#c8001e] text-white hover:bg-[#a30019]"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        <div className="grid gap-4 px-5 sm:grid-cols-2">
          <DetailSection title="Situação da tese">
            <DetailRow label="Contrato">
              <Badge variant="outline" className={contrato.color}>{contrato.label}</Badge>
            </DetailRow>
            <DetailRow label="Etapa">
              <Badge variant="outline" className={etapa.color}>{etapa.label}</Badge>
            </DetailRow>
          </DetailSection>

          <DetailSection title="Financeiro">
            <DetailRow label="Crédito" value={formatCurrencyBR(Number(processo.valor_credito || 0))} />
            <DetailRow label="Honorário" value={`${percentualLabel.toFixed(2).replace(".", ",")}%`} />
            <DetailRow label="Valor honorário" value={formatCurrencyBR(Number(processo.valor_honorario || 0))} />
          </DetailSection>
        </div>

        <div className="border-t px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-muted-foreground">Observação</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {processo.observacao || "Nenhuma observação registrada."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.8px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {title}
      </p>
      <div className="space-y-2 rounded-lg border p-3">{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children ?? <span className="text-right text-sm font-medium">{value || "—"}</span>}
    </div>
  );
}
