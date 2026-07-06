import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { toastError } from "@/lib/handle-error";
import { Plus, Pencil, Calculator, AlertTriangle, Clock, ShieldCheck, BarChart3 } from "lucide-react";

interface TeseConfig {
  id: string;
  tese: string;
  nome_exibicao: string;
  descricao_comercial: string | null;
  regimes_elegiveis: string[];
  segmentos_elegiveis: string[];
  tributos: string[];
  percentual_min: number;
  percentual_max: number;
  ativo: boolean;
  ordem_exibicao: number;
  atualizado_em: string;
  atualizado_por: string | null;
}

const REGIMES = [
  { value: "lucro_real", label: "Lucro Real", abbr: "LR" },
  { value: "lucro_presumido", label: "Lucro Presumido", abbr: "LP" },
  { value: "simples", label: "Simples Nacional", abbr: "SN" },
];

const SEGMENTOS = [
  { value: "supermercado", label: "Supermercado" },
  { value: "farmacia", label: "Farmácia" },
  { value: "pet", label: "PET" },
  { value: "materiais_construcao", label: "Mat. Construção" },
  { value: "outros", label: "Outros" },
];

const FATURAMENTO_FAIXAS = [
  { value: "ate_500k", label: "Até R$ 500 mil", midpoint: 250_000 },
  { value: "500k_2m", label: "R$ 500 mil – R$ 2M", midpoint: 1_250_000 },
  { value: "2m_5m", label: "R$ 2M – R$ 5M", midpoint: 3_500_000 },
  { value: "5m_15m", label: "R$ 5M – R$ 15M", midpoint: 10_000_000 },
  { value: "acima_15m", label: "Acima R$ 15M", midpoint: 20_000_000 },
];

const TRIBUTOS = [
  { value: "INSS", label: "INSS" },
  { value: "PIS/COFINS", label: "PIS/COFINS" },
  { value: "IRPJ", label: "IRPJ" },
  { value: "CSLL", label: "CSLL" },
  { value: "ICMS", label: "ICMS" },
  { value: "Outros", label: "Outros" },
];

const TRIBUTO_CHIP_COLORS: Record<string, string> = {
  "INSS": "bg-indigo-600 text-white border-indigo-600",
  "PIS/COFINS": "bg-cyan-700 text-white border-cyan-700",
  "IRPJ": "bg-rose-600 text-white border-rose-600",
  "CSLL": "bg-pink-600 text-white border-pink-600",
  "ICMS": "bg-amber-700 text-white border-amber-700",
  "Outros": "bg-slate-500 text-white border-slate-500",
};

const SEGMENTO_CHIP_COLORS: Record<string, string> = {
  supermercado: "bg-emerald-600 text-white border-emerald-600",
  farmacia: "bg-purple-600 text-white border-purple-600",
  pet: "bg-amber-600 text-white border-amber-600",
  materiais_construcao: "bg-orange-600 text-white border-orange-600",
  outros: "bg-gray-500 text-white border-gray-500",
};

