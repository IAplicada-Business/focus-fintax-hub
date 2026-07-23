import { useState, useEffect, useCallback } from "react";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText, MessageCircle, Printer, Copy, Mail, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatCurrencyBR, formatCompetenciaPT, getStatusPagamentoConfig, STATUS_PAGAMENTO } from "@/lib/clientes-constants";
import logoFintax from "@/assets/logo-focus-fintax.svg";
import { logClienteHistorico } from "@/lib/cliente-historico";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
const MESES_PT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

interface Props {
  clienteId: string;
  cliente?: { empresa: string; cnpj: string };
  onTotalChange?: (total: number) => void;
  onCompensacoesChanged?: () => void;
}

export function CompensacoesTab({ clienteId, cliente, onTotalChange, onCompensacoesChanged }: Props) {
  const [compensacoes, setCompensacoes] = useState<any[]>([]);
  const [processos, setProcessos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterTese, setFilterTese] = useState("all");
  const [mesInicio, setMesInicio] = useState("");
  const [mesFim, setMesFim] = useState("");
  const [form, setForm] = useState({
    processo_tese_id: "",
    mes_referencia: "",
    valor_compensado: "",
    status_pagamento: "pendente",
    valor_nf_servico: "",
    honorario_percentual: "",
    observacao: "",
    tributo: "",
  });

  // Mapa Tributário state
  const [mapaOpen, setMapaOpen] = useState(false);
  const [mapaMes, setMapaMes] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // WhatsApp state
  const [whatsOpen, setWhatsOpen] = useState(false);
  const [whatsMes, setWhatsMes] = useState("");

  const fetchData = useCallback(async () => {
    const [{ data: comp }, { data: proc }] = await Promise.all([
      supabase
        .from("compensacoes_mensais")
        .select("*, processos_teses!compensacoes_mensais_processo_tese_id_fkey(nome_exibicao, tese)")
        .eq("cliente_id", clienteId)
        .order("mes_referencia", { ascending: false }),
      supabase.from("processos_teses").select("id, nome_exibicao, tese, valor_credito, percentual_honorario").eq("cliente_id", clienteId),
    ]);
    setCompensacoes(comp || []);
    setProcessos(proc || []);
    setLoading(false);
    const total = (comp || []).reduce((s: number, c: any) => s + Number(c.valor_compensado || 0), 0);
    onTotalChange?.(total);
  }, [clienteId, onTotalChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = compensacoes.filter((c) => {
    if (filterTese !== "all" && c.processo_tese_id !== filterTese) return false;
    const mes = (c.mes_referencia as string).slice(0, 7);
    if (mesInicio && mes < mesInicio) return false;
    if (mesFim && mes > mesFim) return false;
    return true;
  });
  const totalFiltered = filtered.reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
  const totalHonorariosFiltered = filtered.reduce(
    (s, c) => s + Number(c.honorario_valor ?? c.valor_nf_servico ?? 0),
    0
  );

  const selectedProc = processos.find((p) => p.id === form.processo_tese_id);
  const percHonorario = form.honorario_percentual !== ""
    ? Number(form.honorario_percentual) / 100
    : Number(selectedProc?.percentual_honorario || 0);
  const honorarioAuto = Math.round(Number(form.valor_compensado || 0) * percHonorario * 100) / 100;

  // Available months
  const availableMonths = [...new Set(compensacoes.map((c) => (c.mes_referencia as string).slice(0, 7)))].sort().reverse();

  const handleSave = async () => {
    if (!form.processo_tese_id || !form.mes_referencia) {
      toast.error("Processo e mês são obrigatórios.");
      return;
    }
    const valorComp = Number(form.valor_compensado) || 0;
    const honorarioValor = form.valor_nf_servico !== ""
      ? Number(form.valor_nf_servico) || 0
      : honorarioAuto;
    const { data: cli } = await supabase
      .from("clientes")
      .select("tese_ativa_id")
      .eq("id", clienteId)
      .maybeSingle();
    const { error } = await supabase.from("compensacoes_mensais").insert({
      cliente_id: clienteId,
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
      tese_origem_id: (cli as any)?.tese_ativa_id ?? null,
    } as any);
    if (error) { toast.error("Erro ao registrar."); return; }
    toast.success("Compensação registrada!");
    const proc = processos.find((p) => p.id === form.processo_tese_id);
    logClienteHistorico(clienteId, "compensacao_adicionada", `Compensação ${form.mes_referencia} — ${proc?.nome_exibicao || ""}: ${formatCurrencyBR(valorComp)}`);
    setModalOpen(false);
    setForm({ processo_tese_id: "", mes_referencia: "", valor_compensado: "", status_pagamento: "pendente", valor_nf_servico: "", honorario_percentual: "", observacao: "", tributo: "" });
    await fetchData();
    onCompensacoesChanged?.();
  };

  // ——— Mapa Tributário helpers ———
  const mesComps = mapaMes ? compensacoes.filter((c) => (c.mes_referencia as string).startsWith(mapaMes)) : [];
  const mesProcessoIds = [...new Set(mesComps.map((c) => c.processo_tese_id))];
  const mesProcessos = processos.filter((p) => mesProcessoIds.includes(p.id));

  const formatMesPT = (mesStr: string) => {
    const [y, m] = mesStr.split("-");
    return `${MESES_PT[parseInt(m, 10) - 1]}/${y}`;
  };

  const getCompensacoesAteOmes = (processoId: string, mesRef: string) => {
    return compensacoes
      .filter((c) => c.processo_tese_id === processoId && (c.mes_referencia as string).slice(0, 7) <= mesRef)
      .reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
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
  // Renderiza o container inteiro (não só o viewport) via html2canvas +
  // divide em páginas A4 no jsPDF. Fix do bug do "print viewport" original.
  const sanitizeFileName = (s: string) =>
    (s || "cliente")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);

  const handleDownloadMapaPdf = async () => {
    const element = document.getElementById("mapa-tributario-pdf") as HTMLElement | null;
    if (!element || downloadingPdf) return;
    setDownloadingPdf(true);

    // Neutraliza restrições de altura/overflow dos ancestrais pra capturar
    // o CONTEÚDO INTEIRO (não só o que cabe na viewport).
    const modified: { el: HTMLElement; prop: string; prev: string }[] = [];
    const forceStyle = (el: HTMLElement, prop: string, value: string) => {
      modified.push({ el, prop, prev: el.style.getPropertyValue(prop) });
      el.style.setProperty(prop, value, "important");
    };

    // Ancestrais até o body
    let node: HTMLElement | null = element;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      if (["auto", "scroll", "hidden"].includes(cs.overflow) || ["auto", "scroll", "hidden"].includes(cs.overflowY)) {
        forceStyle(node, "overflow", "visible");
        forceStyle(node, "overflow-y", "visible");
      }
      if (cs.maxHeight && cs.maxHeight !== "none") forceStyle(node, "max-height", "none");
      if (cs.height && cs.height.endsWith("vh")) forceStyle(node, "height", "auto");
      node = node.parentElement;
    }
    // O próprio container em auto height também
    forceStyle(element, "height", "auto");
    forceStyle(element, "max-height", "none");
    forceStyle(element, "overflow", "visible");

    try {
      // Espera 1 tick pro layout recalcular
      await new Promise((r) => setTimeout(r, 50));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        allowTaint: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        height: element.scrollHeight,
        width: element.scrollWidth,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const imgWidthMm = pageWidthMm;
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      let heightLeft = imgHeightMm;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= pageHeightMm;

      // Multipage: reusa a MESMA imagem, deslocando -pageHeight a cada página
      while (heightLeft > 0) {
        position -= pageHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
        heightLeft -= pageHeightMm;
      }

      // Rodapé com paginação e data de geração em todas as páginas
      const pageCount = pdf.getNumberOfPages();
      const nowStr = new Date().toLocaleDateString("pt-BR");
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Focus FinTax · Confidencial · Gerado em ${nowStr}`, 10, pageHeightMm - 6);
        pdf.text(`Página ${i} de ${pageCount}`, pageWidthMm - 32, pageHeightMm - 6);
      }

      const razao = sanitizeFileName(cliente?.empresa || "");
      const comp  = mapaMes ? mapaMes.replace(/-/g, "") : new Date().toISOString().slice(0, 10).replace(/-/g, "");
      pdf.save(`MapaTributario_${razao}_${comp}.pdf`);

      toast.success("PDF gerado com sucesso!");
      logClienteHistorico(clienteId, "mapa_tributario_exportado", `Mapa Tributário exportado em PDF — competência ${mapaMes ? formatMesPT(mapaMes) : "sem mês"}`);
    } catch (err) {
      console.error("Erro ao gerar PDF do Mapa Tributário:", err);
      toast.error("Erro ao gerar PDF", { description: "Tenta usar o print do navegador como fallback (Ctrl+P)." });
    } finally {
      // Restaura estilos originais
      for (const { el, prop, prev } of modified) {
        if (prev) el.style.setProperty(prop, prev);
        else el.style.removeProperty(prop);
      }
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterTese} onValueChange={setFilterTese}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar por tese" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as teses</SelectItem>
              {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_exibicao}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="month"
            className="h-9 w-36 text-xs"
            value={mesInicio}
            onChange={(e) => setMesInicio(e.target.value)}
            title="Período início"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="month"
            className="h-9 w-36 text-xs"
            value={mesFim}
            onChange={(e) => setMesFim(e.target.value)}
            title="Período fim"
          />
          {(mesInicio || mesFim) && (
            <button type="button" className="text-xs text-primary underline" onClick={() => { setMesInicio(""); setMesFim(""); }}>
              Limpar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setMapaMes(""); setMapaOpen(true); }}>
            <FileText className="h-4 w-4 mr-1" /> Mapa Tributário
          </Button>
          <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => { setWhatsMes(""); setWhatsOpen(true); }}>
            <MessageCircle className="h-4 w-4 mr-1" /> Comunicado WhatsApp
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4 mr-1" /> Registrar compensação</Button>
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
            <TableHead className="w-10"></TableHead>
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
                <TableCell><Badge variant="outline" className={sp.color}>{sp.label}</Badge></TableCell>
                <TableCell>{formatCurrencyBR(Number((c as any).honorario_valor ?? c.valor_nf_servico ?? 0))}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{c.observacao || "—"}</TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
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
                            fetchData();
                          }}
                          className="bg-[#c8001e] hover:bg-[#a30019] text-white"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {filtered.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">Total do período</TableCell>
              <TableCell className="font-bold">{formatCurrencyBR(totalFiltered)}</TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell className="font-bold">{formatCurrencyBR(totalHonorariosFiltered)}</TableCell>
              <TableCell colSpan={2}></TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {/* Registration Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Compensação</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
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
              <Input type="month" value={form.mes_referencia} onChange={(e) => setForm((p) => ({ ...p, mes_referencia: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor Compensado (R$)</Label>
                <Input type="number" value={form.valor_compensado} onChange={(e) => setForm((p) => ({ ...p, valor_compensado: e.target.value }))} />
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
                <Select value={form.tributo} onValueChange={(v) => setForm((p) => ({ ...p, tributo: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {TRIBUTO_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
              <Input
                type="number"
                value={form.valor_nf_servico !== "" ? form.valor_nf_servico : (form.valor_compensado ? String(honorarioAuto) : "")}
                onChange={(e) => setForm((p) => ({ ...p, valor_nf_servico: e.target.value }))}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mapa Tributário Modal */}
      <Dialog open={mapaOpen} onOpenChange={setMapaOpen}>
        <DialogContent className="max-w-[900px] h-[90vh] overflow-auto print:shadow-none print:border-none">
          <DialogHeader className="flex flex-row items-center justify-between gap-4 print:hidden">
            <DialogTitle>Mapa Tributário</DialogTitle>
            <div className="flex items-center gap-3">
              <Select value={mapaMes} onValueChange={setMapaMes}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Selecionar mês" /></SelectTrigger>
                <SelectContent>
                  {availableMonths.map((m) => <SelectItem key={m} value={m}>{formatMesPT(m)}</SelectItem>)}
                </SelectContent>
              </Select>
              {mapaMes && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleDownloadMapaPdf}
                  disabled={downloadingPdf}
                >
                  <Printer className="h-4 w-4" />
                  {downloadingPdf ? "Gerando PDF..." : "Baixar PDF"}
                </Button>
              )}
            </div>
          </DialogHeader>

          {!mapaMes ? (
            <p className="text-center text-muted-foreground py-12">Selecione um mês para gerar o mapa tributário.</p>
          ) : (
            <div
              id="mapa-tributario-pdf"
              className="mapa-tributario-report"
              style={{
                width: "794px",
                margin: "0 auto",
                background: "white",
                fontFamily: "sans-serif",
                color: "#111",
              }}
            >
              {/* Letterhead compacto (substitui a capa 100vh) */}
              <div
                style={{
                  background: "#0a1564",
                  color: "white",
                  padding: "20px 32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "24px",
                }}
              >
                <img
                  src={logoFintax}
                  alt="Focus FinTax"
                  style={{ height: "36px", filter: "brightness(0) invert(1)" }}
                />
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", opacity: 0.75, margin: 0 }}>
                    Grupo Focus · Focus FinTax
                  </p>
                  <p style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "1px", margin: "4px 0 0" }}>
                    MAPA TRIBUTÁRIO DAS COMPENSAÇÕES
                  </p>
                </div>
              </div>

              {/* Identificação do cliente — logo abaixo do letterhead, sem página em branco */}
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
                  <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Gerado em</p>
                  <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
                    {new Date().toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              {/* Report Pages — one per processo */}
              {mesProcessos.map((proc, procIdx) => {
                const procComps = mesComps.filter((c) => c.processo_tese_id === proc.id);
                const valorComp = procComps.reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
                const acumulado = getCompensacoesAteOmes(proc.id, mapaMes);
                const saldo = Number(proc.valor_credito || 0) - acumulado;
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
                          ["Valor Total do Benefício Tributário", formatCurrencyBR(Number(proc.valor_credito || 0))],
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
                          ["Total de Créditos Apurados", formatCurrencyBR(Number(proc.valor_credito || 0)), false],
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
                      <p style={{ fontWeight: "bold", color: "#0a1564", fontSize: "14px" }}>GRUPO FOCUS FINTAX</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
