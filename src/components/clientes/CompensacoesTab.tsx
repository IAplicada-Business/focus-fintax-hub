import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  invalidateClienteOperacional,
  useClienteCompensacoes,
  useClienteCreditos,
  useClienteProcessos,
  useTesesTributarias,
} from "@/hooks/data/useClienteOperacional";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { MonthPicker } from "@/components/ui/month-picker";
import { parseMoneyBR } from "@/lib/money-mask";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText, MessageCircle, Printer, Copy, Mail, Trash2, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  formatCurrencyBR,
  formatCompetenciaPT,
  getStatusPagamentoConfig,
  isReportoCompensacao,
  sumCompensadoCanonical,
  filterCompsForTese,
  STATUS_PAGAMENTO,
} from "@/lib/clientes-constants";
import logoFintax from "@/assets/logo-focus-fintax-cropped.svg";
import { logClienteHistorico } from "@/lib/cliente-historico";
import { exportElementToPdf, sanitizePdfFileName } from "@/lib/export-element-pdf";

const TRIBUTO_OPTIONS = ["INSS", "INSS_retidos", "PIS", "COFINS", "ICMS", "IRPJ/CSLL", "Outros"];
const TRIBUTO_TO_ENUM: Record<string, string> = {
  INSS: "INSS_52",
  INSS_retidos: "INSS_retidos",
  PIS: "PIS",
  COFINS: "COFINS",
  ICMS: "ICMS",
  "IRPJ/CSLL": "IRPJ_CSLL_agregado",
  Outros: "outros",
};
const ENUM_TO_TRIBUTO: Record<string, string> = {
  INSS_52: "INSS",
  INSS_retidos: "INSS_retidos",
  PIS: "PIS",
  COFINS: "COFINS",
  ICMS: "ICMS",
  IRPJ_CSLL_agregado: "IRPJ/CSLL",
  outros: "Outros",
};
const EMPTY_FORM = {
  processo_tese_id: "",
  mes_referencia: "",
  valor_compensado: "",
  status_pagamento: "pendente",
  valor_nf_servico: "",
  honorario_percentual: "",
  observacao: "",
  tributo: "",
};
const MESES_PT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function resolveTributoLabel(c: any): string {
  const raw = (c?.tributo as string) || "";
  if (raw && TRIBUTO_OPTIONS.includes(raw)) return raw;
  const fromEnum = ENUM_TO_TRIBUTO[(c?.tributo_enum as string) || raw] || "";
  if (fromEnum) return fromEnum;
  return raw;
}

interface Props {
  clienteId: string;
  cliente?: { empresa: string; cnpj: string };
  onTotalChange?: (total: number) => void;
  onCompensacoesChanged?: () => void;
}

