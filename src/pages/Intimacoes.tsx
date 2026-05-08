import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Download, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { SkeletonKpi } from "@/components/dashboard/SkeletonKpi";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { IntimacaoFormModal } from "@/components/intimacoes/IntimacaoFormModal";
import { useIntimacoes, useDeleteIntimacao } from "@/hooks/data/useIntimacoes";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-800 border-amber-200" },
  informado_aline: { label: "Informado Aline", className: "bg-blue-100 text-blue-800 border-blue-200" },
  retificacao_feita: { label: "Retificação Feita", className: "bg-green-100 text-green-800 border-green-200" },
  em_andamento: { label: "Em Andamento", className: "bg-purple-100 text-purple-800 border-purple-200" },
  concluido: { label: "Concluído", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground border-border" },
};

const DONE_STATUSES = ["retificacao_feita", "concluido", "cancelado"];

function diasRestantes(prazoVencimento: string | null, status: string) {
  if (DONE_STATUSES.includes(status)) return null;
  if (!prazoVencimento) return null;
  return differenceInDays(parseISO(prazoVencimento), new Date());
}

function DiasRestantesPill({ dias, status }: { dias: number | null; status: string }) {
  if (DONE_STATUSES.includes(status)) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">{status === "cancelado" ? "Cancelado" : "Concluído"}</span>;
  }
  if (dias === null) return <span className="text-xs text-muted-foreground">—</span>;
  let cls = "bg-green-100 text-green-800";
  if (dias <= 15) cls = "bg-red-100 text-red-800";
  else if (dias <= 30) cls = "bg-amber-100 text-amber-800";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{dias}d</span>;
}

export default function Intimacoes() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: intimacoes, isLoading } = useIntimacoes();
  const deleteIntimacaoMutation = useDeleteIntimacao();

  const filtered = useMemo(() => {
    if (!intimacoes) return [];
    return intimacoes.filter((i) => {
      if (search && !i.empresa_nome.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      return true;
    });
  }, [intimacoes, search, statusFilter]);

  const kpis = useMemo(() => {
    if (!intimacoes) return { total: 0, pendentes: 0, urgentes: 0, concluidas: 0 };
    const today = new Date();
    const in15 = addDays(today, 15);
    return {
      total: intimacoes.length,
      pendentes: intimacoes.filter((i) => ["pendente", "informado_aline", "em_andamento"].includes(i.status)).length,
      urgentes: intimacoes.filter((i) => {
        if (DONE_STATUSES.includes(i.status)) return false;
        if (!i.prazo_vencimento) return false;
        return parseISO(i.prazo_vencimento) <= in15;
      }).length,
      concluidas: intimacoes.filter((i) => ["retificacao_feita", "concluido"].includes(i.status)).length,
    };
  }, [intimacoes]);

  const handleDelete = (id: string) => {
    deleteIntimacaoMutation.mutate(id);
  };

  const exportExcel = () => {
    const rows = filtered.map((i) => ({
      'Empresa': i.empresa_nome,
      'Data da Intimação': i.data_intimacao ? format(parseISO(i.data_intimacao), "dd/MM/yyyy") : "",
      'Motivo': i.motivo,
      'Prazo (dias)': i.prazo_dias,
      'Vencimento': i.prazo_vencimento ? format(parseISO(i.prazo_vencimento), "dd/MM/yyyy") : "",
      'Dias Restantes': diasRestantes(i.prazo_vencimento, i.status) ?? "",
      'Status': STATUS_MAP[i.status]?.label ?? i.status,
      'Próximo Passo': i.proximo_passo ?? "",
      'Observações': i.observacoes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 35 }, { wch: 18 }, { wch: 40 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 35 }, { wch: 35 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Intimações");
    XLSX.writeFile(wb, `FocusFinTax_Intimacoes_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("Excel exportado");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" /> Controle de Intimações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Notificações fiscais da Receita Federal</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova Intimação
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {isLoading ? <SkeletonKpi /> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total" value={kpis.total} />
          <KpiCard label="Pendentes" value={kpis.pendentes} accent="amber" />
          <KpiCard label="Vencendo em 15 dias" value={kpis.urgentes} accent="red" />
          <KpiCard label="Concluídas" value={kpis.concluidas} accent="green" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Buscar empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[200px]"><SelectValue placeholder="Todos os status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? <SkeletonTable /> : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-center">Prazo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-center">Dias Rest.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Próximo Passo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma intimação encontrada</TableCell></TableRow>
              ) : filtered.map((i) => {
                const dias = diasRestantes(i.prazo_vencimento, i.status);
                const st = STATUS_MAP[i.status];
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{i.empresa_nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{i.data_intimacao ? format(parseISO(i.data_intimacao), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{i.motivo}</TableCell>
                    <TableCell className="text-center">{i.prazo_dias}d</TableCell>
                    <TableCell className="whitespace-nowrap">{i.prazo_vencimento ? format(parseISO(i.prazo_vencimento), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-center"><DiasRestantesPill dias={dias} status={i.status} /></TableCell>
                    <TableCell>{st && <Badge variant="outline" className={st.className}>{st.label}</Badge>}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">{i.proximo_passo || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(i); setModalOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir intimação?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita. A intimação de "{i.empresa_nome}" será removida permanentemente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(i.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <IntimacaoFormModal open={modalOpen} onOpenChange={setModalOpen} intimacao={editing} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["intimacoes"] })} />
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const colorMap: Record<string, string> = {
    amber: "text-amber-600",
    red: "text-red-600",
    green: "text-emerald-600",
  };
  return (
    <div className="card-base p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? colorMap[accent] : "text-foreground"}`}>{value}</p>
    </div>
  );
}
