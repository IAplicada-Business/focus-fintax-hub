import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Printer, Filter, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import logoFintax from "@/assets/logo-focus-fintax.svg";

interface LinhaMapa {
  cliente_id: string;
  tese_id: string;
  tese_codigo: string;
  tese_label: string;
  visivel_cliente: boolean;
  valor_apurado_inicial: number;
  total_compensado: number;
  saldo_final: number;
  incluir_no_calculo?: boolean;
  status_utilizacao?: "utilizado" | "em_uso" | "a_utilizar" | null;
}

/** Labels de produto (DB continua utilizado / em_uso / a_utilizar). */
const STATUS_LABEL: Record<string, string> = {
  utilizado: "Compensado",
  em_uso: "Compensando",
  a_utilizar: "Não iniciado",
};

const STATUS_STYLE: Record<string, string> = {
  utilizado: "bg-emerald-100 text-emerald-800",
  em_uso: "bg-amber-100 text-amber-800",
  a_utilizar: "bg-slate-100 text-slate-700",
};

interface Cliente {
  id: string;
  empresa: string | null;
  cnpj: string | null;
  data_apuracao: string | null;
}

// Ordem canônica das teses (matcheia a planilha SISTEMA do Alcir).
const ORDEM_TESES: Record<string, number> = {
  INSUMOS: 1,
  SUBVENCAO: 2,
  ICMS_ST: 3,
  EXCLUSAO_ICMS_BC: 4,
  PIS_COFINS_JUD: 5,
  PREVIDENCIARIO: 6,
  REPORTO: 7,
};

const sanitizeFileName = (s: string) =>
  (s || "cliente")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

