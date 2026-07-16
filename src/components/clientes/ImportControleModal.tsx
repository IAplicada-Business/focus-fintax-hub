import { useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, AlertTriangle, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseAbaControle, type ImportControleResultado, type TeseCodigoEnum } from "@/lib/import-controle-parser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface DBTese {
  id: string;
  codigo: TeseCodigoEnum;
}

interface DBCliente {
  id: string;
  cnpj: string | null;
  empresa: string | null;
}

function normalizarChave(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;]+$/g, "")
    .trim();
}

function soDigitos(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function ImportControleModal({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [resultado, setResultado] = useState<ImportControleResultado | null>(null);
  const [teseCatalog, setTeseCatalog] = useState<DBTese[]>([]);
  const [clientesDb, setClientesDb] = useState<DBCliente[]>([]);
  const [importStats, setImportStats] = useState({
    clientesUpserted: 0,
    creditosUpserted: 0,
    linhasSemMatch: 0,
  });

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const parsed = parseAbaControle(wb, XLSX);

      if (parsed.linhas.length === 0) {
        toast.error("Nenhuma linha de cliente encontrada.", {
          description: parsed.warnings.join(" · "),
        });
        return;
      }

      // Puxa catálogo de teses e clientes existentes pra pré-match
      const [{ data: teses }, { data: clientes }] = await Promise.all([
        supabase.from("teses_tributarias").select("id, codigo") as any,
        supabase.from("clientes").select("id, cnpj, empresa"),
      ]);
      setTeseCatalog((teses || []) as DBTese[]);
      setClientesDb((clientes || []) as DBCliente[]);

      setResultado(parsed);
      setStep("preview");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao ler planilha", { description: String(e) });
    }
  };

  // Pré-computa match do cliente pra cada linha
  const matches = (() => {
    if (!resultado) return [];
    const cnpjIdx = new Map(clientesDb.filter((c) => c.cnpj).map((c) => [soDigitos(c.cnpj), c.id]));
    const razaoIdx = new Map(clientesDb.map((c) => [normalizarChave(c.empresa), c.id]));
    return resultado.linhas.map((l) => {
      const byCnpj = l.cnpj_norm ? cnpjIdx.get(l.cnpj_norm) : undefined;
      const byRazao = razaoIdx.get(l.razao_social_norm);
      return {
        linha: l,
        clienteId: byCnpj || byRazao || null,
        matchMode: byCnpj ? "cnpj" : byRazao ? "razao" : "novo",
      };
    });
  })();

  const handleImport = async () => {
    if (!resultado) return;
    setStep("importing");

    // Mapa código → id
    const teseIdByCode = new Map(teseCatalog.map((t) => [t.codigo, t.id]));

    let clientesUpserted = 0;
    let creditosUpserted = 0;
    let linhasSemMatch = 0;

    for (const m of matches) {
      const { linha } = m;
      let clienteId = m.clienteId;

      // Cria novo cliente se não deu match
      if (!clienteId) {
        const insertPayload: any = {
          empresa: linha.razao_social_raw,
          cnpj: linha.cnpj_norm ?? "",
          regime_tributario: linha.regime ?? null,
          status_operacional: linha.status_operacional ?? null,
          regiao: linha.regiao ?? null,
          data_apuracao: linha.data_apuracao?.toISOString().slice(0, 10) ?? null,
        };
        const { data: novo, error } = await supabase
          .from("clientes")
          .insert(insertPayload as any)
          .select("id")
          .single();
        if (error || !novo) {
          linhasSemMatch++;
          continue;
        }
        clienteId = novo.id;
        clientesUpserted++;
      } else {
        // Atualiza só campos que vieram preenchidos (não sobrescreve com null)
        const patch: Record<string, any> = {};
        if (linha.regime) patch.regime_tributario = linha.regime;
        if (linha.status_operacional) patch.status_operacional = linha.status_operacional;
        if (linha.regiao) patch.regiao = linha.regiao;
        if (linha.data_apuracao) patch.data_apuracao = linha.data_apuracao.toISOString().slice(0, 10);
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("clientes").update(patch as any).eq("id", clienteId);
          if (!error) clientesUpserted++;
        }
      }

      // Upsert créditos por tese (UNIQUE cliente_id, tese_id)
      for (const c of linha.creditos) {
        const teseId = teseIdByCode.get(c.tese);
        if (!teseId) continue;
        // Padrão Fox: só INSUMOS/SUBVENCAO entram no cálculo; REPORTO fica fora
        const incluirNoCalculo = c.tese === "INSUMOS" || c.tese === "SUBVENCAO";
        const { error } = await (supabase.from("creditos_apurados") as any).upsert(
          {
            cliente_id: clienteId,
            tese_id: teseId,
            valor_apurado_inicial: c.valor,
            data_apuracao: linha.data_apuracao?.toISOString().slice(0, 10) ?? null,
            incluir_no_calculo: incluirNoCalculo,
          },
          { onConflict: "cliente_id,tese_id" }
        );
        if (!error) creditosUpserted++;
      }
    }

    setImportStats({ clientesUpserted, creditosUpserted, linhasSemMatch });
    setStep("done");
  };

  const handleClose = () => {
    onOpenChange(false);
    if (step === "done") onImported();
    setTimeout(() => {
      setResultado(null);
      setStep("upload");
      setImportStats({ clientesUpserted: 0, creditosUpserted: 0, linhasSemMatch: 0 });
    }, 300);
  };

  const totalCreditos = resultado
    ? Object.values(resultado.totalCreditos).reduce((s, v) => s + v, 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">Importar Cadastro (aba Controle)</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Cadastro-mestre + crédito inicial por tese.<br />
              Formato esperado: aba <strong>Controle</strong> com colunas EMPRESAS / CNPJ / Regime / Status /
              Região / INSUMOS / SUBVENÇÃO / ICMS ST / EXCLUSÃO ICMS / PIS+COFINS JUDC / PREVIDENCIÁRIO / REPORTO.
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
            {/* Summary badges */}
            <div className="flex flex-wrap gap-3 items-center">
              <Badge variant="secondary" className="bg-dash-green/10 text-dash-green">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {resultado.linhas.length} clientes
              </Badge>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Créditos totais: {fmt(totalCreditos)}
              </Badge>
              {resultado.rejeitadas.length > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {resultado.rejeitadas.length} linhas descartadas
                </Badge>
              )}
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                REPORTO: {fmt(resultado.totalCreditos.REPORTO)}
              </Badge>
            </div>

            {resultado.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 max-h-40 overflow-y-auto">
                {resultado.warnings.map((w, i) => (
                  <div key={i} className="mb-1">• {w}</div>
                ))}
              </div>
            )}

            <div className="border rounded-md overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>R</TableHead>
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Regime</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m, i) => {
                    const somaCred = m.linha.creditos.reduce((s, c) => s + c.valor, 0);
                    const matchBadge = m.matchMode === "cnpj"
                      ? <Badge variant="secondary" className="bg-dash-green/10 text-dash-green text-[10px]">CNPJ</Badge>
                      : m.matchMode === "razao"
                      ? <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px]">razão</Badge>
                      : <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">novo</Badge>;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-[10px] text-muted-foreground">{m.linha.linha_planilha}</TableCell>
                        <TableCell className="text-xs font-medium max-w-64 truncate">{m.linha.razao_social_raw}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {m.linha.cnpj_raw || <span className="italic text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">{m.linha.regime ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell>{matchBadge}</TableCell>
                        <TableCell className="text-xs text-right font-semibold">{fmt(somaCred)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleImport}>Confirmar importação ({resultado.linhas.length} clientes)</Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando cadastro...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-dash-green" />
            <p className="text-lg font-display font-bold text-navy">Importação concluída!</p>
            <div className="text-sm text-muted-foreground text-center">
              <div>{importStats.clientesUpserted} clientes criados/atualizados</div>
              <div>{importStats.creditosUpserted} créditos apurados</div>
              {importStats.linhasSemMatch > 0 && (
                <div className="text-amber-700 mt-2 flex items-center gap-1 justify-center">
                  <XCircle className="h-3.5 w-3.5" /> {importStats.linhasSemMatch} linhas com erro
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
