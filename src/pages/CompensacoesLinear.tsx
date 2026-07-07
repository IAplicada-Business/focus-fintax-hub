import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  ChevronRight,
  ChevronDown,
  FileText,
  X,
  Table as TableIcon,
  Grid3x3,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

const TRIBUTOS_ENUM = [
  "INSS_52",
  "INSS_retidos",
  "PIS",
  "COFINS",
  "IRPJ_CSLL_agregado",
  "DCTWEB_trimestral",
  "outros",
] as const;
type TributoEnum = (typeof TRIBUTOS_ENUM)[number];

const TRIBUTO_COLORS: Record<TributoEnum, string> = {
  INSS_52: "bg-indigo-100 text-indigo-800 border-indigo-200",
  INSS_retidos: "bg-purple-100 text-purple-800 border-purple-200",
  PIS: "bg-cyan-100 text-cyan-800 border-cyan-200",
  COFINS: "bg-cyan-100 text-cyan-800 border-cyan-200",
  IRPJ_CSLL_agregado: "bg-rose-100 text-rose-800 border-rose-200",
  DCTWEB_trimestral: "bg-amber-100 text-amber-800 border-amber-200",
  outros: "bg-slate-100 text-slate-800 border-slate-200",
};

// Pivot mês × tributo: agrupa PIS+COFINS numa coluna "PIS/COFINS",
// INSS_52+INSS_retidos+DCTWEB em "INSS/PREV", IRPJ+CSLL em "IRPJ/CSLL".
// Colunas exibidas na matriz (ordem canônica da planilha):
const PIVOT_COLS = [
  { key: "PIS_COFINS", label: "PIS/COFINS", tribs: ["PIS", "COFINS"] as TributoEnum[], color: "bg-cyan-50 text-cyan-900" },
  { key: "INSS_PREV",  label: "INSS/Previd.", tribs: ["INSS_52", "INSS_retidos", "DCTWEB_trimestral"] as TributoEnum[], color: "bg-indigo-50 text-indigo-900" },
  { key: "IRPJ_CSLL",  label: "IRPJ/CSLL", tribs: ["IRPJ_CSLL_agregado"] as TributoEnum[], color: "bg-rose-50 text-rose-900" },
  { key: "OUTROS",     label: "Outros",    tribs: ["outros"] as TributoEnum[], color: "bg-slate-50 text-slate-900" },
];

const DCOMP_REGEX = /^\d{5}\.\d{5}\.\d{6}\.\d\.\d\.\d{2}-\d{4}$/;

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface Compensacao {
  id: string;
  cliente_id: string;
  mes_referencia: string; // ISO date
  tributo_enum: TributoEnum | null;
  tributo: string | null;
  valor_compensado: number | null;
  honorario_valor: number | null;
  honorario_percentual: number | null;
  lancado_mapa: boolean | null;
  observacao: string | null;
  status_pagamento_honorario: "pendente" | "pago" | null;
  tese_origem_id: string | null;
  processo_tese_id: string | null;
  // Joined
  tese_label?: string;
  processo_nome?: string;
}

interface Cliente {
  id: string;
  empresa: string | null;
  cnpj: string | null;
}

interface TeseCatalog {
  id: string;
  codigo: string;
  label: string;
}

interface Processo {
  id: string;
  nome_exibicao: string;
}

interface Dcomp {
  id: string;
  compensacao_id: string;
  numero_declaracao: string;
}