export default function MapaCreditos() {
  const { id: clienteId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [linhas, setLinhas] = useState<LinhaMapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [teseFiltroSet, setTeseFiltroSet] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clienteId) return;
    const fetch = async () => {
      setLoading(true);
      const [{ data: c }, { data: v }] = await Promise.all([
        supabase.from("clientes").select("id, empresa, cnpj, data_apuracao").eq("id", clienteId).single(),
        (supabase as any).from("v_mapa_creditos").select("*").eq("cliente_id", clienteId),
      ]);
      setCliente((c as any) || null);
      const rows = ((v || []) as LinhaMapa[]).sort(
        (a, b) => (ORDEM_TESES[a.tese_codigo] ?? 99) - (ORDEM_TESES[b.tese_codigo] ?? 99)
      );
      setLinhas(rows);
      // Default: esconde REPORTO do filtro (fora do cálculo Fox)
      setTeseFiltroSet(new Set(rows.filter((r) => r.tese_codigo !== "REPORTO").map((r) => r.tese_codigo)));
      setLoading(false);
    };
    fetch();
  }, [clienteId]);

  const linhasVisiveis = useMemo(
    () => linhas.filter((r) => teseFiltroSet.has(r.tese_codigo)),
    [linhas, teseFiltroSet]
  );

  const totais = useMemo(() => {
    // Totais do rodapé = só teses incluídas no cálculo financeiro
    const forTotals = linhasVisiveis.filter((r) => {
      if (typeof r.incluir_no_calculo === "boolean") return r.incluir_no_calculo;
      return r.tese_codigo === "INSUMOS" || r.tese_codigo === "SUBVENCAO";
    });
    return forTotals.reduce(
      (acc, r) => ({
        apurado: acc.apurado + Number(r.valor_apurado_inicial || 0),
        compensado: acc.compensado + Number(r.total_compensado || 0),
        saldo: acc.saldo + Number(r.saldo_final || 0),
      }),
      { apurado: 0, compensado: 0, saldo: 0 }
    );
  }, [linhasVisiveis]);

  const toggleTese = (code: string) => {
    setTeseFiltroSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleIncluirCalculo = async (teseId: string, next: boolean) => {
    setLinhas((prev) => prev.map((l) => (l.tese_id === teseId ? { ...l, incluir_no_calculo: next } : l)));
    const { error } = await (supabase as any)
      .from("creditos_apurados")
      .update({ incluir_no_calculo: next, atualizado_em: new Date().toISOString() })
      .eq("cliente_id", clienteId)
      .eq("tese_id", teseId);
    if (error) {
      toast.error("Não foi possível salvar o checkbox. Rode a migration SQL no Lovable.");
      setLinhas((prev) => prev.map((l) => (l.tese_id === teseId ? { ...l, incluir_no_calculo: !next } : l)));
    } else {
      toast.success(next ? "Tese incluída no cálculo" : "Tese removida do cálculo");
    }
  };

  const teseCodesUnicos = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.tese_codigo))).sort(
      (a, b) => (ORDEM_TESES[a] ?? 99) - (ORDEM_TESES[b] ?? 99)
    ),
    [linhas]
  );

  const handleDownloadPdf = async () => {
    const el = pdfRef.current;
    if (!el || downloading) return;
    setDownloading(true);

    // Neutraliza restrições de altura/overflow de ancestrais
    const modified: { el: HTMLElement; prop: string; prev: string }[] = [];
    const force = (n: HTMLElement, prop: string, value: string) => {
      modified.push({ el: n, prop, prev: n.style.getPropertyValue(prop) });
      n.style.setProperty(prop, value, "important");
    };
    let node: HTMLElement | null = el;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      if (["auto", "scroll", "hidden"].includes(cs.overflow) || ["auto", "scroll", "hidden"].includes(cs.overflowY)) {
        force(node, "overflow", "visible");
        force(node, "overflow-y", "visible");
      }
      if (cs.maxHeight && cs.maxHeight !== "none") force(node, "max-height", "none");
      if (cs.height && cs.height.endsWith("vh")) force(node, "height", "auto");
      node = node.parentElement;
    }
    force(el, "height", "auto");
    force(el, "max-height", "none");
    force(el, "overflow", "visible");

    try {
      await new Promise((r) => setTimeout(r, 50));
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        height: el.scrollHeight,
        width: el.scrollWidth,
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
      while (heightLeft > 0) {
        position -= pageHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
        heightLeft -= pageHeightMm;
      }
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
      pdf.save(`MapaCreditos_${razao}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pdf`);
      toast.success("PDF gerado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF", { description: "Tenta usar Ctrl+P como fallback." });
    } finally {
      for (const { el: n, prop, prev } of modified) {
        if (prev) n.style.setProperty(prop, prev);
        else n.style.removeProperty(prop);
      }
      setDownloading(false);
    }
  };

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
      {/* Header ações (não vai pro PDF) */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/clientes/${clienteId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao cliente
          </Button>
          <h1 className="font-display text-xl font-bold text-navy">Mapa de Créditos</h1>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-1" /> Filtrar teses
                {teseFiltroSet.size < teseCodesUnicos.length && (
                  <Badge className="ml-2 text-[10px]">
                    {teseFiltroSet.size}/{teseCodesUnicos.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold">Teses visíveis</p>
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => setTeseFiltroSet(new Set(teseCodesUnicos))}
                  >
                    Todas
                  </button>
                </div>
                {teseCodesUnicos.map((code) => {
                  const linha = linhas.find((l) => l.tese_codigo === code);
                  return (
                    <label key={code} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={teseFiltroSet.has(code)}
                        onCheckedChange={() => toggleTese(code)}
                      />
                      <span>{linha?.tese_label || code}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={handleDownloadPdf}
            disabled={downloading || linhasVisiveis.length === 0}
          >
            <Printer className="h-4 w-4" />
            {downloading ? "Gerando..." : "Baixar PDF"}
          </Button>
        </div>
      </div>

      {/* Área que vai pro PDF */}
      <div
        ref={pdfRef}
        id="mapa-creditos-pdf"
        style={{ width: "794px", margin: "0 auto", background: "white", color: "#111" }}
      >
        {/* Letterhead */}
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
              MAPA DE CRÉDITOS TRIBUTÁRIOS
            </p>
          </div>
        </div>

        {/* Identificação */}
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
            <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{cliente.empresa || "—"}</p>
          </div>
          <div>
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>CNPJ</p>
            <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{cliente.cnpj || "—"}</p>
          </div>
          <div>
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Data Apuração</p>
            <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
              {cliente.data_apuracao
                ? new Date(cliente.data_apuracao).toLocaleDateString("pt-BR")
                : "—"}
            </p>
          </div>
          <div>
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Gerado em</p>
            <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
              {new Date().toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        {/* Tabela — espelho da aba "Detalhamento por Cliente" da planilha SISTEMA */}
        <div style={{ padding: "24px 32px" }}>
          {linhasVisiveis.length === 0 ? (
            <p style={{ padding: "24px 0", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
              Sem créditos apurados registrados{teseFiltroSet.size < teseCodesUnicos.length ? " para as teses filtradas" : ""}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow style={{ background: "#0a1564" }}>
                  <TableHead style={{ color: "white", fontSize: "11px" }}>No cálculo</TableHead>
                  <TableHead style={{ color: "white", fontSize: "11px" }}>Tese Tributária</TableHead>
                  <TableHead style={{ color: "white", fontSize: "11px" }}>Status</TableHead>
                  <TableHead style={{ color: "white", fontSize: "11px", textAlign: "right" }}>Crédito Inicial Apurado</TableHead>
                  <TableHead style={{ color: "white", fontSize: "11px", textAlign: "right" }}>Valor Compensado</TableHead>
                  <TableHead style={{ color: "white", fontSize: "11px", textAlign: "right" }}>Saldo Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasVisiveis.map((l, i) => {
                  const pctUtilizado = l.valor_apurado_inicial > 0
                    ? (Number(l.total_compensado) / Number(l.valor_apurado_inicial)) * 100
                    : 0;
                  const incluido = typeof l.incluir_no_calculo === "boolean"
                    ? l.incluir_no_calculo
                    : l.tese_codigo === "INSUMOS" || l.tese_codigo === "SUBVENCAO";
                  const statusKey = l.status_utilizacao
                    || (Number(l.total_compensado) <= 0 ? "a_utilizar" : Number(l.saldo_final) <= 0 ? "utilizado" : "em_uso");
                  return (
                    <TableRow
                      key={l.tese_id}
                      style={{
                        background: i % 2 === 0 ? "#f9fafb" : "white",
                        borderBottom: "1px solid #eee",
                        opacity: incluido ? 1 : 0.55,
                      }}
                    >
                      <TableCell style={{ padding: "8px 10px" }} className="print:hidden">
                        <Checkbox
                          checked={incluido}
                          onCheckedChange={(v) => toggleIncluirCalculo(l.tese_id, !!v)}
                          disabled={l.tese_codigo === "REPORTO"}
                        />
                      </TableCell>
                      <TableCell style={{ fontSize: "12px", padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600, color: "#0a1564" }}>{l.tese_label}</div>
                        <div style={{ fontSize: "10px", color: "#6b7280" }}>
                          {l.tese_codigo}
                          {l.tese_codigo === "REPORTO" && (
                            <span style={{ marginLeft: "8px", padding: "1px 6px", borderRadius: "4px", background: "#f1f5f9", color: "#475569" }}>
                              possíveis futuros
                            </span>
                          )}
                          {!l.visivel_cliente && l.tese_codigo !== "REPORTO" && (
                            <span style={{ marginLeft: "8px", padding: "1px 6px", borderRadius: "4px", background: "#f1f5f9", color: "#475569" }}>
                              interno
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell style={{ padding: "8px 10px" }}>
                        <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[statusKey] || STATUS_STYLE.a_utilizar}`}>
                          {STATUS_LABEL[statusKey] || statusKey}
                        </span>
                      </TableCell>
                      <TableCell style={{ fontSize: "12px", textAlign: "right", padding: "8px 10px", fontWeight: 500 }}>
                        {formatCurrencyBR(Number(l.valor_apurado_inicial))}
                      </TableCell>
                      <TableCell style={{ fontSize: "12px", textAlign: "right", padding: "8px 10px" }}>
                        {l.tese_codigo === "REPORTO" ? (
                          <>
                            <span style={{ color: "#6b7280" }}>—</span>
                            <div style={{ fontSize: "9px", color: "#6b7280" }}>não compensa</div>
                          </>
                        ) : (
                          <>
                            {formatCurrencyBR(Number(l.total_compensado))}
                            <div style={{ fontSize: "9px", color: "#6b7280" }}>{pctUtilizado.toFixed(1)}% do apurado</div>
                          </>
                        )}
                      </TableCell>
                      <TableCell
                        style={{
                          fontSize: "12px",
                          textAlign: "right",
                          padding: "8px 10px",
                          fontWeight: 700,
                          color: Number(l.tese_codigo === "REPORTO" ? l.valor_apurado_inicial : l.saldo_final) > 0 ? "#0a1564" : "#6b7280",
                        }}
                      >
                        {formatCurrencyBR(
                          Number(l.tese_codigo === "REPORTO" ? l.valor_apurado_inicial : l.saldo_final)
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow style={{ background: "#e0e7ff", fontWeight: 700 }}>
                  <TableCell colSpan={3} style={{ fontSize: "13px", padding: "10px", color: "#0a1564" }}>
                    TOTAL NO CÁLCULO
                  </TableCell>
                  <TableCell style={{ fontSize: "13px", textAlign: "right", padding: "10px", color: "#0a1564" }}>
                    {formatCurrencyBR(totais.apurado)}
                  </TableCell>
                  <TableCell style={{ fontSize: "13px", textAlign: "right", padding: "10px", color: "#0a1564" }}>
                    {formatCurrencyBR(totais.compensado)}
                  </TableCell>
                  <TableCell style={{ fontSize: "13px", textAlign: "right", padding: "10px", color: "#0a1564" }}>
                    {formatCurrencyBR(totais.saldo)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>

        {/* Rodapé com resumo executivo */}
        {linhasVisiveis.length > 0 && (
          <div
            style={{
              padding: "16px 32px 24px",
              borderTop: "1px solid #e5e7eb",
              fontSize: "11px",
              color: "#6b7280",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px",
            }}
          >
            <div>
              <p style={{ textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, fontSize: "9px" }}>Teses ativas</p>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{linhasVisiveis.length}</p>
            </div>
            <div>
              <p style={{ textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, fontSize: "9px" }}>% utilizado</p>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
                {totais.apurado > 0 ? ((totais.compensado / totais.apurado) * 100).toFixed(1) : "0"}%
              </p>
            </div>
            <div>
              <p style={{ textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, fontSize: "9px" }}>Saldo a compensar</p>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
                {formatCurrencyBR(totais.saldo)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
