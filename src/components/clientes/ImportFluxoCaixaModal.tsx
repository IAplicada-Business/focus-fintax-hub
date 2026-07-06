import { useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, AlertTriangle, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseAbasFluxo, type ImportFluxoResultado, type TributoEnum } from "@/lib/import-fluxo-parser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const normChave = (s: string | null | undefined) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;]+$/g, "")
    .trim();

export function ImportFluxoCaixaModal({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [resultado, setResultado] = useState<ImportFluxoResultado | null>(null);
  const [clientesDb, setClientesDb] = useState<{ id: string; cnpj: string | null; empresa: string | null }[]>([]);
  const [stats, setStats] = useState({
    linhasInseridas: 0,
    dcompsInseridas: 0,
    linhasSemMatchCliente: 0,
    conflicts: 0,
  });

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const parsed = parseAbasFluxo(wb, XLSX);

      if (parsed.compensacoes.length === 0) {
        toast.error("Nenhuma linha de compensação encontrada.", {
          description: (parsed.warnings.slice(0, 3).join(" · ") || parsed.abasIgnoradas.slice(0, 3).map((a) => `${a.aba}: ${a.motivo}`).join(" · ")),
        });
        return;
      }

      const { data: clientes } = await supabase.from("clientes").select("id, cnpj, empresa");
      setClientesDb(clientes || []);
      setResultado(parsed);
      setStep("preview");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao ler planilha", { description: String(e) });
    }
  };

  // Pré-match cliente por CNPJ → razão social
  const cnpjIdx = new Map(clientesDb.filter((c) => c.cnpj).map((c) => [soDigitos(c.cnpj), c.id]));
  const razaoIdx = new Map(clientesDb.map((c) => [normChave(c.empresa), c.id]));

  const preview = resultado?.compensacoes.map((c) => {
    const byCnpj = c.cnpj_norm ? cnpjIdx.get(c.cnpj_norm) : undefined;
    const byRazao = razaoIdx.get(c.razao_social_norm);
    return {
      comp: c,
      clienteId: byCnpj || byRazao || null,
      matchMode: byCnpj ? "cnpj" : byRazao ? "razao" : "sem_match",
    };
  }) ?? [];

  const semMatch = preview.filter((p) => p.matchMode === "sem_match");
  const comMatch = preview.filter((p) => p.matchMode !== "sem_match");

  const handleImport = async () => {
    if (!resultado) return;
    setStep("importing");

    // Puxa catálogo de teses pra ligar tese_origem_id (fallback: null)
    // Aqui a heurística é simples: sem informação de tese na fluxo caixa,
    // deixa tese_origem_id = null e o operador ajusta manualmente. O
    // motor de motivos já grava tributo_enum corretamente.

    let linhasInseridas = 0;
    let dcompsInseridas = 0;
    let linhasSemMatchCliente = 0;
    let conflicts = 0;

    for (const p of preview) {
      if (!p.clienteId) {
        linhasSemMatchCliente++;
        continue;
      }
      const c = p.comp;

      for (const t of c.tributos) {
        const insertPayload: any = {
          cliente_id: p.clienteId,
          mes_referencia: c.competencia,
          tributo_enum: t.tributo,
          tributo: t.tributo,             // legado (deprecar 1 sprint)
          valor_compensado: t.valor,
          honorario_valor: c.honorario_valor,
          honorario_percentual: c.honorario_percentual,
          lancado_mapa: c.lancado_mapa,
          vencimento_debito: c.vencimento_debito?.toISOString().slice(0, 10) ?? null,
          nfse_valor: c.nfse_valor,
          observacao:
            [
              t.observacao_agregacao,
              `Importado via fluxo caixa (${c.aba.trim()}, variante ${c.variante})`,
            ]
              .filter(Boolean)
              .join(" | "),
        };

        // upsert via UNIQUE (cliente_id, mes_referencia, tributo_enum, tese_origem_id)
        // tese_origem_id é NULL — em PG, NULL não bate no UNIQUE, então cada import
        // recria; pra evitar duplicatas, verificamos existência antes.
        const { data: existente } = await supabase
          .from("compensacoes_mensais")
          .select("id")
          .eq("cliente_id", p.clienteId)
          .eq("mes_referencia", c.competencia)
          .eq("tributo_enum", t.tributo as any)
          .is("tese_origem_id", null)
          .maybeSingle();

        if (existente?.id) {
          // update
          const { error } = await supabase
            .from("compensacoes_mensais")
            .update(insertPayload as any)
            .eq("id", existente.id);
          if (!error) linhasInseridas++;
          else conflicts++;
        } else {
          const { data: novo, error } = await supabase
            .from("compensacoes_mensais")
            .insert(insertPayload as any)
            .select("id")
            .single();
          if (error || !novo) {
            conflicts++;
            continue;
          }
          linhasInseridas++;

          // Insert DCOMPs vinculadas a essa compensação
          for (const numero of c.dcomps) {
            const { error: dcErr } = await (supabase.from("dcomps") as any).upsert(
              { compensacao_id: novo.id, numero_declaracao: numero },
              { onConflict: "compensacao_id,numero_declaracao" }
            );
            if (!dcErr) dcompsInseridas++;
          }
        }
      }
    }

    setStats({ linhasInseridas, dcompsInseridas, linhasSemMatchCliente, conflicts });
    setStep("done");
  };

  const handleClose = () => {
    onOpenChange(false);
    if (step === "done") onImported();
    setTimeout(() => {
      setResultado(null);
      setStep("upload");
      setStats({ linhasInseridas: 0, dcompsInseridas: 0, linhasSemMatchCliente: 0, conflicts: 0 });
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">Importar Fluxo de Caixa</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Compensações mensais por tributo + DCOMPs.<br />
              Detecta automaticamente as variantes <strong>antigo / transição / novo</strong>.<br />
              Ignora abas de consolidação e obsoletas (com "(2)" no nome).<br />
              <span className="text-[11px]">Requer que os clientes já estejam cadastrados (via Formato A).</span>
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button asChild variant="outline">
                <span>Selecionar arquivo .xlsx</span>
              </Button>
            </label>
          </div>
        )}

        {step === "preview" && resultado && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="secondary" className="bg-dash-green/10 text-dash-green">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {comMatch.length} compensações vão inserir
              </Badge>
              {semMatch.length > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {semMatch.length} sem cliente cadastrado
                </Badge>
              )}
              <Badge variant="secondary">
                {resultado.abasIgnoradas.length} abas ignoradas
              </Badge>
              <Badge variant="secondary" className="bg-cyan-100 text-cyan-800">
                DCOMPs: {resultado.compensacoes.reduce((s, c) => s + c.dcomps.length, 0)}
              </Badge>
            </div>

            {resultado.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 max-h-32 overflow-y-auto">
                <div className="font-semibold mb-1">Warnings ({resultado.warnings.length}):</div>
                {resultado.warnings.slice(0, 20).map((w, i) => (
                  <div key={i} className="mb-0.5">• {w}</div>
                ))}
                {resultado.warnings.length > 20 && (
                  <div className="text-[10px] italic mt-1">...+ {resultado.warnings.length - 20} outros.</div>
                )}
              </div>
            )}

            <div className="border rounded-md overflow-auto max-h-[380px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aba</TableHead>
                    <TableHead>R</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Tributos</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    <TableHead>DCOMPs</TableHead>
                    <TableHead>MAPA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 200).map((p, i) => {
                    const c = p.comp;
                    const somaValor = c.tributos.reduce((s, t) => s + t.valor, 0);
                    return (
                      <TableRow key={i} className={p.matchMode === "sem_match" ? "opacity-60" : ""}>
                        <TableCell className="text-[10px] text-muted-foreground">{c.aba.trim()}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{c.linha_planilha}</TableCell>
                        <TableCell className="text-[10px] font-mono">{c.competencia.slice(0, 7)}</TableCell>
                        <TableCell className="text-xs font-medium max-w-52 truncate">{c.razao_social_raw}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={
                            c.variante === "novo" ? "bg-emerald-100 text-emerald-800 text-[10px]" :
                            c.variante === "transicao" ? "bg-cyan-100 text-cyan-800 text-[10px]" :
                            "bg-slate-100 text-slate-700 text-[10px]"
                          }>{c.variante}</Badge>
                        </TableCell>
                        <TableCell>
                          {p.matchMode === "cnpj" && <Badge variant="secondary" className="bg-dash-green/10 text-dash-green text-[10px]">CNPJ</Badge>}
                          {p.matchMode === "razao" && <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px]">razão</Badge>}
                          {p.matchMode === "sem_match" && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">sem match</Badge>}
                        </TableCell>
                        <TableCell className="text-[10px]">
                          {c.tributos.map((t) => <span key={t.tributo} className="mr-1">{t.tributo}</span>)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold">{fmt(somaValor)}</TableCell>
                        <TableCell className="text-[10px]">{c.dcomps.length || "—"}</TableCell>
                        <TableCell>{c.lancado_mapa ? "OK" : ""}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {preview.length > 200 && (
                <div className="text-[10px] text-muted-foreground p-2 border-t">
                  Mostrando 200 de {preview.length} linhas. Todas serão importadas ao confirmar.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleImport} disabled={comMatch.length === 0}>
                Confirmar importação ({comMatch.length} compensações)
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando fluxo de caixa...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-dash-green" />
            <p className="text-lg font-display font-bold text-navy">Importação concluída!</p>
            <div className="text-sm text-muted-foreground text-center">
              <div>{stats.linhasInseridas} compensações criadas/atualizadas</div>
              <div>{stats.dcompsInseridas} DCOMPs vinculadas</div>
              {stats.linhasSemMatchCliente > 0 && (
                <div className="text-amber-700 mt-2 flex items-center gap-1 justify-center">
                  <AlertTriangle className="h-3.5 w-3.5" /> {stats.linhasSemMatchCliente} linhas puladas (cliente não cadastrado)
                </div>
              )}
              {stats.conflicts > 0 && (
                <div className="text-red-700 mt-1 flex items-center gap-1 justify-center">
                  <XCircle className="h-3.5 w-3.5" /> {stats.conflicts} conflitos ao inserir
                </div>
              )}
            </div>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