export function CompensacoesTab({ clienteId, cliente, onTotalChange, onCompensacoesChanged }: Props) {
  const qc = useQueryClient();
  const compsQ = useClienteCompensacoes(clienteId);
  const processosQ = useClienteProcessos(clienteId);
  const tesesQ = useTesesTributarias();
  const creditosQ = useClienteCreditos(clienteId);

  const [compensacoes, setCompensacoes] = useState<any[]>([]);
  const [processos, setProcessos] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTese, setFilterTese] = useState("all");
  const [mesInicio, setMesInicio] = useState("");
  const [mesFim, setMesFim] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Mapa Tributário state
  const [mapaOpen, setMapaOpen] = useState(false);
  const [mapaMes, setMapaMes] = useState("");
  const [mapaTese, setMapaTese] = useState("all");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // WhatsApp state
  const [whatsOpen, setWhatsOpen] = useState(false);
  const [whatsMes, setWhatsMes] = useState("");

  const teses = tesesQ.data ?? [];
  const creditos = creditosQ.data ?? [];

  const fetchData = async () => {
    await invalidateClienteOperacional(qc, clienteId);
  };

  useEffect(() => {
    if (compsQ.data) setCompensacoes(compsQ.data);
  }, [compsQ.data]);

  useEffect(() => {
    if (processosQ.data) setProcessos(processosQ.data);
  }, [processosQ.data]);

  const teseIdByCodigo = useMemo(() => {
    const idByCod: Record<string, string> = {};
    for (const t of teses) {
      if (t.codigo) idByCod[t.codigo.toUpperCase()] = t.id;
    }
    return idByCod;
  }, [teses]);

  const creditoByCodigo = useMemo(() => {
    const credByCod: Record<string, number> = {};
    for (const c of creditos) {
      const codigo = Object.entries(teseIdByCodigo).find(([, id]) => id === c.tese_id)?.[0];
      if (codigo) credByCod[codigo] = Number(c.valor_apurado_inicial || 0);
    }
    return credByCod;
  }, [creditos, teseIdByCodigo]);

  const loading = compsQ.isPending && compsQ.data === undefined;

  useEffect(() => {
    const reportoTeseIds = new Set(
      teses.filter((t) => (t.codigo || "").toUpperCase() === "REPORTO").map((t) => t.id),
    );
    const reportoProcessoIds = new Set(
      processos.filter((p: { tese?: string }) => p.tese === "REPORTO").map((p: { id: string }) => p.id),
    );
    onTotalChange?.(sumCompensadoCanonical(compensacoes, { reportoTeseIds, reportoProcessoIds }));
  }, [compensacoes, processos, teses, onTotalChange]);

  const filtered = compensacoes.filter((c) => {
    if (filterTese !== "all" && c.processo_tese_id !== filterTese) return false;
    const mes = (c.mes_referencia as string).slice(0, 7);
    if (mesInicio && mes < mesInicio) return false;
    if (mesFim && mes > mesFim) return false;
    return true;
  });
  const reportoTeseIds = new Set(
    Object.entries(teseIdByCodigo)
      .filter(([codigo]) => codigo === "REPORTO")
      .map(([, id]) => id),
  );
  const reportoProcessoIds = new Set(
    processos.filter((p) => p.tese === "REPORTO").map((p) => p.id),
  );
  // Total da tabela = mesmo critério do card Total Compensado
  const totalFiltered = sumCompensadoCanonical(filtered, { reportoTeseIds, reportoProcessoIds });
  const totalHonorariosFiltered = filtered
    .filter((c) => !isReportoCompensacao(c, { reportoTeseIds, reportoProcessoIds }))
    .reduce((s, c) => s + Number(c.honorario_valor ?? c.valor_nf_servico ?? 0), 0);

  const selectedProc = processos.find((p) => p.id === form.processo_tese_id);
  const percHonorario = form.honorario_percentual !== ""
    ? Number(form.honorario_percentual) / 100
    : Number(selectedProc?.percentual_honorario || 0);
  const honorarioAuto = Math.round(parseMoneyBR(form.valor_compensado) * percHonorario * 100) / 100;

  // Available months
  const availableMonths = [...new Set(compensacoes.map((c) => (c.mes_referencia as string).slice(0, 7)))].sort().reverse();

  const resetFormModal = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const openCreateModal = () => {
    resetFormModal();
    setModalOpen(true);
  };

  const openEditModal = (c: any) => {
    const percStored = Number(c.honorario_percentual ?? 0);
    const honorarioStored = Number(c.honorario_valor ?? c.valor_nf_servico ?? 0);
    setEditingId(c.id);
    setForm({
      processo_tese_id: c.processo_tese_id || "",
      mes_referencia: (c.mes_referencia as string)?.slice(0, 7) || "",
      valor_compensado: c.valor_compensado != null ? String(c.valor_compensado) : "",
      status_pagamento: c.status_pagamento || "pendente",
      valor_nf_servico: honorarioStored > 0 ? String(honorarioStored) : "",
      honorario_percentual: percStored > 0 ? String(Math.round(percStored * 1000) / 10) : "",
      observacao: c.observacao || "",
      tributo: resolveTributoLabel(c),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.processo_tese_id || !form.mes_referencia) {
      toast.error("Processo e mês são obrigatórios.");
      return;
    }
    const valorComp = parseMoneyBR(form.valor_compensado);
    const honorarioValor = form.valor_nf_servico !== ""
      ? parseMoneyBR(form.valor_nf_servico)
      : honorarioAuto;
    const procSel = processos.find((p) => p.id === form.processo_tese_id);
    const [{ data: cli }, { data: teseRow }] = await Promise.all([
      supabase.from("clientes").select("tese_ativa_id").eq("id", clienteId).maybeSingle(),
      procSel?.tese
        ? (supabase as any)
            .from("teses_tributarias")
            .select("id")
            .eq("codigo", procSel.tese)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const teseOrigemId =
      (teseRow as { id?: string } | null)?.id
      ?? (cli as { tese_ativa_id?: string } | null)?.tese_ativa_id
      ?? null;
    const payload = {
      processo_tese_id: form.processo_tese_id,
      mes_referencia: form.mes_referencia + "-01",
      valor_compensado: valorComp,
      status_pagamento: form.status_pagamento,
      valor_nf_servico: honorarioValor,
      honorario_valor: honorarioValor,
      honorario_percentual: percHonorario || null,
      observacao: form.observacao,
      tributo: form.tributo || null,
      tributo_enum: (TRIBUTO_TO_ENUM[form.tributo] || "outros") as any,
      tese_origem_id: teseOrigemId,
    };

    if (editingId) {
      const { error } = await supabase
        .from("compensacoes_mensais")
        .update(payload as any)
        .eq("id", editingId);
      if (error) { toast.error("Erro ao atualizar."); return; }
      toast.success("Compensação atualizada!");
      const proc = processos.find((p) => p.id === form.processo_tese_id);
      logClienteHistorico(
        clienteId,
        "compensacao_editada",
        `Compensação editada ${form.mes_referencia} — ${proc?.nome_exibicao || ""}: ${formatCurrencyBR(valorComp)}`,
      );
    } else {
      const { error } = await supabase.from("compensacoes_mensais").insert({
        cliente_id: clienteId,
        ...payload,
      } as any);
      if (error) { toast.error("Erro ao registrar."); return; }
      toast.success("Compensação registrada!");
      const proc = processos.find((p) => p.id === form.processo_tese_id);
      logClienteHistorico(clienteId, "compensacao_adicionada", `Compensação ${form.mes_referencia} — ${proc?.nome_exibicao || ""}: ${formatCurrencyBR(valorComp)}`);
    }
    setModalOpen(false);
    resetFormModal();
    await fetchData();
    onCompensacoesChanged?.();
  };

  // ——— Mapa Tributário helpers ———
  // Inclui órfãs (processo/tese nulos) pela inferência de tributo — senão o saldo
  // fica inflado (ex.: Pérola só subtraindo o mês com processo linkado).
  const compsForProcesso = (proc: { id: string; tese?: string | null }) => {
    const codigo = String(proc.tese || "").toUpperCase();
    return filterCompsForTese(compensacoes, {
      teseCodigo: codigo,
      teseId: teseIdByCodigo[codigo] || null,
      processoIds: new Set([proc.id]),
    });
  };

  const tesesMapaOptions = processos
    .filter((p) => String(p.tese || "").toUpperCase() !== "REPORTO")
    .reduce<{ codigo: string; label: string }[]>((acc, p) => {
      const codigo = String(p.tese || "").toUpperCase();
      if (!codigo || acc.some((t) => t.codigo === codigo)) return acc;
      acc.push({ codigo, label: p.nome_exibicao || p.tese });
      return acc;
    }, []);
  const mapaTeseLabel =
    mapaTese === "all"
      ? "Todas as teses"
      : tesesMapaOptions.find((t) => t.codigo === mapaTese)?.label || mapaTese;

  const mesProcessos = processos.filter((p) => {
    if (!mapaMes) return false;
    const codigo = String(p.tese || "").toUpperCase();
    if (!codigo || codigo === "REPORTO") return false;
    if (mapaTese !== "all" && codigo !== mapaTese) return false;
    return compsForProcesso(p).some((c) => String(c.mes_referencia || "").startsWith(mapaMes));
  });

  const formatMesPT = (mesStr: string) => {
    const [y, m] = mesStr.split("-");
    return `${MESES_PT[parseInt(m, 10) - 1]}/${y}`;
  };

  const getCompensacoesAteOmes = (proc: { id: string; tese?: string | null }, mesRef: string) => {
    return compsForProcesso(proc)
      .filter((c) => String(c.mes_referencia || "").slice(0, 7) <= mesRef)
      .reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
  };

  const creditoProcesso = (proc: { id: string; tese?: string | null; valor_credito?: number | null }) => {
    const codigo = String(proc.tese || "").toUpperCase();
    const fromDetalhe = creditoByCodigo[codigo];
    if (fromDetalhe != null && fromDetalhe > 0) return fromDetalhe;
    return Number(proc.valor_credito || 0);
  };

  const getTributo = (c: any) => (c as any).tributo || c.observacao || "INSS";

  const isSubvencao = (tese: string) => tese?.toLowerCase().includes("subven");

  // ——— WhatsApp helpers ———
  const whatsComps = whatsMes ? compensacoes.filter((c) => (c.mes_referencia as string).startsWith(whatsMes)) : [];

  const resolveHonorario = (comp: any, proc: any) => {
    // Prefere valor já salvo (evita retrabalho / divergência do comunicado)
    if (comp.honorario_valor != null && Number(comp.honorario_valor) > 0) {
      return Number(comp.honorario_valor);
    }
    if (comp.valor_nf_servico != null && Number(comp.valor_nf_servico) > 0) {
      return Number(comp.valor_nf_servico);
    }
    const perc = Number(comp.honorario_percentual ?? proc?.percentual_honorario ?? 0);
    return Math.round(Number(comp.valor_compensado || 0) * perc * 100) / 100;
  };

  const resolvePercLabel = (comp: any, proc: any) => {
    const perc = Number(comp.honorario_percentual ?? proc?.percentual_honorario ?? 0);
    return `${(perc * 100).toFixed(perc * 100 % 1 === 0 ? 0 : 1)}%`;
  };

  const buildWhatsMessage = (comp: any, proc: any) => {
    const honorario = resolveHonorario(comp, proc);
    const economia = Number(comp.valor_compensado || 0) - honorario;
    const tributo = getTributo(comp);
    const mesLabel = formatMesPT(whatsMes);
    const percLabel = resolvePercLabel(comp, proc);

    return `${cliente?.empresa || ""} ${cliente?.cnpj || ""}
Prestação de serviços de COMPLIANCE TRIBUTÁRIO – ${proc.nome_exibicao}
${tributo} – ${formatCurrencyBR(Number(comp.valor_compensado || 0))}
Valor utilizado como compensação no mês: ${formatCurrencyBR(Number(comp.valor_compensado || 0))}
Honorários na razão de ${percLabel}
Valor: ${formatCurrencyBR(honorario)}
Competência: ${mesLabel}
ECONOMIA NO MÊS: ${formatCurrencyBR(economia)}
Pix: financeiro@focusfintax.com.br
Quaisquer dúvidas estamos à disposição,
Equipe Focus.`;
  };

  const fullWhatsMessage = whatsComps.map((comp) => {
    const proc = processos.find((p) => p.id === comp.processo_tese_id);
    if (!proc) return "";
    return buildWhatsMessage(comp, proc);
  }).filter(Boolean).join("\n\n---\n\n");

  const totalHonorarios = whatsComps.reduce((s, comp) => {
    const proc = processos.find((p) => p.id === comp.processo_tese_id);
    return s + resolveHonorario(comp, proc);
  }, 0);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullWhatsMessage);
    toast.success("Copiado!");
    logClienteHistorico(clienteId, "comunicado_enviado", `Comunicado WhatsApp copiado — ${formatMesPT(whatsMes)}`);
  };

  const handleEmail = () => {
    const mesLabel = formatMesPT(whatsMes);
    const subject = encodeURIComponent(`Compensação Tributária ${mesLabel} — ${cliente?.empresa || ""}`);
    const body = encodeURIComponent(fullWhatsMessage);
    window.open(`mailto:?subject=${subject}&body=${body}`);
    logClienteHistorico(clienteId, "comunicado_enviado", `Comunicado por e-mail — ${mesLabel}`);
  };

  // ——— Download PDF do Mapa Tributário ———
  // Captura via clone fora do Dialog (Radix usa transform, que quebra html2canvas).
  const handleDownloadMapaPdf = async () => {
    const element = document.getElementById("mapa-tributario-pdf") as HTMLElement | null;
    if (!element || downloadingPdf) return;
    if (!mapaMes) {
      toast.error("Selecione um mês antes de gerar o PDF.");
      return;
    }
    if (mesProcessos.length === 0) {
      toast.error("Sem processos para este mês", {
        description: "Não há compensações vinculadas a processos neste mês — o PDF sairia vazio.",
      });
      return;
    }

    setDownloadingPdf(true);
    try {
      const razao = sanitizePdfFileName(cliente?.empresa || "");
      const comp = mapaMes.replace(/-/g, "");
      const teseSlug = mapaTese === "all" ? "geral" : sanitizePdfFileName(mapaTese);
      await exportElementToPdf(element, `MapaTributario_${razao}_${teseSlug}_${comp}`);
      toast.success("PDF gerado com sucesso!");
      logClienteHistorico(
        clienteId,
        "mapa_tributario_exportado",
        `Mapa Tributário exportado em PDF — ${mapaTeseLabel} · competência ${formatMesPT(mapaMes)}`,
      );
    } catch (err) {
      console.error("Erro ao gerar PDF do Mapa Tributário:", err);
      const msg = err instanceof Error ? err.message : "Falha desconhecida ao capturar o mapa.";
      toast.error("Erro ao gerar PDF", {
        description: `${msg} Como fallback, use Ctrl+P no navegador.`,
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Tese</span>
            <Select value={filterTese} onValueChange={setFilterTese}>
              <SelectTrigger className="h-8 w-[13rem] text-xs">
                <SelectValue placeholder="Todas as teses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as teses</SelectItem>
                {processos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome_exibicao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Período</span>
            <MonthPicker
              aria-label="Período de"
              value={mesInicio}
              onChange={setMesInicio}
              placeholder="mês/ano"
            />
            <span className="text-[11px] text-ink-35">até</span>
            <MonthPicker
              aria-label="Período até"
              value={mesFim}
              onChange={setMesFim}
              placeholder="mês/ano"
            />
            {(mesInicio || mesFim) && (
              <button
                type="button"
                className="text-xs text-primary underline"
                onClick={() => { setMesInicio(""); setMesFim(""); }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setMapaMes(""); setMapaTese("all"); setMapaOpen(true); }}>
            <FileText className="h-4 w-4 mr-1" /> Mapa Tributário
          </Button>
          <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => { setWhatsMes(""); setWhatsOpen(true); }}>
            <MessageCircle className="h-4 w-4 mr-1" /> Comunicado WhatsApp
          </Button>
          <Button size="sm" onClick={openCreateModal}><Plus className="h-4 w-4 mr-1" /> Registrar compensação</Button>
        </div>
      </div>

      <Table>
         <TableHeader>
          <TableRow>
            <TableHead>Mês Ref.</TableHead>
            <TableHead>Tese</TableHead>
            <TableHead>Tributo</TableHead>
            <TableHead>Valor Compensado</TableHead>
            <TableHead>%</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>Honorários</TableHead>
            <TableHead>Obs.</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
          ) : filtered.length === 0 ? (
            <TableRow><TableCell colSpan={9}><EmptyState icon={<FileText size={20} className="text-ink-35" />} title="Nenhuma compensação registrada" subtitle="Clique em + Nova Compensação para começar." /></TableCell></TableRow>
          ) : filtered.map((c) => {
            const sp = getStatusPagamentoConfig(c.status_pagamento);
            const perc = Number((c as any).honorario_percentual ?? 0);
            const percLabel = perc > 0 ? `${(perc * 100).toFixed(perc * 100 % 1 === 0 ? 0 : 1)}%` : "—";
            return (
              <TableRow key={c.id}>
                <TableCell>{formatCompetenciaPT(c.mes_referencia as string)}</TableCell>
                <TableCell>{c.processos_teses?.nome_exibicao || "—"}</TableCell>
                <TableCell className="text-xs">{(c as any).tributo || "—"}</TableCell>
                <TableCell className="font-medium">{formatCurrencyBR(Number(c.valor_compensado || 0))}</TableCell>
                <TableCell className="text-xs">{percLabel}</TableCell>
                <TableCell>
                  <Select
                    value={c.status_pagamento || "pendente"}
                    onValueChange={async (v) => {
                      const prev = c.status_pagamento;
                      setCompensacoes((cs) => cs.map((x) => (x.id === c.id ? { ...x, status_pagamento: v } : x)));
                      const { error } = await supabase
                        .from("compensacoes_mensais")
                        .update({ status_pagamento: v } as any)
                        .eq("id", c.id);
                      if (error) {
                        toast.error("Erro ao atualizar pagamento.");
                        setCompensacoes((cs) => cs.map((x) => (x.id === c.id ? { ...x, status_pagamento: prev } : x)));
                        return;
                      }
                      toast.success("Pagamento atualizado.");
                      logClienteHistorico(
                        clienteId,
                        "pagamento_atualizado",
                        `Pagamento ${formatCompetenciaPT(c.mes_referencia as string)} → ${getStatusPagamentoConfig(v).label}`,
                      );
                      await fetchData();
                      onCompensacoesChanged?.();
                    }}
                  >
                    <SelectTrigger className={`h-7 w-28 text-xs ${sp.color}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_PAGAMENTO.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{formatCurrencyBR(Number((c as any).honorario_valor ?? c.valor_nf_servico ?? 0))}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{c.observacao || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      title="Editar compensação"
                      onClick={() => openEditModal(c)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Excluir compensação">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A compensação de{" "}
                            <strong>{formatCurrencyBR(Number(c.valor_compensado || 0))}</strong> referente a{" "}
                            <strong>{formatCompetenciaPT(c.mes_referencia as string)}</strong> será removida permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              const { error } = await supabase.from("compensacoes_mensais").delete().eq("id", c.id);
                              if (error) { toast.error("Erro ao excluir."); return; }
                              toast.success("Compensação excluída.");
                              logClienteHistorico(clienteId, "compensacao_removida", `Compensação removida: ${formatCompetenciaPT(c.mes_referencia as string)} — ${formatCurrencyBR(Number(c.valor_compensado || 0))}`);
                              await fetchData();
                              onCompensacoesChanged?.();
                            }}
                            className="bg-[#c8001e] hover:bg-[#a30019] text-white"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {filtered.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">Total do período (sem Reporto)</TableCell>
              <TableCell className="font-bold">{formatCurrencyBR(totalFiltered)}</TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell className="font-bold">{formatCurrencyBR(totalHonorariosFiltered)}</TableCell>
              <TableCell colSpan={2}></TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {/* Registration / Edit Modal */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) resetFormModal();
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-md flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1 px-6 pb-3 pt-6 pr-12 text-left">
            <DialogTitle>{editingId ? "Editar Compensação" : "Registrar Compensação"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Processo / Tese *</Label>
              <Select
                value={form.processo_tese_id}
                onValueChange={(v) => {
                  const proc = processos.find((p) => p.id === v);
                  const perc = Number(proc?.percentual_honorario || 0) * 100;
                  setForm((p) => ({
                    ...p,
                    processo_tese_id: v,
                    honorario_percentual: perc > 0 ? String(perc) : p.honorario_percentual,
                    valor_nf_servico: "",
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_exibicao}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mês de Referência *</Label>
              <MonthPicker
                aria-label="Mês de referência"
                value={form.mes_referencia}
                onChange={(v) => setForm((p) => ({ ...p, mes_referencia: v }))}
                placeholder="mês/ano"
                className="h-10 w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor Compensado (R$)</Label>
                <CurrencyInput
                  value={form.valor_compensado}
                  onValueChange={(v) => setForm((p) => ({ ...p, valor_compensado: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>% Honorário</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder={selectedProc ? String((Number(selectedProc.percentual_honorario || 0) * 100).toFixed(1)) : "ex: 15"}
                  value={form.honorario_percentual}
                  onChange={(e) => setForm((p) => ({ ...p, honorario_percentual: e.target.value, valor_nf_servico: "" }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tributo</Label>
                <Select value={form.tributo || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, tributo: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {TRIBUTO_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    {form.tributo && !TRIBUTO_OPTIONS.includes(form.tributo) && (
                      <SelectItem value={form.tributo}>{form.tributo}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status Pagamento</Label>
                <Select value={form.status_pagamento} onValueChange={(v) => setForm((p) => ({ ...p, status_pagamento: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_PAGAMENTO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Honorários / NF Serviço (R$)</Label>
              <CurrencyInput
                value={form.valor_nf_servico !== "" ? form.valor_nf_servico : (form.valor_compensado ? honorarioAuto.toFixed(2) : "")}
                onValueChange={(v) => setForm((p) => ({ ...p, valor_nf_servico: v }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Calculado automaticamente: valor × {(percHonorario * 100).toFixed(1)}% = {formatCurrencyBR(honorarioAuto)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={form.observacao} onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} rows={2} />
            </div>
          </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-[var(--ink-06)] px-6 py-4">
            <Button variant="outline" onClick={() => { setModalOpen(false); resetFormModal(); }}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? "Salvar alterações" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mapa Tributário Modal */}
      <Dialog open={mapaOpen} onOpenChange={setMapaOpen}>
        <DialogContent className="flex max-h-[90vh] w-[min(960px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 print:shadow-none print:border-none">
          <DialogHeader className="space-y-1 border-b border-[var(--ink-06)] px-6 py-5 pr-14 text-left">
            <DialogTitle>Mapa Tributário</DialogTitle>
            <DialogDescription>
              Escolha a competência e, se quiser, uma tese específica. O geral do mês inclui todas as teses.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 border-b border-[var(--ink-06)] bg-[rgba(10,21,100,0.03)] px-6 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Competência</Label>
              <Select value={mapaMes} onValueChange={setMapaMes}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Selecionar mês" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((m) => (
                    <SelectItem key={m} value={m}>{formatMesPT(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Tese</Label>
              <Select value={mapaTese} onValueChange={setMapaTese}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Todas as teses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as teses (geral do mês)</SelectItem>
                  {tesesMapaOptions.map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#f4f5f7] px-4 py-5">
          {!mapaMes ? (
            <EmptyState
              icon={<FileText className="h-5 w-5 text-[var(--navy)]" />}
              title="Selecione a competência"
              subtitle="Depois você pode gerar o mapa geral do mês ou filtrar por uma tese."
            />
          ) : (
            <div
              id="mapa-tributario-pdf"
              className="mapa-tributario-report mx-auto overflow-hidden rounded-sm shadow-[0_8px_32px_rgba(15,17,23,0.12)]"
              style={{
                width: "794px",
                background: "white",
                fontFamily: "sans-serif",
                color: "#111",
              }}
            >
              <div
                style={{
                  background: "#0a1564",
                  color: "white",
                  padding: "28px 32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "24px",
                }}
              >
                <img
                  src={logoFintax}
                  alt="Focus FinTax"
                  style={{ height: "80px", width: "auto", filter: "brightness(0) invert(1)" }}
                />
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase", opacity: 0.85, margin: 0 }}>
                    Focus FinTax
                  </p>
                  <p style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "1px", margin: "6px 0 0" }}>
                    MAPA TRIBUTÁRIO DAS COMPENSAÇÕES
                  </p>
                </div>
              </div>

              <div
                style={{
                  padding: "20px 32px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px 24px",
                  fontSize: "12px",
                }}
              >
                <div>
                  <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Razão Social</p>
                  <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{cliente?.empresa || "—"}</p>
                </div>
                <div>
                  <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>CNPJ</p>
                  <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{cliente?.cnpj || "—"}</p>
                </div>
                <div>
                  <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Competência</p>
                  <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{formatMesPT(mapaMes)}</p>
                </div>
                <div>
                  <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Tese</p>
                  <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{mapaTeseLabel}</p>
                </div>
                <div>
                  <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Gerado em</p>
                  <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
                    {new Date().toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              {mesProcessos.length === 0 ? (
                <p style={{ padding: "48px 32px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
                  {mapaTese === "all"
                    ? `Não há processos com compensação em ${formatMesPT(mapaMes)}.`
                    : `Não há compensação de ${mapaTeseLabel} em ${formatMesPT(mapaMes)}.`}
                  {" "}Selecione outro mês ou tese, ou confira se as compensações estão vinculadas a um processo.
                </p>
              ) : (
              mesProcessos.map((proc, procIdx) => {
                const procCompsAll = compsForProcesso(proc);
                const procComps = procCompsAll.filter((c) =>
                  String(c.mes_referencia || "").startsWith(mapaMes),
                );
                const valorComp = procComps.reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
                const acumulado = getCompensacoesAteOmes(proc, mapaMes);
                const creditoBase = creditoProcesso(proc);
                const saldo = creditoBase - acumulado;
                const isSub = isSubvencao(proc.tese);

                return (
                  <div
                    key={proc.id}
                    style={{
                      // primeiro processo continua na mesma página do letterhead; próximos quebram
                      pageBreakBefore: procIdx === 0 ? "auto" : "always",
                      padding: "24px 32px",
                      fontSize: "12px",
                      lineHeight: "1.55",
                    }}
                  >
                    {/* Título do processo (substitui o header duplicado) */}
                    <div
                      style={{
                        marginBottom: "18px",
                        paddingBottom: "8px",
                        borderBottom: "2px solid #0a1564",
                      }}
                    >
                      <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "2px", color: "#6b7280", margin: 0 }}>
                        Processo {procIdx + 1} de {mesProcessos.length}
                      </p>
                      <p style={{ fontWeight: 700, fontSize: "15px", color: "#0a1564", margin: "2px 0 0" }}>
                        {proc.nome_exibicao}
                      </p>
                    </div>

                    {/* Section 1 */}
                    <h3 style={{ fontSize: "12px", fontWeight: "bold", color: "#0a1564", marginBottom: "8px", borderBottom: "1px solid #ddd", paddingBottom: "4px" }}>1. DADOS GERAIS DO TRABALHO</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
                      <thead>
                        <tr style={{ background: "#0a1564", color: "white" }}>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontSize: "11px" }}>Descrição</th>
                          <th style={{ padding: "6px 10px", textAlign: "right", fontSize: "11px" }}>Detalhe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Escopo do Trabalho", proc.nome_exibicao],
                          ["Competência", formatMesPT(mapaMes)],
                          ["Modalidade do Benefício", "Compensação"],
                          ["Valor Total do Benefício Tributário", formatCurrencyBR(creditoBase)],
                          ["Valor Utilizado na Compensação do Mês", formatCurrencyBR(valorComp)],
                          ["Saldo Disp. para Compensações Futuras", formatCurrencyBR(saldo)],
                        ].map(([desc, val], i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #eee", background: i % 2 === 0 ? "#f9f9f9" : "white" }}>
                            <td style={{ padding: "6px 10px", fontSize: "12px" }}>{desc}</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px", fontWeight: i >= 3 ? "bold" : "normal" }}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Section 2 */}
                    <h3 style={{ fontSize: "12px", fontWeight: "bold", color: "#0a1564", marginBottom: "8px", borderBottom: "1px solid #ddd", paddingBottom: "4px" }}>2. DÉBITOS COMPENSADOS</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
                      <thead>
                        <tr style={{ background: "#0a1564", color: "white" }}>
                          {["Tributo", "Cód. DARF", "Valor Débito", "Multa", "Juros"].map((h) => (
                            <th key={h} style={{ padding: "6px 10px", textAlign: h === "Tributo" ? "left" : "right", fontSize: "11px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {procComps.map((c, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={{ padding: "6px 10px", fontSize: "12px" }}>{getTributo(c)}</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px" }}>—</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px", fontWeight: "bold" }}>{formatCurrencyBR(Number(c.valor_compensado || 0))}</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px" }}>—</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px" }}>—</td>
                          </tr>
                        ))}
                        <tr style={{ background: "#f0f0f0", fontWeight: "bold" }}>
                          <td style={{ padding: "6px 10px", fontSize: "12px" }}>Total</td>
                          <td style={{ padding: "6px 10px" }}></td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px" }}>{formatCurrencyBR(valorComp)}</td>
                          <td style={{ padding: "6px 10px" }}></td>
                          <td style={{ padding: "6px 10px" }}></td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Section 3 */}
                    <h3 style={{ fontSize: "12px", fontWeight: "bold", color: "#0a1564", marginBottom: "8px", borderBottom: "1px solid #ddd", paddingBottom: "4px" }}>3. CONTROLE DOS CRÉDITOS — 3.1 Créditos Apurados</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
                      <thead>
                        <tr style={{ background: "#0a1564", color: "white" }}>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontSize: "11px" }}>Descrição</th>
                          <th style={{ padding: "6px 10px", textAlign: "right", fontSize: "11px" }}>Valor R$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Total de Créditos Apurados", formatCurrencyBR(creditoBase), false],
                          ["Total de Créditos Utilizados", formatCurrencyBR(acumulado), false],
                          ["Total de Créditos a Compensar", formatCurrencyBR(saldo), false],
                          ["Saldo Final de Créditos", formatCurrencyBR(saldo), true],
                        ].map(([desc, val, bold], i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #eee", fontWeight: bold ? "bold" : "normal", background: bold ? "#f0f0f0" : i % 2 === 0 ? "#f9f9f9" : "white" }}>
                            <td style={{ padding: "6px 10px", fontSize: "12px" }}>{desc as string}</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px" }}>{val as string}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Section 4 */}
                    <h3 style={{ fontSize: "12px", fontWeight: "bold", color: "#0a1564", marginBottom: "8px", borderBottom: "1px solid #ddd", paddingBottom: "4px" }}>4. RESUMO DE COMPLIANCE FISCAL</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
                      <thead>
                        <tr style={{ background: "#0a1564", color: "white" }}>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontSize: "11px" }}>Item</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontSize: "11px" }}>Detalhe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Natureza da Operação", isSub ? "Subvenção para Investimento" : "Crédito Tributário"],
                          ["Base Legal", isSub ? "Lei Nº 12.973/2014 e LC 160/2017" : proc.tese?.toLowerCase().includes("icms") ? "RE 574.706 — STF Tema 69" : "Legislação Tributária Vigente"],
                          ["Tributos Envolvidos", isSub ? "IRPJ e CSLL" : "PIS e COFINS"],
                          ["Obrigações Retificadas", isSub ? "ECF e DCTF" : "EFD Contribuições"],
                          ["Procedimento Adotado", isSub ? "Exclusão da Base de Cálculo" : "Compensação Administrativa"],
                          ["Situação Fiscal", "Regular e em Conformidade"],
                          ["Crédito Tributário", "Formalmente Constituído"],
                        ].map(([item, detail], i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #eee", background: i % 2 === 0 ? "#f9f9f9" : "white" }}>
                            <td style={{ padding: "6px 10px", fontSize: "12px", fontWeight: "600" }}>{item}</td>
                            <td style={{ padding: "6px 10px", fontSize: "12px" }}>{detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Section 5 */}
                    <h3 style={{ fontSize: "12px", fontWeight: "bold", color: "#0a1564", marginBottom: "8px", borderBottom: "1px solid #ddd", paddingBottom: "4px" }}>5. CONSIDERAÇÕES FINAIS</h3>
                    <p style={{ fontSize: "11px", textAlign: "justify", marginBottom: "16px" }}>
                      O trabalho realizado assegura que: Os créditos foram aproveitados em conformidade com a legislação vigente; As obrigações acessórias foram devidamente retificadas, refletindo a realidade fiscal da empresa; A empresa encontra-se em situação de compliance tributário, com redução de riscos fiscais e segurança jurídica quanto ao aproveitamento dos créditos. Sem mais para o momento, consideramos encerrado o trabalho de auditoria técnica e compliance fiscal, permanecendo à disposição para eventuais fiscalizações, esclarecimentos ou suportes futuros.
                    </p>

                    {/* Footer */}
                    <div style={{ textAlign: "center", borderTop: "2px solid #0a1564", paddingTop: "16px", marginTop: "32px" }}>
                      <p style={{ fontWeight: "bold", color: "#0a1564", fontSize: "14px" }}>FOCUS FINTAX</p>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          )}
          </div>

          <DialogFooter className="border-t border-[var(--ink-06)] px-6 py-4 sm:justify-between">
            <p className="hidden text-xs text-muted-foreground sm:block">
              {mapaMes
                ? mesProcessos.length > 0
                  ? `${mesProcessos.length} processo${mesProcessos.length > 1 ? "s" : ""} · ${mapaTeseLabel}`
                  : "Nenhum processo neste recorte"
                : "Selecione o mês para pré-visualizar"}
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setMapaOpen(false)}>
                Fechar
              </Button>
              <Button
                className="flex-1 gap-2 sm:flex-none"
                onClick={handleDownloadMapaPdf}
                disabled={!mapaMes || downloadingPdf || mesProcessos.length === 0}
              >
                <Printer className="h-4 w-4" />
                {downloadingPdf ? "Gerando PDF..." : "Baixar PDF"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Modal */}
      <Dialog open={whatsOpen} onOpenChange={setWhatsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Comunicado WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mês de Referência</Label>
              <Select value={whatsMes} onValueChange={setWhatsMes}>
                <SelectTrigger><SelectValue placeholder="Selecionar mês" /></SelectTrigger>
                <SelectContent>
                  {availableMonths.map((m) => <SelectItem key={m} value={m}>{formatMesPT(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {whatsMes && whatsComps.length > 0 && (
              <>
                <div className="rounded border bg-muted/30 p-3 text-xs font-medium">
                  Honorários calculados: <span className="text-foreground">{formatCurrencyBR(totalHonorarios)}</span>
                </div>
                <div className="rounded border bg-muted/20 p-3 max-h-[300px] overflow-auto">
                  <pre className="whitespace-pre-wrap text-xs font-mono">{fullWhatsMessage}</pre>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button className="flex-1 gap-2 text-white" style={{ background: "#25D366" }} onClick={handleCopy}>
                    <Copy className="h-4 w-4" /> Copiar mensagem
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" onClick={handleEmail}>
                    <Mail className="h-4 w-4" /> Enviar por E-mail
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full gap-2"
                    onClick={async () => {
                      // Marca competência como lançada no mapa / emitida (fila do Paulo)
                      const ids = whatsComps.map((c) => c.id);
                      if (ids.length === 0) return;
                      const { error } = await (supabase.from("compensacoes_mensais") as any)
                        .update({ lancado_mapa: true })
                        .in("id", ids);
                      if (error) {
                        toast.error("Não foi possível marcar como emitido.");
                        return;
                      }
                      logClienteHistorico(
                        clienteId,
                        "comunicado_enviado",
                        `Competência ${formatMesPT(whatsMes)} marcada como emitida/lançada no mapa (${ids.length} linhas)`
                      );
                      toast.success("Competência marcada como emitida");
                      fetchData();
                    }}
                  >
                    Marcar competência como emitida
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use “Marcar como emitida” depois de enviar o WhatsApp/PDF — alimenta o acompanhamento do Paulo sem retrabalho.
                </p>
              </>
            )}

            {whatsMes && whatsComps.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">Nenhuma compensação neste mês.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
