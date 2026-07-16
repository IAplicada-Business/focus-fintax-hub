import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ExternalLink,
  MessageCircle,
  Upload,
  Pencil,
  Trash2,
  AlertTriangle,
  FileText,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { ProcessosTesesTab } from "@/components/clientes/ProcessosTesesTab";
import { ClienteHeaderQuadrantes } from "@/components/clientes/ClienteHeaderQuadrantes";
import { CompensacoesTab } from "@/components/clientes/CompensacoesTab";
import { ResumoFinanceiroTab } from "@/components/clientes/ResumoFinanceiroTab";
import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertTitle,
} from "@/components/ui/alert-dialog";
import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";

export default function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole, permissions } = useAuth();
  const [cliente, setCliente] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [compensacoesTotal, setCompensacoesTotal] = useState(0);
  const [historico, setHistorico] = useState<any[]>([]);
  const obsDebounce = useRef<NodeJS.Timeout>();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [obsSaved, setObsSaved] = useState(false);

  const fetchHistorico = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("cliente_historico" as any)
      .select("*")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    const userIds = [...new Set((data || []).map((h: any) => h.usuario_id).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      profiles?.forEach((p) => {
        userMap[p.user_id] = p.full_name;
      });
    }

    const enriched = (data || []).map((h: any) => ({
      ...h,
      usuario_nome: h.usuario_id ? userMap[h.usuario_id] || "Usuário" : "Sistema",
    }));
    setHistorico(enriched);
  }, [id]);

  useEffect(() => {
    fetchHistorico();
  }, [fetchHistorico]);

  // Laratex CSV import state
  const [laratexOpen, setLatatexOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingCliente, setDeletingCliente] = useState(false);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
    tese: "",
    valor_credito: "",
    mes_referencia: "",
    valor_compensado: "",
  });
  const [importing, setImporting] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  const [activeTab, setActiveTab] = useState("processos");
  const [addTeseSignal, setAddTeseSignal] = useState(0);
  const [addTesePreset, setAddTesePreset] = useState<string | null>(null);
  const [headerReload, setHeaderReload] = useState(0);
  const [intimacoesPendentes, setIntimacoesPendentes] = useState(0);

  const requestAddTese = useCallback((teseCodigo?: string) => {
    setActiveTab("processos");
    setAddTesePreset(teseCodigo ?? null);
    setAddTeseSignal((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!cliente?.empresa || !id) return;
    supabase
      .from("intimacoes")
      .select("id, status")
      .or(`cliente_id.eq.${id},empresa_nome.ilike.${cliente.empresa}`)
      .then(({ data }) => {
        const pendentes = (data || []).filter((i: any) =>
          ["pendente", "informado_aline", "em_andamento"].includes(i.status),
        ).length;
        setIntimacoesPendentes(pendentes);
      });
  }, [id, cliente?.empresa]);

  useEffect(() => {
    if (userRole === "comercial") {
      toast.error("Acesso restrito");
      navigate("/clientes");
      return;
    }
    if (!id) return;
    supabase
      .from("clientes")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          navigate("/clientes");
          return;
        }
        setCliente(data);
        setLoading(false);
      });
  }, [id, navigate, userRole]);

  const handleObsChange = (value: string) => {
    setCliente((prev: any) => ({ ...prev, observacoes: value }));
    setObsSaved(false);
    if (obsDebounce.current) clearTimeout(obsDebounce.current);
    obsDebounce.current = setTimeout(async () => {
      const { error } = await supabase
        .from("clientes")
        .update({ observacoes: value, atualizado_em: new Date().toISOString() } as any)
        .eq("id", id!);
      if (!error) {
        setObsSaved(true);
        setTimeout(() => setObsSaved(false), 2000);
      }
    }, 800);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error("CSV vazio ou inválido");
        return;
      }
      const sep = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
      setCsvHeaders(headers);
      setCsvData(rows);
      setColumnMap({ tese: "", valor_credito: "", mes_referencia: "", valor_compensado: "" });
    };
    reader.readAsText(file, "utf-8");
  };

  const parseCurrency = (v: string) => {
    if (!v) return 0;
    return Number(v.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
  };

  const handleImport = async () => {
    if (!columnMap.tese) {
      toast.error("Mapeie ao menos a coluna Tese");
      return;
    }
    setImporting(true);
    try {
      const teseIdx = csvHeaders.indexOf(columnMap.tese);
      const creditoIdx = columnMap.valor_credito ? csvHeaders.indexOf(columnMap.valor_credito) : -1;
      const mesIdx = columnMap.mes_referencia ? csvHeaders.indexOf(columnMap.mes_referencia) : -1;
      const compIdx = columnMap.valor_compensado ? csvHeaders.indexOf(columnMap.valor_compensado) : -1;

      const teseMap: Record<string, number> = {};
      csvData.forEach((row) => {
        const tese = row[teseIdx]?.trim();
        if (!tese) return;
        const val = creditoIdx >= 0 ? parseCurrency(row[creditoIdx]) : 0;
        teseMap[tese] = (teseMap[tese] || 0) + val;
      });

      const processoInserts = Object.entries(teseMap).map(([tese, total]) => ({
        cliente_id: id!,
        tese: tese.toLowerCase().replace(/\s+/g, "_"),
        nome_exibicao: tese,
        valor_credito: total,
        status_contrato: "assinado" as const,
      }));

      const { data: insertedProcessos, error: pErr } = await supabase
        .from("processos_teses")
        .insert(processoInserts)
        .select("id, nome_exibicao");

      if (pErr) throw pErr;

      if (mesIdx >= 0 && compIdx >= 0 && insertedProcessos) {
        const processoIdMap: Record<string, string> = {};
        insertedProcessos.forEach((p) => {
          processoIdMap[p.nome_exibicao] = p.id;
        });

        const compInserts = csvData
          .filter((row) => row[teseIdx]?.trim() && row[mesIdx]?.trim() && parseCurrency(row[compIdx]) > 0)
          .map((row) => {
            const tese = row[teseIdx].trim();
            const processoId = processoIdMap[tese];
            if (!processoId) return null;
            let mesRef = row[mesIdx].trim();
            if (/^\d{2}\/\d{4}$/.test(mesRef)) mesRef = `${mesRef.slice(3)}-${mesRef.slice(0, 2)}-01`;
            else if (/^\d{2}\/\d{2}\/\d{4}$/.test(mesRef))
              mesRef = `${mesRef.slice(6)}-${mesRef.slice(3, 5)}-01`;
            return {
              cliente_id: id!,
              processo_tese_id: processoId,
              mes_referencia: mesRef,
              valor_compensado: parseCurrency(row[compIdx]),
            };
          })
          .filter(Boolean);

        if (compInserts.length > 0) {
          const { error: cErr } = await supabase.from("compensacoes_mensais").insert(compInserts as any);
          if (cErr) throw cErr;
        }
        toast.success(`Importados: ${processoInserts.length} processos, ${compInserts.length} compensações`);
      } else {
        toast.success(`Importados: ${processoInserts.length} processos`);
      }

      setLatatexOpen(false);
      setCsvData([]);
      setCsvHeaders([]);
      fetchHistorico();
      setTabKey((k) => k + 1);
      setCliente((prev: any) => ({ ...prev, atualizado_em: new Date().toISOString() }));
    } catch (err: any) {
      toast.error("Erro na importação: " + (err.message || err));
    } finally {
      setImporting(false);
    }
  };

  if (loading || !cliente) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-md" />
          <div className="h-9 w-36 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <div className="h-10 w-64 bg-muted animate-pulse rounded-md" />
          <div className="h-64 w-full bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  const whatsappLink = cliente.whatsapp
    ? `https://wa.me/55${cliente.whatsapp.replace(/\D/g, "")}`
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar — full-width workspace */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/clientes")} className="flex-shrink-0">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          <div className="hidden h-5 w-px bg-border sm:block" />
          <h1 className="truncate text-base font-bold sm:text-lg">{cliente.empresa}</h1>
        </div>
        <Button
          variant={drawerOpen ? "secondary" : "outline"}
          size="sm"
          className="flex-shrink-0 gap-2"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {drawerOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Dados do cliente</span>
        </Button>
      </div>

      {/* Main — uses full width */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {id && (
          <ClienteHeaderQuadrantes
            key={headerReload}
            clienteId={id}
            onAddTese={requestAddTese}
          />
        )}
        {(() => {
          // Quem já entrou em /clientes/:id sempre vê as 3 abas operacionais.
          // Filtrar por filhos (clientes.processos etc.) escondia "Processos por Tese"
          // quando user_permissions tinha o filho desligado sem querer.
          const canParent = (() => {
            const p = permissions.find((pp) => pp.screen_key === "clientes");
            return !p || p.can_access;
          })();
          if (!canParent) {
            return <p className="text-sm text-muted-foreground">Sem permissão para ver abas do cliente.</p>;
          }
          const tabs = [
            { value: "processos", label: "Processos por Tese" },
            { value: "compensacoes", label: "Compensações" },
            { value: "resumo", label: "Resumo Financeiro" },
          ];
          return (
            <Tabs key={tabKey} value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                {tabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="processos">
                <ProcessosTesesTab
                  clienteId={id!}
                  compensacoesTotal={compensacoesTotal}
                  addTeseSignal={addTeseSignal}
                  presetTese={addTesePreset}
                  onProcessosChanged={() => setHeaderReload((n) => n + 1)}
                />
              </TabsContent>
              <TabsContent value="compensacoes">
                <CompensacoesTab
                  clienteId={id!}
                  cliente={cliente}
                  onTotalChange={setCompensacoesTotal}
                />
              </TabsContent>
              <TabsContent value="resumo">
                <ResumoFinanceiroTab clienteId={id!} cliente={cliente} />
              </TabsContent>
            </Tabs>
          );
        })()}
      </div>

      {/* Dados do cliente — drawer à direita */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[340px] p-0 sm:max-w-[380px]">
          <SheetHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
            <SheetTitle className="text-base leading-tight">{cliente.empresa}</SheetTitle>
            <SheetDescription className="text-xs">Dados cadastrais, ações e histórico</SheetDescription>
          </SheetHeader>

          <div className="h-[calc(100vh-5.5rem)] space-y-4 overflow-y-auto p-5">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => setLatatexOpen(true)}
            >
              <Upload className="h-4 w-4" /> Importar dados Laratex
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => navigate(`/clientes/${id}/mapa-creditos`)}
            >
              <FileText className="h-4 w-4" /> Mapa de Créditos
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => navigate(`/clientes/${id}/compensacoes`)}
            >
              <FileText className="h-4 w-4" /> Compensações (tabela linear)
            </Button>

            {intimacoesPendentes > 0 && (
              <Link
                to="/intimacoes"
                className="flex items-center gap-2 rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 transition-colors hover:bg-destructive/10"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs font-semibold text-destructive">
                  {intimacoesPendentes}{" "}
                  {intimacoesPendentes === 1 ? "intimação pendente" : "intimações pendentes"}
                </span>
              </Link>
            )}

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">CNPJ:</span> {cliente.cnpj}
              </div>
              <div>
                <span className="text-muted-foreground">Regime:</span> {cliente.regime_tributario || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Segmento:</span>{" "}
                {SEGMENTO_LABELS[cliente.segmento] || cliente.segmento || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Responsável:</span> {cliente.nome_contato || "—"}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Telefone:</span>
                {whatsappLink ? (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-green-600 hover:underline"
                  >
                    {cliente.whatsapp} <MessageCircle className="h-3 w-3" />
                  </a>
                ) : (
                  "—"
                )}
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Comp. outro escritório:</span>
                <p className="text-xs">{cliente.compensacao_outro_escritorio || "—"}</p>
              </div>
              <div className="relative">
                <span className="text-muted-foreground text-xs">Observações:</span>
                <textarea
                  value={cliente.observacoes || ""}
                  onChange={(e) => handleObsChange(e.target.value)}
                  className="mt-1 min-h-[80px] w-full resize-none rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Observações internas sobre o cliente..."
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
              <div>
                <span className="text-muted-foreground text-xs">Cadastrado em:</span>
                <p className="text-xs">{new Date(cliente.criado_em).toLocaleDateString("pt-BR")}</p>
              </div>
              {cliente.lead_id && (
                <Link to="/pipeline" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Ver lead original <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            {historico.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Histórico
                </h3>
                <ScrollArea className={historico.length > 5 ? "h-[200px]" : ""}>
                  <div className="space-y-2">
                    {historico.map((h: any) => {
                      const dotColor =
                        h.tipo === "compensacao_adicionada"
                          ? "bg-emerald-500"
                          : h.tipo === "status_mudado"
                            ? "bg-amber-500"
                            : h.tipo === "comunicado_enviado"
                              ? "bg-blue-500"
                              : "bg-muted-foreground";
                      return (
                        <div key={h.id} className="flex items-start gap-2">
                          <div className="mt-1 flex flex-col items-center">
                            <div className={`h-2 w-2 rounded-full ${dotColor}`} />
                            <div className="h-full w-px bg-border" />
                          </div>
                          <div className="min-w-0 pb-2">
                            <p className="text-[11px] leading-tight text-foreground">{h.descricao}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {h.usuario_nome} ·{" "}
                              {formatDistanceToNow(new Date(h.created_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Laratex CSV Import Modal */}
      <Dialog
        open={laratexOpen}
        onOpenChange={(v) => {
          setLatatexOpen(v);
          if (!v) {
            setCsvData([]);
            setCsvHeaders([]);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-[700px] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Importação temporária de dados — aguardando integração direta com Laratex
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50">
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                Exporte os dados do cliente no Laratex em formato CSV e importe aqui.
              </p>
              <label className="cursor-pointer">
                <span className="text-sm text-primary hover:underline">Selecionar arquivo CSV</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
              </label>
            </div>

            {csvHeaders.length > 0 && (
              <>
                <div className="max-h-[200px] overflow-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvHeaders.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap text-xs">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.slice(0, 5).map((row, ri) => (
                        <TableRow key={ri}>
                          {row.map((cell, ci) => (
                            <TableCell key={ci} className="py-1 text-xs">
                              {cell}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  {csvData.length} linhas detectadas · Mostrando primeiras 5
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "tese", label: "Tese *" },
                    { key: "valor_credito", label: "Valor Crédito" },
                    { key: "mes_referencia", label: "Mês Referência" },
                    { key: "valor_compensado", label: "Valor Compensado" },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium">{label}</label>
                      <Select
                        value={columnMap[key]}
                        onValueChange={(v) =>
                          setColumnMap((prev) => ({ ...prev, [key]: v === "__ignore__" ? "" : v }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="— Ignorar —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore__">— Ignorar —</SelectItem>
                          {csvHeaders.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <Button onClick={handleImport} disabled={importing || !columnMap.tese} className="w-full">
                  {importing ? "Importando..." : "Confirmar importação"}
                </Button>
              </>
            )}

            <p className="text-center text-xs italic text-muted-foreground">
              Esta importação será substituída pela integração automática com Laratex quando disponível.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <ClienteFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => {
          supabase
            .from("clientes")
            .select("*")
            .eq("id", id!)
            .single()
            .then(({ data }) => {
              if (data) setCliente(data);
            });
        }}
        cliente={cliente}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertTitle>Excluir cliente</AlertTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{cliente.empresa}</strong>? Todos os processos e
              compensações associados serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCliente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingCliente}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setDeletingCliente(true);
                await supabase.from("compensacoes_mensais").delete().eq("cliente_id", id!);
                await supabase.from("processos_teses").delete().eq("cliente_id", id!);
                const { error } = await supabase.from("clientes").delete().eq("id", id!);
                setDeletingCliente(false);
                if (error) {
                  toast.error("Erro ao excluir cliente.");
                  return;
                }
                toast.success("Cliente excluído com sucesso!");
                navigate("/clientes");
              }}
            >
              {deletingCliente ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