const monthKey = (d: string) => d.slice(0, 7);

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function CompensacoesLinear() {
  const { id: clienteId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userRole } = useAuth();
  const readOnly = userRole === "comercial" || userRole === "cliente";

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [comps, setComps] = useState<Compensacao[]>([]);
  const [teses, setTeses] = useState<TeseCatalog[]>([]);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [dcompsByCompId, setDcompsByCompId] = useState<Record<string, Dcomp[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Compensacao | null>(null);

  const competenciaFilter = searchParams.get("competencia") || "all";
  const viewMode = (searchParams.get("view") as "linear" | "pivot") || "linear";
  const setViewMode = (v: "linear" | "pivot") => {
    const p = new URLSearchParams(searchParams);
    if (v === "linear") p.delete("view");
    else p.set("view", v);
    setSearchParams(p);
  };

  const fetchAll = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    const [
      { data: cli },
      { data: cm },
      { data: te },
      { data: pt },
    ] = await Promise.all([
      supabase.from("clientes").select("id, empresa, cnpj").eq("id", clienteId).single(),
      supabase
        .from("compensacoes_mensais")
        .select("*, processos_teses:processo_tese_id(nome_exibicao)")
        .eq("cliente_id", clienteId)
        .order("mes_referencia", { ascending: false }),
      (supabase as any).from("teses_tributarias").select("id, codigo, label").eq("ativo", true),
      supabase.from("processos_teses").select("id, nome_exibicao").eq("cliente_id", clienteId),
    ]);

    setCliente((cli as any) || null);
    const rows: Compensacao[] = ((cm || []) as any[]).map((r) => ({
      ...r,
      tese_label: r.tese_origem_id
        ? (te || []).find((t: any) => t.id === r.tese_origem_id)?.label
        : undefined,
      processo_nome: r.processos_teses?.nome_exibicao,
    }));
    setComps(rows);
    setTeses(((te as any) || []) as TeseCatalog[]);
    setProcessos((pt as any) || []);

    // Fetch DCOMPs for all compensacoes
    const compIds = rows.map((r) => r.id);
    if (compIds.length > 0) {
      const { data: dc } = await (supabase as any)
        .from("dcomps")
        .select("id, compensacao_id, numero_declaracao")
        .in("compensacao_id", compIds);
      const byId: Record<string, Dcomp[]> = {};
      for (const d of (dc || []) as Dcomp[]) {
        (byId[d.compensacao_id] ||= []).push(d);
      }
      setDcompsByCompId(byId);
    } else {
      setDcompsByCompId({});
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filter by competência
  const compsFiltradas = useMemo(() => {
    if (competenciaFilter === "all") return comps;
    return comps.filter((c) => monthKey(c.mes_referencia) === competenciaFilter);
  }, [comps, competenciaFilter]);

  const meses = useMemo(
    () => Array.from(new Set(comps.map((c) => monthKey(c.mes_referencia)))).sort().reverse(),
    [comps]
  );

  // Totais
  const totais = useMemo(() => {
    const porTributo: Record<string, number> = {};
    let compensado = 0;
    let honorarios = 0;
    for (const c of compsFiltradas) {
      const t = c.tributo_enum || c.tributo || "outros";
      porTributo[t] = (porTributo[t] || 0) + Number(c.valor_compensado || 0);
      compensado += Number(c.valor_compensado || 0);
      honorarios += Number(c.honorario_valor || 0);
    }
    return { porTributo, compensado, honorarios };
  }, [compsFiltradas]);

  // Matriz pivot: linhas=meses, colunas=grupos de tributos.
  // Sempre computada a partir de TODOS os `comps` (o filtro de competência
  // faz sentido só na visão linear).
  const pivotData = useMemo(() => {
    // meses = todos os meses únicos presentes
    const mesSet = new Set<string>();
    // cellMap[mes][colKey] = soma valor_compensado
    const cellMap: Record<string, Record<string, number>> = {};
    // hasDcomp[mes][colKey] = true se qualquer comp do bucket tem >= 1 DCOMP
    const hasDcomp: Record<string, Record<string, boolean>> = {};

    for (const c of comps) {
      const mes = monthKey(c.mes_referencia);
      mesSet.add(mes);
      const trib = (c.tributo_enum || c.tributo || "outros") as TributoEnum;
      const col = PIVOT_COLS.find((p) => p.tribs.includes(trib));
      const colKey = col?.key ?? "OUTROS";
      cellMap[mes] ??= {};
      cellMap[mes][colKey] = (cellMap[mes][colKey] || 0) + Number(c.valor_compensado || 0);
      hasDcomp[mes] ??= {};
      const dcCount = (dcompsByCompId[c.id]?.length ?? 0);
      if (dcCount > 0) hasDcomp[mes][colKey] = true;
    }

    const mesesOrdenados = Array.from(mesSet).sort();
    const linhas = mesesOrdenados.map((m) => ({
      mes: m,
      valores: Object.fromEntries(PIVOT_COLS.map((p) => [p.key, cellMap[m]?.[p.key] ?? 0])) as Record<string, number>,
      hasDcomp: Object.fromEntries(PIVOT_COLS.map((p) => [p.key, !!hasDcomp[m]?.[p.key]])) as Record<string, boolean>,
    }));

    // Totais por coluna + total geral por mês + total da coluna outros
    const totaisPorCol = Object.fromEntries(
      PIVOT_COLS.map((p) => [p.key, linhas.reduce((s, l) => s + l.valores[p.key], 0)])
    ) as Record<string, number>;
    const totalGeral = Object.values(totaisPorCol).reduce((a, b) => a + b, 0);

    return { linhas, totaisPorCol, totalGeral };
  }, [comps, dcompsByCompId]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const patchRow = async (id: string, patch: Partial<Compensacao>) => {
    // Optimistic update
    setComps((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await (supabase.from("compensacoes_mensais") as any).update(patch).eq("id", id);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      fetchAll();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("compensacoes_mensais").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Erro ao excluir", { description: error.message });
      return;
    }
    toast.success("Compensação excluída");
    setDeleteTarget(null);
    fetchAll();
  };

  const handleAddRow = async () => {
    if (!clienteId) return;
    // Escolhe mês corrente ou o filtrado
    const hoje = new Date();
    const primeiroDoMes = competenciaFilter !== "all"
      ? `${competenciaFilter}-01`
      : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

    const payload: any = {
      cliente_id: clienteId,
      mes_referencia: primeiroDoMes,
      tributo_enum: "outros",
      valor_compensado: 0,
      lancado_mapa: false,
      status_pagamento_honorario: "pendente",
    };
    const { data, error } = await (supabase.from("compensacoes_mensais") as any).insert(payload).select("*").single();
    if (error || !data) {
      toast.error("Erro ao criar linha", { description: error?.message });
      return;
    }
    toast.success("Nova compensação adicionada");
    setExpandedRow(data.id);
    fetchAll();
  };

  // DCOMP add/remove
  const handleAddDcomp = async (compId: string, numero: string) => {
    if (!DCOMP_REGEX.test(numero)) {
      toast.error("Formato inválido", {
        description: "Esperado XXXXX.XXXXX.XXXXXX.X.X.XX-XXXX",
      });
      return;
    }
    const { error } = await (supabase.from("dcomps") as any).upsert(
      { compensacao_id: compId, numero_declaracao: numero },
      { onConflict: "compensacao_id,numero_declaracao" }
    );
    if (error) {
      toast.error("Erro ao adicionar DCOMP", { description: error.message });
      return;
    }
    fetchAll();
  };

  const handleRemoveDcomp = async (dcompId: string) => {
    const { error } = await (supabase.from("dcomps") as any).delete().eq("id", dcompId);
    if (error) {
      toast.error("Erro ao remover DCOMP", { description: error.message });
      return;
    }
    fetchAll();
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/clientes/${clienteId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao cliente
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold text-navy">Compensações — {cliente.empresa}</h1>
            <p className="text-xs text-muted-foreground">{cliente.cnpj || "sem CNPJ"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Linear vs Matriz mês × tributo */}
          <div className="flex items-center rounded-md border bg-background p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("linear")}
              className={`flex items-center gap-1 px-2 py-1 rounded ${viewMode === "linear" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="Visão linear (uma linha por compensação)"
            >
              <TableIcon className="h-3 w-3" /> Linear
            </button>
            <button
              type="button"
              onClick={() => setViewMode("pivot")}
              className={`flex items-center gap-1 px-2 py-1 rounded ${viewMode === "pivot" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="Matriz mês × tributo"
            >
              <Grid3x3 className="h-3 w-3" /> Matriz
            </button>
          </div>
          {viewMode === "linear" && (
            <Select
              value={competenciaFilter}
              onValueChange={(v) => {
                const p = new URLSearchParams(searchParams);
                if (v === "all") p.delete("competencia");
                else p.set("competencia", v);
                setSearchParams(p);
              }}
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Competência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as competências</SelectItem>
                {meses.map((m) => (
                  <SelectItem key={m} value={m}>
                    {format(new Date(m + "-01"), "MMM/yyyy", { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!readOnly && viewMode === "linear" && (
            <Button size="sm" onClick={handleAddRow}>
              <Plus className="h-4 w-4 mr-1" /> Nova linha
            </Button>
          )}
        </div>
      </div>

      {/* Matriz mês × tributo — visão consolidada por competência */}
      {viewMode === "pivot" && (
        <PivotMatrix data={pivotData} />
      )}

      {/* Totais por tributo */}
      {viewMode === "linear" && compsFiltradas.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(totais.porTributo).map(([trib, valor]) => (
            <Badge
              key={trib}
              variant="outline"
              className={TRIBUTO_COLORS[trib as TributoEnum] || "bg-slate-100 text-slate-800"}
            >
              {trib}: {formatCurrencyBR(valor)}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabela linear */}
      {viewMode === "linear" && (
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8"></TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Processo/Tese</TableHead>
              <TableHead>Tributo</TableHead>
              <TableHead className="text-right">Compensado</TableHead>
              <TableHead className="text-right">Honorário %</TableHead>
              <TableHead className="text-right">Honorário R$</TableHead>
              <TableHead className="text-center">MAPA</TableHead>
              <TableHead className="text-center">DCOMPs</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {compsFiltradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                  Nenhuma compensação {competenciaFilter !== "all" ? "nesta competência" : "registrada"}.
                </TableCell>
              </TableRow>
            ) : (
              compsFiltradas.map((c) => {
                const isExpanded = expandedRow === c.id;
                const dcomps = dcompsByCompId[c.id] || [];
                return (
                  <>
                    <TableRow key={c.id} className="text-xs">
                      <TableCell className="pl-2">
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : c.id)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      </TableCell>
                      <TableCell>
                        {readOnly ? (
                          <span>{format(new Date(c.mes_referencia), "MMM/yyyy", { locale: ptBR })}</span>
                        ) : (
                          <Input
                            type="month"
                            defaultValue={monthKey(c.mes_referencia)}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v && v !== monthKey(c.mes_referencia)) patchRow(c.id, { mes_referencia: `${v}-01` });
                            }}
                            className="h-7 text-xs w-32"
                          />
                        )}
                      </TableCell>
                      <TableCell className="max-w-40 truncate">
                        {readOnly ? (
                          <span>{c.processo_nome || "—"}</span>
                        ) : (
                          <Select
                            value={c.processo_tese_id ?? "__none__"}
                            onValueChange={(v) => patchRow(c.id, { processo_tese_id: v === "__none__" ? null : v })}
                          >
                            <SelectTrigger className="h-7 text-xs w-40">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— nenhum —</SelectItem>
                              {processos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.nome_exibicao}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {readOnly ? (
                          <Badge variant="outline" className={`text-[10px] ${TRIBUTO_COLORS[(c.tributo_enum || "outros") as TributoEnum]}`}>
                            {c.tributo_enum || c.tributo || "outros"}
                          </Badge>
                        ) : (
                          <Select
                            value={c.tributo_enum || "outros"}
                            onValueChange={(v) => patchRow(c.id, { tributo_enum: v as TributoEnum, tributo: v })}
                          >
                            <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TRIBUTOS_ENUM.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberEdit
                          value={c.valor_compensado}
                          onSave={(n) => patchRow(c.id, { valor_compensado: n })}
                          disabled={readOnly}
                          format="brl"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberEdit
                          value={c.honorario_percentual ? c.honorario_percentual * 100 : null}
                          onSave={(n) => patchRow(c.id, { honorario_percentual: n === null ? null : n / 100 })}
                          disabled={readOnly}
                          format="pct"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberEdit
                          value={c.honorario_valor}
                          onSave={(n) => patchRow(c.id, { honorario_valor: n })}
                          disabled={readOnly}
                          format="brl"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={!!c.lancado_mapa}
                          onChange={(e) => patchRow(c.id, { lancado_mapa: e.target.checked })}
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell className="text-center text-[10px] text-muted-foreground">
                        {dcomps.length > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">{dcomps.length}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${c.id}-expanded`} className="bg-muted/30">
                        <TableCell colSpan={10} className="p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <DcompPanel
                              compensacaoId={c.id}
                              dcomps={dcomps}
                              onAdd={(n) => handleAddDcomp(c.id, n)}
                              onRemove={handleRemoveDcomp}
                              readOnly={readOnly}
                            />
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Observação</label>
                              <textarea
                                defaultValue={c.observacao ?? ""}
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  if (v !== (c.observacao ?? "")) patchRow(c.id, { observacao: v });
                                }}
                                rows={4}
                                className="w-full text-xs rounded border border-input bg-background p-2"
                                disabled={readOnly}
                              />
                              <div className="text-[10px] text-muted-foreground">
                                <div>Status pagamento honorário: <strong>{c.status_pagamento_honorario ?? "pendente"}</strong></div>
                                {c.tese_label && <div>Tese origem: {c.tese_label}</div>}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
          {compsFiltradas.length > 0 && (
            <TableFooter>
              <TableRow className="bg-muted/50 text-xs font-semibold">
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right">{formatCurrencyBR(totais.compensado)}</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right">{formatCurrencyBR(totais.honorarios)}</TableCell>
                <TableCell colSpan={3}></TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Compensação de{" "}
                  <strong>{formatCurrencyBR(Number(deleteTarget.valor_compensado || 0))}</strong>{" "}
                  em{" "}
                  <strong>{format(new Date(deleteTarget.mes_referencia), "MMM/yyyy", { locale: ptBR })}</strong>{" "}
                  será removida permanentemente. Todas as DCOMPs vinculadas também serão excluídas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[#c8001e] hover:bg-[#a30019] text-white">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------------------

function NumberEdit({
  value,
  onSave,
  disabled,
  format,
}: {
  value: number | null;
  onSave: (n: number | null) => void;
  disabled?: boolean;
  format: "brl" | "pct";
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(value !== null ? String(value) : "");

  useEffect(() => {
    setRaw(value !== null ? String(value) : "");
  }, [value]);

  if (disabled || !editing) {
    return (
      <button
        className="w-full text-right font-medium text-xs hover:bg-muted rounded px-1.5 py-1"
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
      >
        {value === null || value === 0
          ? "—"
          : format === "brl"
          ? formatCurrencyBR(value)
          : `${value.toFixed(1)}%`}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      type="number"
      step="0.01"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = raw === "" ? null : parseFloat(raw);
        if (n === null || (!isNaN(n) && n !== value)) onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setRaw(value !== null ? String(value) : ""); setEditing(false); }
      }}
      className="h-7 text-xs text-right"
    />
  );
}

function PivotMatrix({
  data,
}: {
  data: {
    linhas: Array<{ mes: string; valores: Record<string, number>; hasDcomp: Record<string, boolean> }>;
    totaisPorCol: Record<string, number>;
    totalGeral: number;
  };
}) {
  if (data.linhas.length === 0) {
    return (
      <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
        Sem compensações registradas ainda. Adicione linhas pela visão Linear.
      </div>
    );
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-32">Competência</TableHead>
            {PIVOT_COLS.map((col) => (
              <TableHead key={col.key} className={`text-right ${col.color}`}>
                {col.label}
              </TableHead>
            ))}
            <TableHead className="text-right font-bold">Total do mês</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.linhas.map((linha) => {
            const totalMes = PIVOT_COLS.reduce((s, c) => s + linha.valores[c.key], 0);
            return (
              <TableRow key={linha.mes} className="text-xs">
                <TableCell className="font-medium">
                  {format(new Date(linha.mes + "-01"), "MMM/yyyy", { locale: ptBR })}
                </TableCell>
                {PIVOT_COLS.map((col) => {
                  const v = linha.valores[col.key];
                  return (
                    <TableCell key={col.key} className="text-right">
                      {v > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {formatCurrencyBR(v)}
                          {linha.hasDcomp[col.key] && (
                            <FileText className="h-3 w-3 text-muted-foreground" aria-label="tem DCOMPs vinculadas" />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-semibold">
                  {formatCurrencyBR(totalMes)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="bg-muted/50 text-xs font-bold">
            <TableCell>Total por tributo</TableCell>
            {PIVOT_COLS.map((col) => (
              <TableCell key={col.key} className="text-right">
                {formatCurrencyBR(data.totaisPorCol[col.key])}
              </TableCell>
            ))}
            <TableCell className="text-right">{formatCurrencyBR(data.totalGeral)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function DcompPanel({
  compensacaoId: _compensacaoId,
  dcomps,
  onAdd,
  onRemove,
  readOnly,
}: {
  compensacaoId: string;
  dcomps: Dcomp[];
  onAdd: (numero: string) => void;
  onRemove: (id: string) => void;
  readOnly: boolean;
}) {
  const [novo, setNovo] = useState("");
  const isValid = DCOMP_REGEX.test(novo);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          DCOMPs vinculadas ({dcomps.length})
        </label>
      </div>
      {dcomps.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Nenhuma DCOMP vinculada.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {dcomps.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs bg-background border rounded px-2 py-1">
              <span className="font-mono flex-1">{d.numero_declaracao}</span>
              {!readOnly && (
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(d.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="XXXXX.XXXXX.XXXXXX.X.X.XX-XXXX"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            className="h-7 text-xs font-mono"
          />
          <Button
            size="sm"
            className="h-7"
            disabled={!isValid}
            onClick={() => {
              onAdd(novo);
              setNovo("");
            }}
          >
            + Adicionar
          </Button>
        </div>
      )}
      {novo && !isValid && (
        <p className="text-[10px] text-destructive">Formato inválido. Esperado: XXXXX.XXXXX.XXXXXX.X.X.XX-XXXX</p>
      )}
    </div>
  );
}
