import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, MessageCircle, Upload, Pencil, Trash2, Clock, AlertTriangle, FileText, Mail, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { toastError } from "@/lib/handle-error";
import { ProcessosTesesTab } from "@/components/clientes/ProcessosTesesTab";
import { CompensacoesTab } from "@/components/clientes/CompensacoesTab";
import { ResumoFinanceiroTab } from "@/components/clientes/ResumoFinanceiroTab";
import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertTitle } from "@/components/ui/alert-dialog";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      profiles?.forEach((p) => { userMap[p.user_id] = p.full_name; });
    }

    const enriched = (data || []).map((h: any) => ({
      ...h,
      usuario_nome: h.usuario_id ? (userMap[h.usuario_id] || "Usuário") : "Sistema",
    }));
    setHistorico(enriched);
  }, [id]);

  useEffect(() => { fetchHistorico(); }, [fetchHistorico]);

  // Laratex CSV import state
  const [laratexOpen, setLatatexOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingCliente, setDeletingCliente] = useState(false);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({ tese: "", valor_credito: "", mes_referencia: "", valor_compensado: "" });
  const [importing, setImporting] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  const [intimacoesPendentes, setIntimacoesPendentes] = useState(0);

  useEffect(() => {
    if (!cliente?.empresa || !id) return;
    supabase
      .from("intimacoes")
      .select("id, status")
      .or(`cliente_id.eq.${id},empresa_nome.ilike.${cliente.empresa}`)
      .then(({ data }) => {
        const pendentes = (data || []).filter((i: any) =>
          ["pendente", "informado_aline", "em_andamento"].includes(i.status)
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
    supabase.from("clientes").select("*").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) { navigate("/clientes"); return; }
      setCliente(data);
      setLoading(false);
    });
  }, [id, navigate, userRole]);

  const updateField = async (field: string, value: any) => {
    setCliente((prev: any) => ({ ...prev, [field]: value }));
    const updateData: Record<string, any> = { [field]: value, atualizado_em: new Date().toISOString() };
    const { error } = await supabase.from("clientes").update(updateData as any).eq("id", id!);
    if (error) toastError(error, "Erro ao atualizar campo");
  };

  const handleObsChange = (value: string) => {
    setCliente((prev: any) => ({ ...prev, observacoes: value }));
    setObsSaved(false);
    if (obsDebounce.current) clearTimeout(obsDebounce.current);
    obsDebounce.current = setTimeout(async () => {
      const { error } = await supabase.from("clientes").update({ observacoes: value, atualizado_em: new Date().toISOString() } as any).eq("id", id!);
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
      if (lines.length < 2) { toast.error("CSV vazio ou inválido"); return; }
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
    if (!columnMap.tese) { toast.error("Mapeie ao menos a coluna Tese"); return; }
    setImporting(true);
    try {
      const teseIdx = csvHeaders.indexOf(columnMap.tese);
      const creditoIdx = columnMap.valor_credito ? csvHeaders.indexOf(columnMap.valor_credito) : -1;
      const mesIdx = columnMap.mes_referencia ? csvHeaders.indexOf(columnMap.mes_referencia) : -1;
      const compIdx = columnMap.valor_compensado ? csvHeaders.indexOf(columnMap.valor_compensado) : -1;

      // Group by tese name, sum valor_credito
      const teseMap: Record<string, number> = {};
      csvData.forEach((row) => {
        const tese = row[teseIdx]?.trim();
        if (!tese) return;
        const val = creditoIdx >= 0 ? parseCurrency(row[creditoIdx]) : 0;
        teseMap[tese] = (teseMap[tese] || 0) + val;
      });

      // Insert processos_teses
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

      // Insert compensações if mapped
      if (mesIdx >= 0 && compIdx >= 0 && insertedProcessos) {
        const processoIdMap: Record<string, string> = {};
        insertedProcessos.forEach((p) => { processoIdMap[p.nome_exibicao] = p.id; });

        const compInserts = csvData
          .filter((row) => row[teseIdx]?.trim() && row[mesIdx]?.trim() && parseCurrency(row[compIdx]) > 0)
          .map((row) => {
            const tese = row[teseIdx].trim();
            const processoId = processoIdMap[tese];
            if (!processoId) return null;
            let mesRef = row[mesIdx].trim();
            // Try to parse date formats: dd/mm/yyyy, mm/yyyy, yyyy-mm-dd
            if (/^\d{2}\/\d{4}$/.test(mesRef)) mesRef = `${mesRef.slice(3)}-${mesRef.slice(0, 2)}-01`;
            else if (/^\d{2}\/\d{2}\/\d{4}$/.test(mesRef)) mesRef = `${mesRef.slice(6)}-${mesRef.slice(3, 5)}-01`;
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
      // Refresh data without full page reload
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
      <div className="flex h-full gap-0 min-h-0">
        <div className="w-[260px] border-r bg-muted/30 p-4 space-y-4">
          <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
          <div className="h-6 w-40 bg-muted animate-pulse rounded-md" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-4 w-full bg-muted animate-pulse rounded" />)}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
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
    <div className="flex h-full gap-0 min-h-0">
      {/* Sidebar — collapsible */}
      <div className={cn(
        "relative flex-shrink-0 transition-all duration-300 overflow-hidden border-r bg-muted/30",
        sidebarOpen ? "w-[260px]" : "w-[20px]"
      )}>
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute right-0 top-4 z-10 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center shadow-sm translate-x-1/2"
        >
          <ChevronRight className={cn("w-3 h-3 transition-transform", sidebarOpen && "rotate-180")} />
        </button>

        {sidebarOpen && (
      <div className="p-4 overflow-y-auto space-y-4 h-full">
        <Button variant="ghost" size="sm" onClick={() => navigate("/clientes")} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h2 className="text-lg font-bold leading-tight">{cliente.empresa}</h2>

        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive gap-1" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        </div>

        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => setLatatexOpen(true)}>
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

        {intimacoesPendentes > 0 && (
          <Link to="/intimacoes" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/15 hover:bg-destructive/10 transition-colors">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-xs font-semibold text-destructive">
              {intimacoesPendentes} {intimacoesPendentes === 1 ? "intimação pendente" : "intimações pendentes"}
            </span>
          </Link>
        )}

        <div className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">CNPJ:</span> {cliente.cnpj}</div>
          <div><span className="text-muted-foreground">Regime:</span> {cliente.regime_tributario || "—"}</div>
          <div><span className="text-muted-foreground">Segmento:</span> {SEGMENTO_LABELS[cliente.segmento] || cliente.segmento || "—"}</div>
          <div><span className="text-muted-foreground">Responsável:</span> {cliente.nome_contato || "—"}</div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Telefone:</span>
            {whatsappLink ? (
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline flex items-center gap-1">
                {cliente.whatsapp} <MessageCircle className="h-3 w-3" />
              </a>
            ) : "—"}
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
              className="w-full text-sm resize-none rounded-lg border border-border bg-background p-3 focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px] mt-1"
              placeholder="Observações internas sobre o cliente..."
            />
            <span className={cn(
              "absolute bottom-2 right-3 text-[10px] text-emerald-600 transition-opacity duration-300",
              obsSaved ? "opacity-100" : "opacity-0"
            )}>
              Salvo ✓
            </span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Cadastrado em:</span>
            <p className="text-xs">{new Date(cliente.criado_em).toLocaleDateString("pt-BR")}</p>
          </div>
          {cliente.lead_id && (
            <Link to={`/pipeline`} className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver lead original <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Histórico Timeline */}
        {historico.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico</h3>
            <ScrollArea className={historico.length > 5 ? "h-[200px]" : ""}>
              <div className="space-y-2">
                {historico.map((h: any) => {
                  const dotColor =
                    h.tipo === "compensacao_adicionada" ? "bg-emerald-500" :
                    h.tipo === "status_mudado" ? "bg-amber-500" :
                    h.tipo === "comunicado_enviado" ? "bg-blue-500" :
                    "bg-muted-foreground";
                  const Icon =
                    h.tipo === "comunicado_enviado" ? Mail :
                    h.tipo === "status_mudado" ? AlertTriangle :
                    h.tipo === "compensacao_adicionada" ? FileText :
                    Clock;
                  return (
                    <div key={h.id} className="flex gap-2 items-start">
                      <div className="flex flex-col items-center mt-1">
                        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
                        <div className="w-px h-full bg-border" />
                      </div>
                      <div className="min-w-0 pb-2">
                        <p className="text-[11px] leading-tight text-foreground">{h.descricao}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {h.usuario_nome} · {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: ptBR })}
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
        )}
      </div>

      {/* Main */}
      <div className="flex-1 p-6 overflow-y-auto">
        {(() => {
          const canTab = (key: string) => {
            const p = permissions.find((pp) => pp.screen_key === key);
            return !p || p.can_access;
          };
          const tabs = [
            { value: "processos", label: "Processos por Tese", key: "clientes.processos" },
            { value: "compensacoes", label: "Compensações", key: "clientes.compensacoes" },
            { value: "resumo", label: "Resumo Financeiro", key: "clientes.resumo" },
          ].filter((t) => canTab(t.key));
          if (tabs.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma aba disponível.</p>;
          const defaultVal = tabs[0].value;
          return (
            <Tabs key={tabKey} defaultValue={defaultVal}>
              <TabsList>
                {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
              </TabsList>
              {tabs.some((t) => t.value === "processos") && (
                <TabsContent value="processos"><ProcessosTesesTab clienteId={id!} compensacoesTotal={compensacoesTotal} /></TabsContent>
              )}
              {tabs.some((t) => t.value === "compensacoes") && (
                <TabsContent value="compensacoes"><CompensacoesTab clienteId={id!} cliente={cliente} onTotalChange={setCompensacoesTotal} /></TabsContent>
              )}
              {tabs.some((t) => t.value === "resumo") && (
                <TabsContent value="resumo"><ResumoFinanceiroTab clienteId={id!} cliente={cliente} /></TabsContent>
              )}
            </Tabs>
          );
        })()}
      </div>

      {/* Mapa Tributário Modal */}

      {/* Laratex CSV Import Modal */}
      <Dialog open={laratexOpen} onOpenChange={(v) => { setLatatexOpen(v); if (!v) { setCsvData([]); setCsvHeaders([]); } }}>
        <DialogContent className="max-w-[700px] max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Importação temporária de dados — aguardando integração direta com Laratex</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload area */}
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">Exporte os dados do cliente no Laratex em formato CSV e importe aqui.</p>
              <label className="cursor-pointer">
                <span className="text-sm text-primary hover:underline">Selecionar arquivo CSV</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
              </label>
            </div>

            {/* Preview */}
            {csvHeaders.length > 0 && (
              <>
                <div className="rounded border overflow-auto max-h-[200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvHeaders.map((h, i) => <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.slice(0, 5).map((row, ri) => (
                        <TableRow key={ri}>
                          {row.map((cell, ci) => <TableCell key={ci} className="text-xs py-1">{cell}</TableCell>)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">{csvData.length} linhas detectadas · Mostrando primeiras 5</p>

                {/* Column mapping */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "tese", label: "Tese *" },
                    { key: "valor_credito", label: "Valor Crédito" },
                    { key: "mes_referencia", label: "Mês Referência" },
                    { key: "valor_compensado", label: "Valor Compensado" },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium">{label}</label>
                      <Select value={columnMap[key]} onValueChange={(v) => setColumnMap((prev) => ({ ...prev, [key]: v === "__ignore__" ? "" : v }))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="— Ignorar —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore__">— Ignorar —</SelectItem>
                          {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
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

            <p className="text-xs text-muted-foreground italic text-center">
              Esta importação será substituída pela integração automática com Laratex quando disponível.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <ClienteFormModal open={editOpen} onOpenChange={setEditOpen} onSuccess={() => {
        supabase.from("clientes").select("*").eq("id", id!).single().then(({ data }) => { if (data) setCliente(data); });
      }} cliente={cliente} />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertTitle>Excluir cliente</AlertTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{cliente.empresa}</strong>? Todos os processos e compensações associados serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCliente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deletingCliente} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              setDeletingCliente(true);
              await supabase.from("compensacoes_mensais").delete().eq("cliente_id", id!);
              await supabase.from("processos_teses").delete().eq("cliente_id", id!);
              const { error } = await supabase.from("clientes").delete().eq("id", id!);
              setDeletingCliente(false);
              if (error) { toast.error("Erro ao excluir cliente."); return; }
              toast.success("Cliente excluído com sucesso!");
              navigate("/clientes");
            }}>{deletingCliente ? "Excluindo..." : "Excluir"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
