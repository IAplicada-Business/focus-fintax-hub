import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Eye, RefreshCw, Search, Users, Pencil, Trash2 } from "lucide-react";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/lead-constants";
import { useLeadsBasic, useAnalyzeLead, useDeleteLeads } from "@/hooks/data/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { useRowSelection } from "@/hooks/useRowSelection";
import { BatchDeleteBar } from "@/components/BatchDeleteBar";
import { LeadFormModal, type LeadFormFields } from "@/components/pipeline/LeadFormModal";
import { getLead } from "@/services/leadsService";
import { toastError } from "@/lib/handle-error";

const EDIT_ROLES = new Set(["admin", "comercial", "sdr", "gestor_comercial"]);

export default function LeadQueue() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editLead, setEditLead] = useState<LeadFormFields | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nome: string } | null>(null);

  const { data: leads = [], isLoading: loading } = useLeadsBasic(statusFilter === "all" ? undefined : statusFilter);
  const analyzeMutation = useAnalyzeLead();
  const deleteMutation = useDeleteLeads();

  const canEdit = EDIT_ROLES.has(userRole ?? "");
  const canDelete = userRole === "admin";

  const handleReprocess = (leadId: string) => {
    toast.info("Reprocessando...");
    analyzeMutation.mutate(leadId);
  };

  const filtered = leads.filter(
    (l) =>
      l.nome.toLowerCase().includes(search.toLowerCase()) ||
      l.empresa.toLowerCase().includes(search.toLowerCase()) ||
      l.cnpj.includes(search)
  );

  const visibleIds = useMemo(() => filtered.map((l) => l.id), [filtered]);
  const selection = useRowSelection(visibleIds);

  const stats = {
    total: leads.length,
    novos: leads.filter((l) => l.status === "novo").length,
    gerados: leads.filter((l) => l.status === "relatorio_gerado").length,
    enviados: leads.filter((l) => l.status === "enviado").length,
  };

  const handleEdit = async (id: string) => {
    try {
      const lead = await getLead(id);
      setEditLead(lead);
      setEditOpen(true);
    } catch (err) {
      toastError(err, "Erro ao carregar lead");
    }
  };

  const handleDeleteOne = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync([deleteTarget.id]);
    selection.clear();
    setDeleteTarget(null);
  };

  const handleDeleteBatch = async () => {
    await deleteMutation.mutateAsync([...selection.selectedIds]);
    selection.clear();
  };

  const colSpan = 7 + (canDelete ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">Fila de processamento e análise de teses</p>
        </div>
        <Button onClick={() => navigate("/leads/novo")} className="font-semibold">
          <Plus className="h-4 w-4 mr-2" />
          Novo Lead
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total },
          { label: "Novos", value: stats.novos },
          { label: "Relatórios", value: stats.gerados },
          { label: "Enviados", value: stats.enviados },
        ].map((s) => (
          <Card key={s.label} className="border-card-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-card-border">
        <CardHeader className="flex flex-row items-center justify-between pb-4 gap-4 flex-wrap">
          <CardTitle className="text-lg font-bold">Lista de Leads</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {canDelete && (
            <BatchDeleteBar
              count={selection.selectedCount}
              onConfirm={handleDeleteBatch}
              title="Excluir leads selecionados"
              description={`Esta ação não pode ser desfeita. ${selection.selectedCount} lead(s) serão removidos permanentemente, incluindo relatórios, histórico e diagnósticos.`}
              disabled={deleteMutation.isPending}
            />
          )}
          {loading ? (
            <div className="space-y-3 py-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canDelete && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selection.allVisibleSelected ? true : selection.someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={() => selection.toggleAll(visibleIds)}
                        aria-label="Selecionar todos"
                        disabled={filtered.length === 0}
                      />
                    </TableHead>
                  )}
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Nome</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Empresa</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">CNPJ</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Score</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Status</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Data</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
                      Nenhum lead encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((l) => (
                    <TableRow key={l.id} data-state={selection.isSelected(l.id) ? "selected" : undefined}>
                      {canDelete && (
                        <TableCell>
                          <Checkbox
                            checked={selection.isSelected(l.id)}
                            onCheckedChange={() => selection.toggle(l.id)}
                            aria-label={`Selecionar ${l.nome}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-semibold text-foreground">{l.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{l.empresa}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{l.cnpj}</TableCell>
                      <TableCell>
                        {l.score_lead != null ? (
                          <span className="font-bold text-foreground">{l.score_lead}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={LEAD_STATUS_COLORS[l.status] || ""}>
                          {LEAD_STATUS_LABELS[l.status] || l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(l.criado_em).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" title="Editar lead" onClick={() => handleEdit(l.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {["relatorio_gerado", "enviado"].includes(l.status) && (
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/leads/${l.id}/relatorio`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {["novo", "processando"].includes(l.status) && (
                          <Button variant="ghost" size="icon" onClick={() => handleReprocess(l.id)}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            title="Excluir lead"
                            onClick={() => setDeleteTarget({ id: l.id, nome: l.nome })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <LeadFormModal
        open={editOpen}
        lead={editLead}
        onClose={() => {
          setEditOpen(false);
          setEditLead(null);
        }}
        onSaved={() => {
          setEditOpen(false);
          setEditLead(null);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lead{" "}
              <strong>{deleteTarget?.nome}</strong> será removido permanentemente, incluindo
              relatórios, histórico e diagnósticos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteOne();
              }}
              disabled={deleteMutation.isPending}
              className="bg-[#c8001e] hover:bg-[#a30019] text-white"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