const emptyTese: Omit<TeseConfig, "id" | "atualizado_em" | "atualizado_por"> = {
  tese: "",
  nome_exibicao: "",
  descricao_comercial: "",
  regimes_elegiveis: [],
  segmentos_elegiveis: [],
  tributos: [],
  percentual_min: 0,
  percentual_max: 0,
  ativo: true,
  ordem_exibicao: 0,
};

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString("pt-BR")} mil`;
  return `R$ ${v}`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `há ${diffD} dia${diffD > 1 ? "s" : ""}`;
  const diffM = Math.floor(diffD / 30);
  if (diffM < 12) return `há ${diffM} mês${diffM > 1 ? "es" : ""}`;
  return `há ${Math.floor(diffM / 12)} ano${Math.floor(diffM / 12) > 1 ? "s" : ""}`;
}

export default function MotorConfig() {
  const [teses, setTeses] = useState<TeseConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<Omit<TeseConfig, "id" | "atualizado_em" | "atualizado_por"> & { id?: string }>(emptyTese);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  

  const [simSegmento, setSimSegmento] = useState("supermercado");
  const [simRegime, setSimRegime] = useState("lucro_real");
  const [simFaturamento, setSimFaturamento] = useState("ate_500k");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fetchTeses = async () => {
    const { data, error } = await supabase
      .from("motor_teses_config")
      .select("*")
      .order("ordem_exibicao", { ascending: true });
    if (error) { toastError(error, "Erro ao carregar teses"); setLoading(false); return; }
    // Defensivo: se qualquer array vier null/undefined do banco, coerce pra []
    // (evita crash em `.includes()`/`.map()` no simulador e nas cells).
    setTeses((data as any[] || []).map((d) => ({
      ...d,
      percentual_min: Number(d.percentual_min ?? 0),
      percentual_max: Number(d.percentual_max ?? 0),
      regimes_elegiveis: Array.isArray(d.regimes_elegiveis) ? d.regimes_elegiveis : [],
      segmentos_elegiveis: Array.isArray(d.segmentos_elegiveis) ? d.segmentos_elegiveis : [],
      tributos: Array.isArray(d.tributos) ? d.tributos : [],
    })));
    setLoading(false);
  };

  useEffect(() => { fetchTeses(); }, []);

  const midpoint = FATURAMENTO_FAIXAS.find((f) => f.value === simFaturamento)?.midpoint || 1_000_000;

  const simulation = useMemo(() => {
    const eligible = teses.filter(
      (t) => t.ativo && t.regimes_elegiveis.includes(simRegime) && t.segmentos_elegiveis.includes(simSegmento)
    );
    const totalMin = eligible.reduce((s, t) => s + Math.round(midpoint * 60 * t.percentual_min), 0);
    const totalMax = eligible.reduce((s, t) => s + Math.round(midpoint * 60 * t.percentual_max), 0);
    const multMin = midpoint > 0 ? totalMin / midpoint : 0;
    const multMax = midpoint > 0 ? totalMax / midpoint : 0;
    return { eligible: eligible.length, totalMin, totalMax, multMin, multMax };
  }, [teses, simSegmento, simRegime, midpoint]);

  // Coverage grid
  const coverageGrid = useMemo(() => {
    const grid: Record<string, Record<string, { count: number; teses: string[] }>> = {};
    for (const s of SEGMENTOS) {
      grid[s.value] = {};
      for (const r of REGIMES) {
        const matching = teses.filter(
          (t) => t.ativo && t.regimes_elegiveis.includes(r.value) && t.segmentos_elegiveis.includes(s.value)
        );
        grid[s.value][r.value] = { count: matching.length, teses: matching.map((t) => t.nome_exibicao) };
      }
    }
    return grid;
  }, [teses]);

  const uncoveredCount = useMemo(() => {
    let count = 0;
    for (const s of SEGMENTOS) {
      for (const r of REGIMES) {
        if ((coverageGrid[s.value]?.[r.value]?.count || 0) === 0) count++;
      }
    }
    return count;
  }, [coverageGrid]);

  

  const activeTesesCount = teses.filter(t => t.ativo).length;

  const lastUpdate = useMemo(() => {
    if (teses.length === 0) return null;
    const dates = teses.map(t => new Date(t.atualizado_em).getTime());
    return new Date(Math.max(...dates)).toISOString();
  }, [teses]);

  const inlineSave = useCallback(async (id: string, fields: Record<string, any>) => {
    const { error } = await supabase.from("motor_teses_config").update({
      ...fields,
      atualizado_em: new Date().toISOString(),
      atualizado_por: userId,
    }).eq("id", id);
    if (error) { toastError(error, "Erro ao salvar configuração"); return; }
    fetchTeses();
  }, [userId]);

  const toggleArrayField = useCallback(async (t: TeseConfig, field: "regimes_elegiveis" | "segmentos_elegiveis", item: string) => {
    const arr = t[field];
    const updated = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
    await inlineSave(t.id, { [field]: updated });
  }, [inlineSave]);

  const toggleAtivo = async (t: TeseConfig) => {
    await inlineSave(t.id, { ativo: !t.ativo });
  };

  const openCreate = () => {
    setEditData({ ...emptyTese });
    setEditOpen(true);
  };

  const openEdit = (t: TeseConfig) => {
    setEditData({
      id: t.id,
      tese: t.tese,
      nome_exibicao: t.nome_exibicao,
      descricao_comercial: t.descricao_comercial || "",
      regimes_elegiveis: [...t.regimes_elegiveis],
      segmentos_elegiveis: [...t.segmentos_elegiveis],
      tributos: [...(t.tributos || [])],
      percentual_min: t.percentual_min,
      percentual_max: t.percentual_max,
      ativo: t.ativo,
      ordem_exibicao: t.ordem_exibicao,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editData.tese || !editData.nome_exibicao) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      tese: editData.tese,
      nome_exibicao: editData.nome_exibicao,
      descricao_comercial: editData.descricao_comercial || null,
      regimes_elegiveis: editData.regimes_elegiveis,
      segmentos_elegiveis: editData.segmentos_elegiveis,
      tributos: editData.tributos,
      percentual_min: editData.percentual_min,
      percentual_max: editData.percentual_max,
      ativo: editData.ativo,
      ordem_exibicao: editData.ordem_exibicao,
      atualizado_em: new Date().toISOString(),
      atualizado_por: userId,
    };

    let error;
    if (editData.id) {
      ({ error } = await supabase.from("motor_teses_config").update(payload).eq("id", editData.id));
    } else {
      ({ error } = await supabase.from("motor_teses_config").insert(payload));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tese salva com sucesso" });
      setEditOpen(false);
      fetchTeses();
    }
    setSaving(false);
  };

  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  if (loading) return <div className="p-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-bold text-navy">Motor de Cálculo</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">teses, percentuais e cobertura por perfil</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#0a1a6e] text-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-4 w-4 text-blue-300" />
            <span className="text-xs font-medium text-blue-200">Teses Ativas</span>
          </div>
          <p className="text-3xl font-bold">{activeTesesCount}</p>
          <p className="text-xs text-blue-300 mt-0.5">de {teses.length} configuradas</p>
        </div>
        <div className="rounded-xl bg-[#0a1a6e] text-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-blue-300" />
            <span className="text-xs font-medium text-blue-200">Perfis Cobertos</span>
          </div>
          <p className="text-3xl font-bold">{15 - uncoveredCount} <span className="text-lg font-normal text-blue-300">/ 15</span></p>
          <p className="text-xs text-blue-300 mt-0.5">combinações regime × segmento</p>
        </div>
        <div className="rounded-xl bg-[#0a1a6e] text-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-blue-300" />
            <span className="text-xs font-medium text-blue-200">Última Atualização</span>
          </div>
          <p className="text-3xl font-bold">{lastUpdate ? timeAgo(lastUpdate) : "—"}</p>
          <p className="text-xs text-blue-300 mt-0.5">{lastUpdate ? new Date(lastUpdate).toLocaleDateString("pt-BR") : ""}</p>
        </div>
      </div>

      {/* Alert banner */}
      {uncoveredCount > 0 && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-800 dark:text-amber-200 text-sm">
              <strong>{uncoveredCount} combinação{uncoveredCount > 1 ? "ões" : ""}</strong> sem cobertura — leads com esse perfil receberão diagnóstico vazio.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Simulator — compact inline */}
      <div className="rounded-xl bg-muted/50 border px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5" /> Simulador ao vivo
          </span>
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <Select value={simSegmento} onValueChange={setSimSegmento}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEGMENTOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={simRegime} onValueChange={setSimRegime}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={simFaturamento} onValueChange={setSimFaturamento}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FATURAMENTO_FAIXAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm font-semibold text-foreground whitespace-nowrap">
            Estimativa: {formatCurrency(simulation.totalMin)} → {formatCurrency(simulation.totalMax)}
            <span className="text-muted-foreground font-normal ml-2">
              · {simulation.multMin.toFixed(1)}–{simulation.multMax.toFixed(1)}× fat. mensal
            </span>
          </div>
        </div>
      </div>

      {/* Teses Table */}
      <Card className="card-base">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-sm font-semibold">Teses Configuradas ({teses.length})</CardTitle>
          <Button size="sm" onClick={openCreate} className="h-7 text-xs"><Plus className="h-3.5 w-3.5 mr-1" /> Nova tese</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-8 pl-4">#</TableHead>
                  <TableHead>Nome da Tese</TableHead>
                  <TableHead>Regimes</TableHead>
                  <TableHead>Segmentos</TableHead>
                  <TableHead>Tributos</TableHead>
                  <TableHead className="text-right w-[80px]">% Mín</TableHead>
                  <TableHead className="text-right w-[80px]">% Máx</TableHead>
                  <TableHead className="text-center w-[60px]">Ativo</TableHead>
                  <TableHead className="w-[100px]">Última edição</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teses.map((t, idx) => (
                  <TeseRow
                    key={t.id}
                    index={idx + 1}
                    tese={t}
                    onToggleAtivo={() => toggleAtivo(t)}
                    onToggleRegime={(r) => toggleArrayField(t, "regimes_elegiveis", r)}
                    onToggleSegmento={(s) => toggleArrayField(t, "segmentos_elegiveis", s)}
                    onInlineSave={inlineSave}
                    onEdit={() => openEdit(t)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resumo de Cobertura */}
      <Card className="card-base">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">Resumo de Cobertura</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Resumo por Regime */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Resumo por Regime</h4>
              <div className="grid grid-cols-3 gap-2">
                {REGIMES.map((r) => {
                  const count = teses.filter(t => t.ativo && t.regimes_elegiveis.includes(r.value)).length;
                  return (
                    <div key={r.value} className="rounded-lg border bg-card p-3 text-center">
                      <span className="text-2xl font-bold text-foreground">{count}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.abbr}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumo por Segmento */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Resumo por Segmento</h4>
              <div className="space-y-2">
                {SEGMENTOS.map((s) => {
                  const count = teses.filter(t => t.ativo && t.segmentos_elegiveis.includes(s.value)).length;
                  const total = teses.filter(t => t.ativo).length || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={s.value} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-foreground w-24 shrink-0">{s.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-foreground w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit/Create Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editData.id ? "Editar Tese" : "Nova Tese"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Identificador (slug)</Label>
                <Input value={editData.tese} onChange={(e) => setEditData({ ...editData, tese: e.target.value })} placeholder="pis_cofins_insumos" />
              </div>
              <div>
                <Label>Ordem de exibição</Label>
                <Input type="number" value={editData.ordem_exibicao} onChange={(e) => setEditData({ ...editData, ordem_exibicao: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Nome de exibição</Label>
              <Input value={editData.nome_exibicao} onChange={(e) => setEditData({ ...editData, nome_exibicao: e.target.value })} placeholder="PIS/COFINS Insumos" />
            </div>
            <div>
              <Label>Descrição comercial</Label>
              <Textarea value={editData.descricao_comercial || ""} onChange={(e) => setEditData({ ...editData, descricao_comercial: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>% Mínimo (decimal)</Label>
                <Input type="number" step="0.0001" value={editData.percentual_min} onChange={(e) => setEditData({ ...editData, percentual_min: Number(e.target.value) })} />
                <span className="text-xs text-muted-foreground">{(editData.percentual_min * 100).toFixed(2)}%</span>
              </div>
              <div>
                <Label>% Máximo (decimal)</Label>
                <Input type="number" step="0.0001" value={editData.percentual_max} onChange={(e) => setEditData({ ...editData, percentual_max: Number(e.target.value) })} />
                <span className="text-xs text-muted-foreground">{(editData.percentual_max * 100).toFixed(2)}%</span>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Regimes elegíveis</Label>
              <div className="flex flex-wrap gap-3">
                {REGIMES.map((r) => (
                  <label key={r.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={editData.regimes_elegiveis.includes(r.value)}
                      onCheckedChange={() => setEditData({ ...editData, regimes_elegiveis: toggleArrayItem(editData.regimes_elegiveis, r.value) })}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Segmentos elegíveis</Label>
              <div className="flex flex-wrap gap-3">
                {SEGMENTOS.map((s) => (
                  <label key={s.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={editData.segmentos_elegiveis.includes(s.value)}
                      onCheckedChange={() => setEditData({ ...editData, segmentos_elegiveis: toggleArrayItem(editData.segmentos_elegiveis, s.value) })}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Tributos cobertos</Label>
              <div className="flex flex-wrap gap-3">
                {TRIBUTOS.map((t) => (
                  <label key={t.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={editData.tributos.includes(t.value)}
                      onCheckedChange={() => setEditData({ ...editData, tributos: toggleArrayItem(editData.tributos, t.value) })}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Uma tese pode cobrir mais de um tributo (ex: Subvenção ICMS → IRPJ + CSLL).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Inline-editable row component ─── */
function TeseRow({
  index,
  tese: t,
  onToggleAtivo,
  onToggleRegime,
  onToggleSegmento,
  onInlineSave,
  onEdit,
}: {
  index: number;
  tese: TeseConfig;
  onToggleAtivo: () => void;
  onToggleRegime: (r: string) => void;
  onToggleSegmento: (s: string) => void;
  onInlineSave: (id: string, fields: Record<string, any>) => Promise<void>;
  onEdit: () => void;
}) {
  const [minVal, setMinVal] = useState(String((t.percentual_min * 100).toFixed(2)));
  const [maxVal, setMaxVal] = useState(String((t.percentual_max * 100).toFixed(2)));

  useEffect(() => {
    setMinVal(String((t.percentual_min * 100).toFixed(2)));
    setMaxVal(String((t.percentual_max * 100).toFixed(2)));
  }, [t.percentual_min, t.percentual_max]);

  const saveMin = () => {
    const v = parseFloat(minVal) / 100;
    if (!isNaN(v) && v !== t.percentual_min) onInlineSave(t.id, { percentual_min: v });
  };
  const saveMax = () => {
    const v = parseFloat(maxVal) / 100;
    if (!isNaN(v) && v !== t.percentual_max) onInlineSave(t.id, { percentual_max: v });
  };

  return (
    <TableRow className={`${!t.ativo ? "opacity-40" : ""} cursor-pointer hover:bg-muted/50`} onClick={onEdit}>
      <TableCell className="pl-4 text-xs text-muted-foreground font-mono">{index}</TableCell>
      <TableCell className="font-medium max-w-[180px]">
        <div className="truncate text-sm">{t.nome_exibicao}</div>
        <div className="text-[10px] text-muted-foreground truncate">{t.tese}</div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-0.5">
          {REGIMES.map((r) => {
            const active = t.regimes_elegiveis.includes(r.value);
            return (
              <span
                key={r.value}
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold cursor-pointer select-none transition-opacity ${
                  active ? REGIME_CHIP_COLORS[r.value] : "bg-muted text-muted-foreground opacity-30"
                }`}
                onClick={() => onToggleRegime(r.value)}
              >
                {r.abbr}
              </span>
            );
          })}
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-0.5">
          {SEGMENTOS.map((s) => {
            const active = t.segmentos_elegiveis.includes(s.value);
            return (
              <span
                key={s.value}
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold cursor-pointer select-none transition-opacity ${
                  active ? SEGMENTO_CHIP_COLORS[s.value] : "bg-muted text-muted-foreground opacity-30"
                }`}
                onClick={() => onToggleSegmento(s.value)}
              >
                {s.label.slice(0, 3)}
              </span>
            );
          })}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-0.5 max-w-[140px]">
          {(t.tributos || []).length === 0 ? (
            <span className="text-[10px] text-muted-foreground italic">—</span>
          ) : (
            (t.tributos || []).map((trib) => (
              <span
                key={trib}
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  TRIBUTO_CHIP_COLORS[trib] || "bg-slate-500 text-white"
                }`}
              >
                {trib}
              </span>
            ))
          )}
        </div>
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <Input
          type="number"
          step="0.01"
          value={minVal}
          onChange={(e) => setMinVal(e.target.value)}
          onBlur={saveMin}
          className="w-16 text-right text-xs h-7 ml-auto"
        />
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <Input
          type="number"
          step="0.01"
          value={maxVal}
          onChange={(e) => setMaxVal(e.target.value)}
          onBlur={saveMax}
          className="w-16 text-right text-xs h-7 ml-auto"
        />
      </TableCell>
      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
        <Switch checked={t.ativo} onCheckedChange={onToggleAtivo} className="scale-75" />
      </TableCell>
      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
        {timeAgo(t.atualizado_em)}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Button size="icon" variant="ghost" onClick={onEdit} className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
      </TableCell>
    </TableRow>
  );
}
