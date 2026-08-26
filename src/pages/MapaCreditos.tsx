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
import { formatCurrencyBR, type CompensacaoSumRow } from "@/lib/clientes-constants";
import {
  ORDEM_TESES,
  STATUS_LABEL,
  STATUS_STYLE,
  buildLinhasMapa,
  type ClienteMapa,
  type LinhaMapa,
} from "@/lib/mapa-creditos";
import { exportElementToPdf, sanitizePdfFileName } from "@/lib/export-element-pdf";
import MapaCreditosView from "@/components/mapa/MapaCreditosView";

export default function MapaCreditos() {
  const { id: clienteId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState<ClienteMapa | null>(null);
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

      const rows = buildLinhasMapa({
        mapa: (v || []) as LinhaMapa[],
        compensacoes: (comps || []) as CompensacaoSumRow[],
        processos: (procs || []) as { id: string; tese: string | null }[],
        creditos: (creditos || []) as { tese_id: string; valor_compensado_manual: number | null }[],
      });

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
      <MapaCreditosView
        cliente={cliente}
        linhas={linhasVisiveis}
        onToggleIncluir={toggleIncluirCalculo}
        filtroAtivo={teseFiltroSet.size < teseCodesUnicos.length}
        printRef={pdfRef}
      />
    </div>
  );
}
