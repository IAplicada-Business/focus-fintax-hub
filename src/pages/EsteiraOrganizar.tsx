import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ListChecks,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRowSelection } from "@/hooks/useRowSelection";
import {
  useAplicarRealocacaoEsteira,
  useEsteiraClientes,
  useEsteiraResponsaveis,
  useEsteiraSlaConfig,
  useReiniciarSlaEsteira,
  useStatusPrincipalPorCliente,
} from "@/hooks/data/useEsteira";
import type { EsteiraCliente, RealocacaoItem } from "@/services/esteiraService";
import {
  isEstagioEsteira,
  sugerirEstagioRealocacao,
  type EstagioEsteira,
} from "@/lib/esteira-constants";
import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";
import {
  STATUS_COMPENSACAO_COLORS,
  STATUS_COMPENSACAO_LABELS,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { cn } from "@/lib/utils";

type Filtro = "todos" | "com_alteracao" | "triagem" | "sem_responsavel" | "sem_segmento";

interface Edicao {
  estagio?: EstagioEsteira;
  responsavel_id?: string;
  segmento?: string;
}

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "com_alteracao", label: "Com alteração" },
  { value: "triagem", label: "Em Triagem" },
  { value: "sem_responsavel", label: "Sem responsável" },
  { value: "sem_segmento", label: "Sem segmento" },
];

const SEGMENTOS = Object.entries(SEGMENTO_LABELS);

function semSegmento(c: EsteiraCliente): boolean {
  return !c.segmento || c.segmento.trim() === "";
}

/**
 * Organizar esteira — realocação em massa dos clientes herdados da importação
 * (estágio + responsável + segmento), com sugestão automática revisável, e
 * reinício do contador de SLA. Só admin/PMO. Nada é gravado até "Aplicar".
 */
