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
import {
  formatCurrencyBR,
  statusUtilizacaoFromSaldo,
  sumCompensadoForTese,
} from "@/lib/clientes-constants";
import { exportElementToPdf, sanitizePdfFileName } from "@/lib/export-element-pdf";

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
      const [
        { data: c, error: cErr },
        { data: v, error: vErr },
        { data: comps, error: compsErr },
        { data: procs, error: procsErr },
        { data: creditos, error: creditosErr },
      ] = await Promise.all([
        supabase.from("clientes").select("id, empresa, cnpj, data_apuracao").eq("id", clienteId).single(),
        (supabase as any).from("v_mapa_creditos").select("*").eq("cliente_id", clienteId),
        supabase
          .from("compensacoes_mensais")
          .select(
            "valor_compensado, tese_origem_id, processo_tese_id, mes_referencia, tributo, tributo_enum, processos_teses:processo_tese_id(tese, nome_exibicao)",
          )
          .eq("cliente_id", clienteId),
        supabase.from("processos_teses").select("id, tese").eq("cliente_id", clienteId),
        (supabase as any)
          .from("creditos_apurados")
          .select("tese_id, valor_compensado_manual")
          .eq("cliente_id", clienteId),
      ]);

      if (cErr) {
        console.error("MapaCreditos: falha ao carregar cliente", cErr);
        toast.error("Não foi possível carregar o cliente", { description: cErr.message });
        setCliente(null);
        setLinhas([]);
        setLoading(false);
        return;
      }
      if (vErr) {
        // Sem a view o mapa fica vazio — antes isso silenciava e o botão de PDF
        // simplesmente ficava disabled, parecendo "não gera".
        console.error("MapaCreditos: falha ao carregar v_mapa_creditos", vErr);
        toast.error("Não foi possível carregar o mapa de créditos", {
          description: vErr.message || "A view v_mapa_creditos falhou. Confira se a migration está aplicada.",
        });
      }
      if (compsErr || procsErr || creditosErr) {
        console.warn("MapaCreditos: falha parcial ao carregar dados auxiliares", {
          compsErr,
          procsErr,
          creditosErr,
        });
      }

      setCliente((c as any) || null);

      const processoIdsByTese = new Map<string, Set<string>>();
      for (const p of (procs as { id: string; tese: string | null }[]) || []) {
        const cod = String(p.tese || "").toUpperCase();
        if (!cod) continue;
        if (!processoIdsByTese.has(cod)) processoIdsByTese.set(cod, new Set());
        processoIdsByTese.get(cod)!.add(p.id);
      }
      const manualByTese = new Map<string, number>();
      for (const row of (creditos as { tese_id: string; valor_compensado_manual: number | null }[]) || []) {
        if (row.valor_compensado_manual != null) {
          manualByTese.set(row.tese_id, Number(row.valor_compensado_manual));
        }
      }

      // Recalcula no client (sem depender de migration SQL no Lovable):
      // GREATEST(Detalhamento, soma aba com órfãs/tributo).
      const rows = ((v || []) as LinhaMapa[])
        .map((r) => {
          const codigo = String(r.tese_codigo || "").toUpperCase();
          if (codigo === "REPORTO") {
            return {
              ...r,
              total_compensado: 0,
              saldo_final: Number(r.valor_apurado_inicial || 0),
              status_utilizacao: "a_utilizar" as const,
            };
          }
          const fromAba = sumCompensadoForTese((comps as any[]) || [], {
            teseCodigo: codigo,
            teseId: r.tese_id,
            processoIds: processoIdsByTese.get(codigo),
          });
          const manual = manualByTese.get(r.tese_id);
          const compensado = Math.max(
            fromAba,
            manual != null ? manual : 0,
            Number(r.total_compensado || 0),
          );
          const apurado = Number(r.valor_apurado_inicial || 0);
          return {
            ...r,
            total_compensado: compensado,
            saldo_final: apurado - compensado,
            status_utilizacao: statusUtilizacaoFromSaldo(apurado, compensado),
          };
        })
        .sort((a, b) => (ORDEM_TESES[a.tese_codigo] ?? 99) - (ORDEM_TESES[b.tese_codigo] ?? 99));

      setLinhas(rows);
      // Default: esconde REPORTO do filtro (fora do cálculo Fox). Quando REPORTO é
      // a única tese do cliente, esconder tudo deixaria o mapa vazio e o botão de
      // PDF disabled — nesse caso mostra o que existe.
      const semReporto = rows.filter((r) => r.tese_codigo !== "REPORTO");
      const visiveisPorDefault = semReporto.length > 0 ? semReporto : rows;
      setTeseFiltroSet(new Set(visiveisPorDefault.map((r) => r.tese_codigo)));
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
    if (linhasVisiveis.length === 0) {
      toast.error("Sem créditos para exportar", {
        description: "Este cliente não tem linhas no mapa (ou o filtro escondeu todas as teses).",
      });
      return;
    }

    setDownloading(true);
    try {
      const razao = sanitizePdfFileName(cliente?.empresa || "");
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await exportElementToPdf(el, `MapaCreditos_${razao}_${stamp}`);
      toast.success("PDF gerado!");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Falha desconhecida ao capturar o mapa.";
      toast.error("Erro ao gerar PDF", {
        description: `${msg} Como fallback, use Ctrl+P.`,
      });
    } finally {
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
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "24px",
          }}
        >
          <p
            style={{
              fontFamily: "Barlow, sans-serif",
              fontSize: "38px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              margin: 0,
            }}
          >
            FinTax
          </p>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "1px", margin: 0 }}>
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
