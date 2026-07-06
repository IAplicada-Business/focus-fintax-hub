import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, AlertTriangle, AlertOctagon, FileText, Printer, Pencil, Trash2, Upload, Download, ChevronDown, Building2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import { ImportCompensacoesModal } from "@/components/clientes/ImportCompensacoesModal";
import { ImportControleModal } from "@/components/clientes/ImportControleModal";
import { ImportFluxoCaixaModal } from "@/components/clientes/ImportFluxoCaixaModal";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useClientes, useProcessosTeses, useCompensacoesMensais, useDeleteCliente } from "@/hooks/data/useClientes";
import { useQueryClient } from "@tanstack/react-query";

export default function ClientesList() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isComercial = userRole === "comercial";
  const queryClient = useQueryClient();

  const { data: clientes = [], isLoading: loadingClientes } = useClientes();
  const { data: processos = [], isLoading: loadingProcessos } = useProcessosTeses();
  const { data: compensacoes = [], isLoading: loadingComp } = useCompensacoesMensais();
  const deleteMutation = useDeleteCliente();
  const loading = loadingClientes || loadingProcessos || loadingComp;

  const fetchAll = () => queryClient.invalidateQueries({ queryKey: ["clientes"] });

  const [modalOpen, setModalOpen] = useState(false);
  const [editCliente, setEditCliente] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importControleOpen, setImportControleOpen] = useState(false);
  const [importFluxoOpen, setImportFluxoOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSegmento, setFilterSegmento] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  const getClienteStats = (clienteId: string) => {
    const cp = processos.filter((p) => p.cliente_id === clienteId);
    const assinados = cp.filter((p) => p.status_contrato === "assinado");
    const totalCredito = assinados.reduce((s, p) => s + Number(p.valor_credito || 0), 0);
    const totalCompensado = compensacoes
      .filter((c) => c.cliente_id === clienteId)
      .reduce((s, c) => s + Number(c.valor_compensado || 0), 0);

    const now = Date.now();
    const hasAlertAguardando = cp.some(
      (p) => p.status_contrato === "aguardando_assinatura" && (now - new Date(p.criado_em).getTime()) > 7 * 86400000
    );
    const hasAlertNaoProtocolado = cp.some(
      (p) => p.status_processo === "nao_protocolado" && (now - new Date(p.atualizado_em).getTime()) > 15 * 86400000
    );

    return { tesesAtivas: assinados.length, totalCredito, totalCompensado, saldo: totalCredito - totalCompensado, hasAlertAguardando, hasAlertNaoProtocolado };
  };

  // Global stats
  const allStats = clientes.map((c) => ({ ...c, ...getClienteStats(c.id) }));
  const totalClientes = clientes.length;
  const totalCompensando = allStats.filter((c) => c.totalCompensado > 0).length;
  const globalCredito = allStats.reduce((s, c) => s + c.totalCredito, 0);
  const globalCompensado = allStats.reduce((s, c) => s + c.totalCompensado, 0);

  // Filtering
  let filtered = allStats;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((c) => c.empresa?.toLowerCase().includes(q) || c.cnpj?.includes(q));
  }
  if (filterSegmento !== "all") filtered = filtered.filter((c) => c.segmento === filterSegmento);
  if (filterStatus === "compensando") filtered = filtered.filter((c) => c.totalCompensado > 0);
  else if (filterStatus !== "all") filtered = filtered.filter((c) => c.status === filterStatus);

  // Reset page on filter change
  useEffect(() => setCurrentPage(1), [search, filterSegmento, filterStatus]);

  // Pagination
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filtered, currentPage]
  );

  // Report data
  const reportClientes = [...allStats].sort((a, b) => b.totalCredito - a.totalCredito);
  const reportDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  // Breakdown por tese
  const teseBreakdown = (() => {
    const assinados = processos.filter((p) => p.status_contrato === "assinado");
    const map: Record<string, { nome: string; clientes: Set<string>; identificado: number; compensado: number }> = {};
    assinados.forEach((p) => {
      const key = p.tese || p.nome_exibicao;
      if (!map[key]) map[key] = { nome: p.nome_exibicao || p.tese, clientes: new Set(), identificado: 0, compensado: 0 };
      map[key].clientes.add(p.cliente_id);
      map[key].identificado += Number(p.valor_credito || 0);
      map[key].compensado += compensacoes
        .filter((c) => c.processo_tese_id === p.id)
        .reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
    });
    return Object.values(map).sort((a, b) => b.identificado - a.identificado);
  })();

  const getClienteHealth = (c: any) => {
    if (c.saldo <= 0) return 'amarelo';
    if (c.totalCredito > 0 && (c.totalCompensado / c.totalCredito) < 0.05) return 'vermelho';
    return 'verde';
  };

  const exportClientesSimples = () => {
    const rows = filtered.map((c) => ({
      'Empresa': c.empresa,
      'CNPJ': c.cnpj ?? '',
      'Segmento': SEGMENTO_LABELS[c.segmento] || c.segmento || '',
      'Regime': c.regime_tributario ?? '',
      'Status': c.compensando_fintax ? 'Compensando' : 'Contrato',
      'Crédito Identificado (R$)': c.totalCredito ?? 0,
      'Total Compensado (R$)': c.totalCompensado ?? 0,
      'Saldo Restante (R$)': Math.max(0, (c.totalCredito ?? 0) - (c.totalCompensado ?? 0)),
      '% Utilizado': c.totalCredito > 0
        ? `${Math.round((c.totalCompensado / c.totalCredito) * 100)}%`
        : '0%',
      'Saúde': getClienteHealth(c) === 'verde' ? 'Ativo' : getClienteHealth(c) === 'amarelo' ? 'Saldo Zerado' : 'Inativo',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 35 }, { wch: 20 }, { wch: 16 }, { wch: 14 },
      { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, `FocusFinTax_Clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportClientesPorTese = async () => {
    const { data: processosData } = await supabase
      .from('processos_teses')
      .select('*, clientes(empresa, cnpj, segmento)')
      .order('criado_em', { ascending: false });

    const rows = (processosData || []).map((p: any) => ({
      'Empresa': p.clientes?.empresa ?? '',
      'CNPJ': p.clientes?.cnpj ?? '',
      'Segmento': p.clientes?.segmento ?? '',
      'Tese': p.nome_exibicao ?? '',
      'Status Contrato': p.status_contrato ?? '',
      'Status Processo': p.status_processo ?? '',
      'Crédito Identificado (R$)': p.valor_credito ?? 0,
      'Honorários (%)': p.percentual_honorario ? `${(p.percentual_honorario * 100).toFixed(1)}%` : '',
      'Valor Honorários (R$)': p.valor_honorario ?? 0,
      'Observação': p.observacao ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 35 }, { wch: 20 }, { wch: 16 }, { wch: 40 },
      { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 30 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Processos por Tese');
    XLSX.writeFile(wb, `FocusFinTax_Teses_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-navy">Clientes Ativos</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">carteira de clientes e compensações</p>
        </div>
        <div className="flex gap-2">
          {!isComercial && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-1" /> Importar XLSX
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setImportControleOpen(true)}>
                  Cadastro + créditos (aba Controle)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportFluxoOpen(true)}>
                  Fluxo de caixa (compensações por tributo + DCOMPs)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  Compensações mensais (legado)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isComercial && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setReportOpen(true)}>
                  <FileText className="w-4 h-4 mr-2" />
                  Relatório da Carteira
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportClientesSimples}>
                  Visão geral (por cliente)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportClientesPorTese}>
                  Detalhado por tese
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isComercial && (
            <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4 mr-1" /> Cadastrar cliente</Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="animate-slide-up delay-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Total de clientes</p>
          <p className="font-display text-[28px] font-bold leading-none text-navy">{totalClientes}</p>
          <p className="text-[11px] text-ink-35 mt-1">na carteira</p>
        </div>
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Compensando ativamente</p>
          <p className="font-display text-[28px] font-bold leading-none text-dash-green">{totalCompensando}</p>
          <p className="text-[11px] text-ink-35 mt-1">com dados reais</p>
        </div>
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Total compensado</p>
          <p className="font-display text-[28px] font-bold leading-none text-dash-green">{formatCurrencyBR(globalCompensado)}</p>
          <p className="text-[11px] text-ink-35 mt-1">acumulado carteira</p>
        </div>
        <div className="card-base p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">Saldo a compensar</p>
          <p className="font-display text-[28px] font-bold leading-none text-dash-red">{formatCurrencyBR(Math.max(0, globalCredito - globalCompensado))}</p>
          <p className="text-[11px] text-ink-35 mt-1">potencial restante</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Buscar por nome ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <Select value={filterSegmento} onValueChange={setFilterSegmento}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Segmento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(SEGMENTO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="compensando">Compensando</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="encerrado">Encerrado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
      <Table>
         <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Segmento</TableHead>
            <TableHead>Teses</TableHead>
            <TableHead>Crédito</TableHead>
            <TableHead>Compensado</TableHead>
            <TableHead>Saldo</TableHead>
            <TableHead>Saúde</TableHead>
            <TableHead>Alerta</TableHead>
            {!isComercial && <TableHead className="w-[80px]">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
             <TableRow><TableCell colSpan={!isComercial ? 11 : 10} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
           ) : paginated.length === 0 ? (
             <TableRow><TableCell colSpan={!isComercial ? 11 : 10}>
               <EmptyState
                 icon={<Building2 className="w-5 h-5 text-[rgba(10,21,100,0.3)]" />}
                 title="Nenhum cliente encontrado"
                 subtitle={search ? `Sem resultados para "${search}"` : "Cadastre o primeiro cliente para começar"}
                 action={!search ? (
                   <button onClick={(e) => { e.stopPropagation(); setModalOpen(true); }} className="text-xs font-bold text-[#0a1564] hover:underline mt-1">
                     Cadastrar cliente →
                   </button>
                 ) : undefined}
               />
             </TableCell></TableRow>
           ) : paginated.map((c) => {
            const row = (
             <TableRow key={c.id} className={`${isComercial ? "cursor-default" : "cursor-pointer"} hover:bg-muted/50`} onClick={() => !isComercial && navigate(`/clientes/${c.id}`)}>
               <TableCell className="font-medium">{c.empresa}</TableCell>
               <TableCell className="text-sm text-muted-foreground">{c.cnpj}</TableCell>
               <TableCell className="text-sm">{SEGMENTO_LABELS[c.segmento] || c.segmento || "—"}</TableCell>
               <TableCell>{c.tesesAtivas}</TableCell>
              <TableCell>{formatCurrencyBR(c.totalCredito)}</TableCell>
              <TableCell>{formatCurrencyBR(c.totalCompensado)}</TableCell>
              <TableCell>{formatCurrencyBR(c.saldo)}</TableCell>
              <TableCell>
                {(() => {
                  const health = c.saldo <= 0 ? 'amarelo' : (c.totalCredito > 0 && (c.totalCompensado / c.totalCredito) < 0.05) ? 'vermelho' : 'verde';
                  return (
                    <div
                      className={cn(
                        "w-2.5 h-2.5 rounded-full mx-auto",
                        health === 'verde' && "bg-dash-green",
                        health === 'amarelo' && "bg-dash-amber",
                        health === 'vermelho' && "bg-dash-red"
                      )}
                      title={
                        health === 'verde' ? 'Compensando ativamente' :
                        health === 'amarelo' ? 'Saldo zerado — considere nova tese' :
                        'Sem compensações recentes'
                      }
                    />
                  );
                })()}
              </TableCell>
              <TableCell>
                {c.hasAlertNaoProtocolado ? <AlertOctagon className="h-4 w-4 text-red-500" /> :
                 c.hasAlertAguardando ? <AlertTriangle className="h-4 w-4 text-orange-500" /> : null}
              </TableCell>
              {!isComercial && (
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditCliente(c); setModalOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              )}
             </TableRow>
            );
            if (isComercial) {
              return (
                <TooltipProvider key={c.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent>Acesso restrito ao time operacional</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }
            return row;
           })}
        </TableBody>
      </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} de {totalItems}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
            >
              Anterior
            </button>
            {(() => {
              const half = 2;
              let start = Math.max(1, currentPage - half);
              let end = Math.min(totalPages, start + 4);
              start = Math.max(1, end - 4);
              return Array.from({ length: end - start + 1 }, (_, i) => start + i);
            })().map((page) => {
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    "w-7 h-7 text-xs font-medium rounded-lg transition-colors",
                    currentPage === page
                      ? "bg-navy text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      <ClienteFormModal open={modalOpen} onOpenChange={(v) => { setModalOpen(v); if (!v) setEditCliente(null); }} onSuccess={fetchAll} cliente={editCliente} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.empresa}</strong>? Todos os processos e compensações associados serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              setDeleting(true);
              deleteMutation.mutate(deleteTarget.id, {
                onSettled: () => { setDeleting(false); setDeleteTarget(null); },
              });
            }}>{deleting ? "Excluindo..." : "Excluir"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report Modal */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[95vw] h-[90vh] overflow-auto print:max-w-full print:h-auto print:shadow-none print:border-none">
          <DialogHeader className="print:hidden">
            <div className="flex items-center justify-between">
              <DialogTitle>Relatório da Carteira</DialogTitle>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir / PDF
              </Button>
            </div>
          </DialogHeader>

          <div id="report-content" className="space-y-6 print:space-y-4">
            {/* Title */}
            <div className="text-center border-b pb-4">
              <h2 className="text-xl font-bold text-foreground">Carteira Focus FinTax — Visão Consolidada</h2>
              <p className="text-sm text-muted-foreground mt-1">{reportDate}</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-4 gap-3">
              <Card><CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Clientes</p>
                <p className="text-lg font-bold">{totalClientes}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Identificado</p>
                <p className="text-lg font-bold text-primary">{formatCurrencyBR(globalCredito)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Compensado</p>
                <p className="text-lg font-bold text-green-700">{formatCurrencyBR(globalCompensado)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Saldo Total</p>
                <p className="text-lg font-bold text-amber-600">{formatCurrencyBR(globalCredito - globalCompensado)}</p>
              </CardContent></Card>
            </div>

            {/* Client Table */}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-foreground">Por Cliente</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="text-center">Teses</TableHead>
                    <TableHead className="text-right">Identificado</TableHead>
                    <TableHead className="text-right">Compensado</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="w-[140px]">% Recuperado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportClientes.map((c) => {
                    const pct = c.totalCredito > 0 ? Math.round((c.totalCompensado / c.totalCredito) * 100) : 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-sm">{c.empresa}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.cnpj}</TableCell>
                        <TableCell className="text-center">{c.tesesAtivas}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrencyBR(c.totalCredito)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrencyBR(c.totalCompensado)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrencyBR(c.saldo)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell colSpan={3}>Total Geral</TableCell>
                    <TableCell className="text-right">{formatCurrencyBR(globalCredito)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyBR(globalCompensado)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyBR(globalCredito - globalCompensado)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={globalCredito > 0 ? Math.round((globalCompensado / globalCredito) * 100) : 0} className="h-2 flex-1" />
                        <span className="text-xs w-8 text-right">{globalCredito > 0 ? Math.round((globalCompensado / globalCredito) * 100) : 0}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Breakdown por tese */}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-foreground">Por Tese</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tese</TableHead>
                    <TableHead className="text-center">Clientes</TableHead>
                    <TableHead className="text-right">Identificado</TableHead>
                    <TableHead className="text-right">Compensado</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teseBreakdown.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{t.nome}</TableCell>
                      <TableCell className="text-center">{t.clientes.size}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrencyBR(t.identificado)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrencyBR(t.compensado)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrencyBR(t.identificado - t.compensado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-center">—</TableCell>
                    <TableCell className="text-right">{formatCurrencyBR(teseBreakdown.reduce((s, t) => s + t.identificado, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrencyBR(teseBreakdown.reduce((s, t) => s + t.compensado, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrencyBR(teseBreakdown.reduce((s, t) => s + (t.identificado - t.compensado), 0))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImportCompensacoesModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchAll}
      />

      <ImportControleModal
        open={importControleOpen}
        onOpenChange={setImportControleOpen}
        onImported={fetchAll}
      />

      <ImportFluxoCaixaModal
        open={importFluxoOpen}
        onOpenChange={setImportFluxoOpen}
        onImported={fetchAll}
      />
    </div>
  );
}