export default function EsteiraOrganizar() {
  const { userRole } = useAuth();
  const editable = userRole === "admin" || userRole === "pmo";

  const clientesQ = useEsteiraClientes();
  const slaConfigQ = useEsteiraSlaConfig();
  const statusQ = useStatusPrincipalPorCliente();
  const responsaveisQ = useEsteiraResponsaveis();
  const aplicar = useAplicarRealocacaoEsteira();
  const reiniciar = useReiniciarSlaEsteira();

  const [edits, setEdits] = useState<Record<string, Edicao>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState("");
  const [responsavelLote, setResponsavelLote] = useState("");
  const [confirmAplicar, setConfirmAplicar] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const clientes = useMemo(() => clientesQ.data ?? [], [clientesQ.data]);
  const responsaveis = useMemo(() => responsaveisQ.data ?? [], [responsaveisQ.data]);

  const statusPorCliente = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of statusQ.data ?? []) m.set(r.cliente_id, r.status_principal);
    return m;
  }, [statusQ.data]);

  const responsavelNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of responsaveis) m.set(r.user_id, r.full_name);
    return m;
  }, [responsaveis]);

  // Opções de etapa: config ordenada; etapa inativa só aparece se algum cliente já está nela.
  const estagioOpcoes = useMemo(() => {
    const rows = [...(slaConfigQ.data ?? [])].sort((a, b) => a.ordem - b.ordem);
    const emUso = new Set(clientes.map((c) => c.estagio_esteira));
    return rows.filter((r) => r.ativo || emUso.has(r.estagio));
  }, [slaConfigQ.data, clientes]);

  const estagioLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of slaConfigQ.data ?? []) m.set(r.estagio, r.label);
    return m;
  }, [slaConfigQ.data]);

  const sugestao = (c: EsteiraCliente) =>
    sugerirEstagioRealocacao(statusPorCliente.get(c.id), c.estagio_esteira);

  const estagioNovo = (c: EsteiraCliente): EstagioEsteira =>
    edits[c.id]?.estagio ?? sugestao(c).estagio;

  const responsavelNovo = (c: EsteiraCliente): string | null =>
    edits[c.id]?.responsavel_id ?? c.responsavel_id ?? null;

  const segmentoNovo = (c: EsteiraCliente): string | null =>
    edits[c.id]?.segmento ?? (semSegmento(c) ? null : c.segmento);

  const temAlteracao = (c: EsteiraCliente): boolean =>
    estagioNovo(c) !== c.estagio_esteira ||
    (responsavelNovo(c) ?? null) !== (c.responsavel_id ?? null) ||
    (segmentoNovo(c) ?? null) !== (semSegmento(c) ? null : c.segmento);

  const setEdit = (id: string, patch: Edicao) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes
      .filter((c) => {
        if (filtro === "com_alteracao") return temAlteracao(c);
        if (filtro === "triagem") return c.estagio_esteira === "triagem";
        if (filtro === "sem_responsavel") return !responsavelNovo(c);
        if (filtro === "sem_segmento") return !segmentoNovo(c);
        return true;
      })
      .filter((c) => !termo || c.empresa.toLowerCase().includes(termo) || (c.cnpj || "").includes(termo))
      .sort((a, b) => (b.dias_na_etapa ?? 0) - (a.dias_na_etapa ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, filtro, busca, edits, statusPorCliente]);

  const visiveisIds = useMemo(() => visiveis.map((c) => c.id), [visiveis]);
  const sel = useRowSelection(visiveisIds);

  const pendentes = useMemo(() => clientes.filter(temAlteracao), [clientes, edits, statusPorCliente]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumo = useMemo(() => {
    let etapa = 0;
    let resp = 0;
    let seg = 0;
    for (const c of pendentes) {
      if (estagioNovo(c) !== c.estagio_esteira) etapa += 1;
      if ((responsavelNovo(c) ?? null) !== (c.responsavel_id ?? null)) resp += 1;
      if ((segmentoNovo(c) ?? null) !== (semSegmento(c) ? null : c.segmento)) seg += 1;
    }
    return { etapa, resp, seg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendentes]);

  const kpis = useMemo(
    () => ({
      total: clientes.length,
      triagem: clientes.filter((c) => c.estagio_esteira === "triagem").length,
      semResponsavel: clientes.filter((c) => !c.responsavel_id).length,
      semSegmento: clientes.filter(semSegmento).length,
      atrasados: clientes.filter((c) => c.atrasado).length,
    }),
    [clientes],
  );

  if (!editable) return <Navigate to="/esteira" replace />;

  const carregando = clientesQ.isLoading || slaConfigQ.isLoading || statusQ.isLoading;
  const ocupado = aplicar.isPending || reiniciar.isPending;

  const aplicarResponsavelLote = () => {
    if (!responsavelLote || sel.selectedCount === 0) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of sel.selectedIds) next[id] = { ...next[id], responsavel_id: responsavelLote };
      return next;
    });
    toast.success(`Responsável definido para ${sel.selectedCount} cliente${sel.selectedCount > 1 ? "s" : ""} (pendente de aplicar).`);
  };

  const handleAplicar = async () => {
    const itens: RealocacaoItem[] = pendentes.map((c) => ({
      cliente_id: c.id,
      estagio: estagioNovo(c) !== c.estagio_esteira ? estagioNovo(c) : null,
      responsavel_id:
        (responsavelNovo(c) ?? null) !== (c.responsavel_id ?? null) ? responsavelNovo(c) : null,
      segmento: (segmentoNovo(c) ?? null) !== (semSegmento(c) ? null : c.segmento) ? segmentoNovo(c) : null,
    }));
    try {
      const n = await aplicar.mutateAsync({ itens, motivo: motivo.trim() || undefined });
      toast.success(`${n} cliente${n !== 1 ? "s" : ""} atualizado${n !== 1 ? "s" : ""} na esteira.`);
      setEdits({});
      setMotivo("");
      sel.clear();
      setConfirmAplicar(false);
    } catch {
      // toastError já disparou no hook
    }
  };

  const handleReiniciar = async () => {
    const ids = [...sel.selectedIds];
    try {
      const n = await reiniciar.mutateAsync({ clienteIds: ids, motivo: motivo.trim() || undefined });
      toast.success(`Contador de SLA reiniciado em ${n} cliente${n !== 1 ? "s" : ""}.`);
      sel.clear();
      setConfirmReset(false);
    } catch {
      // toastError já disparou no hook
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28">
      <div>
        <Link
          to="/esteira"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar à esteira
        </Link>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListChecks className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Organizar esteira</h1>
            <p className="text-sm text-muted-foreground">
              Revise a etapa sugerida, defina responsável e complete o segmento. Nada é gravado até
              clicar em <strong>Aplicar</strong>. Quem muda de etapa tem o contador de SLA reiniciado
              automaticamente; quem fica pode ter o contador reiniciado pela seleção.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Clientes ativos" value={kpis.total} />
        <Kpi label="Em Triagem" value={kpis.triagem} tone={kpis.triagem > 0 ? "warn" : "ok"} />
        <Kpi label="Sem responsável" value={kpis.semResponsavel} tone={kpis.semResponsavel > 0 ? "warn" : "ok"} />
        <Kpi label="Sem segmento" value={kpis.semSegmento} tone={kpis.semSegmento > 0 ? "warn" : "ok"} />
        <Kpi label="Acima do SLA" value={kpis.atrasados} tone={kpis.atrasados > 0 ? "danger" : "ok"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-card p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filtro === f.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa ou CNPJ"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Ações em lote sobre a seleção */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {sel.selectedCount === 0
            ? "Selecione clientes pra atribuir responsável ou reiniciar SLA em lote."
            : `${sel.selectedCount} selecionado${sel.selectedCount > 1 ? "s" : ""}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={responsavelLote} onValueChange={setResponsavelLote}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Responsável para a seleção" />
            </SelectTrigger>
            <SelectContent>
              {responsaveis.map((r) => (
                <SelectItem key={r.user_id} value={r.user_id} className="text-xs">
                  {r.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!responsavelLote || sel.selectedCount === 0 || ocupado}
            onClick={aplicarResponsavelLote}
          >
            Atribuir
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sel.selectedCount === 0 || ocupado}
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reiniciar SLA
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={Object.keys(edits).length === 0 || ocupado}
            onClick={() => setEdits({})}
            title="Descarta suas alterações e volta às sugestões automáticas"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Restaurar sugestões
          </Button>
        </div>
      </div>

      {carregando ? (
        <SkeletonTable />
      ) : clientesQ.isError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Falha ao carregar a esteira</p>
          <p className="mt-1 text-muted-foreground">{(clientesQ.error as Error)?.message || "Tente de novo."}</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => clientesQ.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={<ListChecks className="h-5 w-5 text-[rgba(10,21,100,0.3)]" />}
            title="Nenhum cliente neste filtro"
            subtitle="Troque o filtro ou limpe a busca."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px] uppercase tracking-wide">
                <TableHead className="w-10 pl-3">
                  <Checkbox
                    checked={sel.allVisibleSelected ? true : sel.someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={() => sel.toggleAll(visiveisIds)}
                    aria-label="Selecionar todos os visíveis"
                  />
                </TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Etapa atual</TableHead>
                <TableHead className="w-[200px]">Etapa nova</TableHead>
                <TableHead className="w-[190px]">Responsável</TableHead>
                <TableHead className="w-[160px]">Segmento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((c) => {
                const st = statusPorCliente.get(c.id) as StatusCompensacao | undefined;
                const sug = sugestao(c);
                const novo = estagioNovo(c);
                const alterado = temAlteracao(c);
                const resp = responsavelNovo(c);
                const seg = segmentoNovo(c);
                return (
                  <TableRow key={c.id} className={cn(alterado && "bg-primary/[0.03]")}>
                    <TableCell className="pl-3">
                      <Checkbox
                        checked={sel.isSelected(c.id)}
                        onCheckedChange={() => sel.toggle(c.id)}
                        aria-label={`Selecionar ${c.empresa}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <Link to={`/clientes/${c.id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                        {c.empresa}
                      </Link>
                      <p className="text-[10px] text-muted-foreground">{c.cnpj || "—"}</p>
                    </TableCell>
                    <TableCell>
                      {st && STATUS_COMPENSACAO_LABELS[st] ? (
                        <Badge variant="outline" className={`${STATUS_COMPENSACAO_COLORS[st]} text-[10px] px-1.5 py-0`}>
                          {STATUS_COMPENSACAO_LABELS[st]}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p className="text-xs text-foreground">{estagioLabel.get(c.estagio_esteira) ?? c.estagio_esteira}</p>
                      <p className={cn("text-[10px]", c.atrasado ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {c.dias_na_etapa ?? 0}d na etapa{c.atrasado ? " · acima do SLA" : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={novo}
                        onValueChange={(v) => {
                          if (isEstagioEsteira(v)) setEdit(c.id, { estagio: v });
                        }}
                        disabled={ocupado}
                      >
                        <SelectTrigger
                          className={cn("h-8 text-xs", novo !== c.estagio_esteira && "border-primary/40 bg-primary/5")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {estagioOpcoes.map((o) => (
                            <SelectItem key={o.estagio} value={o.estagio} className="text-xs">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {c.estagio_esteira === "triagem" && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground" title={sug.motivo}>
                          <Sparkles className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{sug.motivo}</span>
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={resp ?? ""}
                        onValueChange={(v) => setEdit(c.id, { responsavel_id: v })}
                        disabled={ocupado}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 text-xs",
                            !resp && "border-amber-300/60 bg-amber-50/50",
                            resp && resp !== (c.responsavel_id ?? null) && "border-primary/40 bg-primary/5",
                          )}
                        >
                          <SelectValue placeholder="Sem responsável">
                            {resp ? responsavelNome.get(resp) ?? c.responsavel_nome ?? "—" : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {responsaveis.map((r) => (
                            <SelectItem key={r.user_id} value={r.user_id} className="text-xs">
                              {r.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {semSegmento(c) ? (
                        <Select
                          value={seg ?? ""}
                          onValueChange={(v) => setEdit(c.id, { segmento: v })}
                          disabled={ocupado}
                        >
                          <SelectTrigger
                            className={cn("h-8 text-xs", !seg && "border-amber-300/60 bg-amber-50/50", seg && "border-primary/40 bg-primary/5")}
                          >
                            <SelectValue placeholder="Definir segmento" />
                          </SelectTrigger>
                          <SelectContent>
                            {SEGMENTOS.map(([value, label]) => (
                              <SelectItem key={value} value={value} className="text-xs">
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-foreground">{SEGMENTO_LABELS[c.segmento] || c.segmento}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Barra fixa de aplicação */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {pendentes.length === 0 ? (
              "Nenhuma alteração pendente."
            ) : (
              <>
                <strong className="text-foreground">{pendentes.length}</strong> cliente
                {pendentes.length > 1 ? "s" : ""} com alteração ·{" "}
                {resumo.etapa} etapa · {resumo.resp} responsável · {resumo.seg} segmento
              </>
            )}
          </div>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional, vai pro histórico do cliente)"
            className="h-8 w-full text-xs sm:ml-auto sm:w-80"
            maxLength={200}
          />
          <Button
            type="button"
            size="sm"
            disabled={pendentes.length === 0 || ocupado}
            onClick={() => setConfirmAplicar(true)}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Aplicar {pendentes.length > 0 ? `(${pendentes.length})` : ""}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmAplicar} onOpenChange={setConfirmAplicar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar realocação na esteira?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {pendentes.length} cliente{pendentes.length > 1 ? "s" : ""} será
                  {pendentes.length > 1 ? "ão" : ""} atualizado{pendentes.length > 1 ? "s" : ""}:
                </p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  <li>{resumo.etapa} mudam de etapa (contador de SLA reinicia sozinho)</li>
                  <li>{resumo.resp} ganham ou trocam de responsável</li>
                  <li>{resumo.seg} recebem segmento</li>
                </ul>
                <p className="text-muted-foreground">
                  Cada alteração fica registrada no histórico do cliente com seu usuário.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleAplicar(); }} disabled={ocupado}>
              {aplicar.isPending ? "Aplicando…" : "Aplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar contador de SLA?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {sel.selectedCount} cliente{sel.selectedCount > 1 ? "s" : ""} selecionado
                  {sel.selectedCount > 1 ? "s" : ""} passa{sel.selectedCount > 1 ? "m" : ""} a contar o
                  prazo da etapa a partir de agora, sem mudar de etapa.
                </p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  O tempo acumulado até aqui não entra nas médias do painel. Use só pra limpar o atraso
                  herdado da importação.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleReiniciar(); }} disabled={ocupado}>
              {reiniciar.isPending ? "Reiniciando…" : "Reiniciar SLA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "ok" | "warn" | "danger" }) {
  const color =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold leading-none tabular-nums", color)}>{value}</p>
    </div>
  );
}
