import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { Plus, Eye, RefreshCw, Search, Users, Pencil, Trash2, Upload, UserCheck, Sparkles, Loader2 } from "lucide-react";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/lead-constants";
import { useLeadsBasic, useAnalyzeLead, useDeleteLeads, useAtribuirLeads } from "@/hooks/data/useLeads";
import { useEquipeComercial } from "@/hooks/data/useEquipeComercial";
import { useAnalisarLeadsEmLote } from "@/hooks/data/useAnalisarLeadsEmLote";
import { useFiltroProduto } from "@/hooks/useFiltroProduto";
import { useAuth } from "@/hooks/useAuth";
import { useRowSelection } from "@/hooks/useRowSelection";
import { BatchDeleteBar } from "@/components/BatchDeleteBar";
import { LeadFormModal, type LeadFormFields } from "@/components/pipeline/LeadFormModal";
import { ImportLeadsModal } from "@/components/pipeline/ImportLeadsModal";
import { AtribuirLeadsDialog } from "@/components/pipeline/AtribuirLeadsDialog";
import { ProdutoBadge, ProdutoFiltroChips, ResponsaveisChip, ResponsavelSelect } from "@/components/pipeline/FiltrosComerciais";
import { filtrarPorProduto } from "@/lib/produto-lead";
import { filtrarPorResponsavel, type FiltroResponsavel } from "@/lib/equipe-comercial";
import { elegivelDiagnostico } from "@/lib/import-leads-parser";
import { Progress } from "@/components/ui/progress";
import { getLead } from "@/services/leadsService";
import { toastError } from "@/lib/handle-error";

const EDIT_ROLES = new Set(["admin", "comercial", "sdr", "gestor_comercial"]);

export default function LeadQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userRole } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editLead, setEditLead] = useState<LeadFormFields | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [atribuirOpen, setAtribuirOpen] = useState(false);
  const [filtroProduto, setFiltroProduto] = useFiltroProduto();
  const [filtroResponsavel, setFiltroResponsavel] = useState<FiltroResponsavel>("todos");
  const { data: equipe = [] } = useEquipeComercial();
  const atribuirMutation = useAtribuirLeads();
  const analiseLote = useAnalisarLeadsEmLote(3);
  // Mesmo modal do Pipeline: sem lead = criar. `?novo=1` (link antigo /leads/novo) abre direto.
  const [editOpen, setEditOpen] = useState(() => searchParams.get("novo") === "1");

  useEffect(() => {
    if (searchParams.get("novo") === "1") {
      setEditLead(null);
      setEditOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("novo");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const abrirNovoLead = () => {
    setEditLead(null);
    setEditOpen(true);
  };
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

  const filtered = filtrarPorResponsavel(
    filtrarPorProduto(
      leads.filter(
        (l) =>
          l.nome.toLowerCase().includes(search.toLowerCase()) ||
          l.empresa.toLowerCase().includes(search.toLowerCase()) ||
          l.cnpj.includes(search),
      ),
      filtroProduto,
    ),
    filtroResponsavel,
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

  // Seleção serve para excluir (admin) e para atribuir/diagnosticar (quem edita).
  const canSelect = canEdit || canDelete;

  const handleAtribuir = async (atribuicao: Parameters<typeof atribuirMutation.mutateAsync>[0]["atribuicao"]) => {
    await atribuirMutation.mutateAsync({ ids: [...selection.selectedIds], atribuicao });
    setAtribuirOpen(false);
    selection.clear();
  };

  /** Só quem tem faturamento e regime: sem isso o motor não calcula nada. */
  const selecionadosElegiveis = leads.filter((l) => selection.selectedIds.has(l.id) && elegivelDiagnostico(l));

  const handleDiagnosticoLote = async () => {
    const ids = selecionadosElegiveis.map((l) => l.id);
    if (ids.length === 0) {
      toast.info("Nenhum lead selecionado tem faturamento e regime preenchidos.");
      return;
    }
    const r = await analiseLote.analisar(ids);
    if (r.falhas === 0) toast.success(`${r.concluidos} diagnóstico${r.concluidos === 1 ? "" : "s"} gerado${r.concluidos === 1 ? "" : "s"}`);
    else toast.warning(`${r.concluidos} gerado${r.concluidos === 1 ? "" : "s"} · ${r.falhas} falha${r.falhas === 1 ? "" : "s"}`);
    selection.clear();
  };

  const colSpan = 9 + (canSelect ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">Fila de processamento e análise de teses</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => setImportOpen(true)} title="Importar leads de planilha (xlsx/csv)">
              <Upload className="h-4 w-4 mr-2" />
              Importar planilha
            </Button>
          )}
          <Button onClick={abrirNovoLead} className="font-semibold">
            <Plus className="h-4 w-4 mr-2" />
            Novo Lead
          </Button>
        </div>
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
          <div className="flex items-center gap-3 flex-wrap">
            <ProdutoFiltroChips value={filtroProduto} onChange={setFiltroProduto} />
            <ResponsavelSelect value={filtroResponsavel} onChange={setFiltroResponsavel} equipe={equipe} className="h-10 text-sm" />
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
          {canSelect && selection.selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setAtribuirOpen(true)} disabled={atribuirMutation.isPending || analiseLote.progresso.rodando}>
                    <UserCheck className="h-4 w-4 mr-1" /> Atribuir {selection.selectedCount}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDiagnosticoLote()}
                    disabled={analiseLote.progresso.rodando || atribuirMutation.isPending}
                    title={`${selecionadosElegiveis.length} com faturamento e regime`}
                  >
                    {analiseLote.progresso.rodando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Gerar diagnóstico ({selecionadosElegiveis.length})
                  </Button>
                </>
              )}
              {canDelete ? (
                <div className="flex-1 min-w-[260px]">
                  <BatchDeleteBar
                    count={selection.selectedCount}
                    onConfirm={handleDeleteBatch}
                    title="Excluir leads selecionados"
                    description={`Esta ação não pode ser desfeita. ${selection.selectedCount} lead(s) serão removidos permanentemente, incluindo relatórios, histórico e diagnósticos.`}
                    disabled={deleteMutation.isPending}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{selection.selectedCount} selecionado{selection.selectedCount === 1 ? "" : "s"}</p>
              )}
            </div>
          )}
          {analiseLote.progresso.rodando && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Gerando diagnósticos...</span>
                <span className="tabular-nums">
                  {analiseLote.progresso.concluidos + analiseLote.progresso.falhas} / {analiseLote.progresso.total}
                  {analiseLote.progresso.falhas > 0 && ` · ${analiseLote.progresso.falhas} falha(s)`}
                </span>
              </div>
              <Progress value={((analiseLote.progresso.concluidos + analiseLote.progresso.falhas) / Math.max(1, analiseLote.progresso.total)) * 100} />
            </div>
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
                  {canSelect && (
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
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Produto</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Responsável</TableHead>
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
                      {canSelect && (
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
                      <TableCell><ProdutoBadge produto={l.produto} /></TableCell>
                      <TableCell>
                        <ResponsaveisChip sdrId={l.sdr_id} closerId={l.closer_id} equipe={equipe} compacto={false} />
                        {!l.sdr_id && !l.closer_id && <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
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
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          setEditOpen(false);
          setEditLead(null);
        }}
      />

      <ImportLeadsModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}
      />

      <AtribuirLeadsDialog
        open={atribuirOpen}
        onOpenChange={setAtribuirOpen}
        quantidade={selection.selectedCount}
        equipe={equipe}
        onConfirm={handleAtribuir}
        busy={atribuirMutation.isPending}
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
