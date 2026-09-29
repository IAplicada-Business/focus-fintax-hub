import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, PanelRightOpen, PanelRightClose } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ProcessosTesesTab } from "@/components/clientes/ProcessosTesesTab";
import { ClienteHeaderQuadrantes } from "@/components/clientes/ClienteHeaderQuadrantes";
import { CompensacoesTab } from "@/components/clientes/CompensacoesTab";
import { ResumoFinanceiroTab } from "@/components/clientes/ResumoFinanceiroTab";
import { ClienteDadosDrawer } from "@/components/clientes/ClienteDadosDrawer";
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
import { isReportoProcesso, sumCompensadoCanonical } from "@/lib/clientes-constants";
import {
  clienteHistoricoKey,
  useClienteCompensacoes,
  useClienteProcessos,
  useClienteRecord,
  useTesesTributarias,
  invalidateClienteOperacional,
} from "@/hooks/data/useClienteOperacional";
import { podeEditarFichaCliente } from "@/lib/client-operation";

const INTIMACOES_PENDENTES = ["pendente", "informado_aline", "em_andamento"];

export default function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole, permissions } = useAuth();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const canEdit = podeEditarFichaCliente(userRole, permissions);

  // Mesmo cache que o cabeçalho de quadrantes usa — o cadastro vem uma vez só.
  const clienteQ = useClienteRecord(id);
  const cliente = clienteQ.data ?? null;

  useEffect(() => {
    if (clienteQ.isError) navigate("/clientes");
  }, [clienteQ.isError, navigate]);

  const { data: compensacoesCached = [] } = useClienteCompensacoes(id);
  const { data: processosCached = [] } = useClienteProcessos(id);
  const { data: tesesCached = [] } = useTesesTributarias();

  const compensacoesTotal = useMemo(() => {
    const reportoTeseIds = new Set(
      tesesCached.filter((t) => (t.codigo || "").toUpperCase() === "REPORTO").map((t) => t.id),
    );
    const reportoProcessoIds = new Set(
      processosCached
        .filter(isReportoProcesso)
        .map((p) => p.id),
    );
    return sumCompensadoCanonical(compensacoesCached as any[], { reportoTeseIds, reportoProcessoIds });
  }, [compensacoesCached, processosCached, tesesCached]);

  const invalidateHistorico = useCallback(() => {
    if (id) void queryClient.invalidateQueries({ queryKey: clienteHistoricoKey(id) });
  }, [id, queryClient]);

  const invalidateCadastro = useCallback(() => {
    if (!id) return;
    void queryClient.invalidateQueries({ queryKey: ["cliente", id, "record"] });
    void queryClient.invalidateQueries({ queryKey: ["esteira", "cliente", id] });
  }, [id, queryClient]);

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
  const [visitedTabs, setVisitedTabs] = useState({ processos: true, compensacoes: false, resumo: false });
  const [addTeseSignal, setAddTeseSignal] = useState(0);
  const [addTesePreset, setAddTesePreset] = useState<string | null>(null);

  const requestAddTese = useCallback((teseCodigo?: string) => {
    setActiveTab("processos");
    setVisitedTabs((v) => ({ ...v, processos: true }));
    setAddTesePreset(teseCodigo ?? null);
    setAddTeseSignal((n) => n + 1);
  }, []);

  const empresa = cliente?.empresa ?? null;
  const intimacoesQ = useQuery({
    queryKey: ["cliente", id, "intimacoes-pendentes", empresa],
    enabled: !!id && !!empresa,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("intimacoes")
        .select("id, status")
        .or(`cliente_id.eq.${id},empresa_nome.ilike.${empresa}`);
      return (data ?? []).filter((i) => INTIMACOES_PENDENTES.includes(i.status)).length;
    },
  });
  const intimacoesPendentes = intimacoesQ.data ?? 0;

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
      invalidateHistorico();
      if (id) void invalidateClienteOperacional(queryClient, id);
      setTabKey((k) => k + 1);
    } catch (err: any) {
      toast.error("Erro na importação: " + (err.message || err));
    } finally {
      setImporting(false);
    }
  };

  if (!cliente) {
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
            clienteId={id}
            onAddTese={canEdit ? requestAddTese : undefined}
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
            <Tabs
              key={tabKey}
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v);
                setVisitedTabs((prev) => ({ ...prev, [v]: true }));
              }}
            >
              <TabsList>
                {tabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="processos" forceMount className={activeTab !== "processos" ? "hidden" : undefined}>
                <ProcessosTesesTab
                  clienteId={id!}
                  compensacoesTotal={compensacoesTotal}
                  editable={canEdit}
                  addTeseSignal={addTeseSignal}
                  presetTese={addTesePreset}
                  onProcessosChanged={invalidateHistorico}
                />
              </TabsContent>
              {visitedTabs.compensacoes && (
                <TabsContent value="compensacoes" forceMount className={activeTab !== "compensacoes" ? "hidden" : undefined}>
                  <CompensacoesTab
                    clienteId={id!}
                    cliente={cliente}
                    onCompensacoesChanged={invalidateHistorico}
                  />
                </TabsContent>
              )}
              {visitedTabs.resumo && (
                <TabsContent value="resumo" forceMount className={activeTab !== "resumo" ? "hidden" : undefined}>
                  <ResumoFinanceiroTab clienteId={id!} cliente={cliente} />
                </TabsContent>
              )}
            </Tabs>
          );
        })()}
      </div>

      <ClienteDadosDrawer
        cliente={cliente}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        canEdit={canEdit}
        intimacoesPendentes={intimacoesPendentes}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onImportLaratex={() => setLatatexOpen(true)}
      />

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
        onSuccess={invalidateCadastro}
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
                void queryClient.invalidateQueries({ queryKey: ["clientes"] });
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
