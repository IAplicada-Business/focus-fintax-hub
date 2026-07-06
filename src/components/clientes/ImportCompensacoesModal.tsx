import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logClienteHistorico } from "@/lib/cliente-historico";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const TRIBUTO_OPTIONS = ["INSS", "PIS/COFINS", "IRPJ", "CSLL", "ICMS", "Outros"];

function normalizeTributo(raw: string): string | null {
  if (!raw) return null;
  const s = raw.toString().toUpperCase().trim();
  if (s.includes("PIS") && s.includes("COFINS")) return "PIS/COFINS";
  if (s === "PIS" || s === "COFINS") return "PIS/COFINS";
  if (s.includes("INSS")) return "INSS";
  if (s.includes("ICMS")) return "ICMS";
  if (s.includes("IRPJ")) return "IRPJ";
  if (s.includes("CSLL")) return "CSLL";
  if (s.includes("OUTRO")) return "Outros";
  return null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedRow {
  empresa: string;
  cnpj: string;
  cnpjNorm: string;
  tributo: string | null;
  dez: number;
  jan: number;
  fev: number;
  honorario: number;
  saldo: number;
  clienteId?: string;
  matched: boolean;
}

function normCnpj(raw: string): string {
  return (raw || "").replace(/[^\d]/g, "");
}

function parseMoneyCell(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").replace("-", "0").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function ImportCompensacoesModal({ open, onOpenChange, onImported }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [result, setResult] = useState({ compensacoes: 0, clientes: 0 });
  // Tributo desta planilha — usado quando o XLSX não tem coluna TRIBUTO
  const [tributoGlobal, setTributoGlobal] = useState<string>("");
  // Flag: pelo menos uma linha veio com TRIBUTO na planilha?
  const [tributoInSheet, setTributoInSheet] = useState(false);

  const handleFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    // Find header row
    const headerIdx = jsonData.findIndex(row =>
      row.some((cell: any) => String(cell).toUpperCase().includes("EMPRESAS"))
    );
    if (headerIdx < 0) {
      toast.error("Formato inválido — não encontrei a coluna EMPRESAS");
      return;
    }

    const headerRow = jsonData[headerIdx].map((c: any) => String(c).toUpperCase().trim());

    // Find column indices
    const colEmpresa = headerRow.findIndex((h: string) => h.includes("EMPRESA"));
    const colCnpj = headerRow.findIndex((h: string) => h.includes("CNPJ"));
    const colTributo = headerRow.findIndex((h: string) => h === "TRIBUTO" || h.includes("TRIBUTOS"));
    const colDez = headerRow.findIndex((h: string) => h === "DEZ" || h.includes("DEZEMBRO"));
    const colJan = headerRow.findIndex((h: string) => h === "JAN" || h.includes("JANEIRO"));
    const colFev = headerRow.findIndex((h: string) => h === "FEV" || h.includes("FEVEREIRO"));
    const colHonorario = headerRow.findIndex((h: string) => h.includes("HONORARIO") || h.includes("HONORÁRIO"));
    const colSaldo = headerRow.findIndex((h: string) => h.includes("SALDO"));

    if (colEmpresa < 0 || colCnpj < 0) {
      toast.error("Colunas EMPRESAS e CNPJ são obrigatórias");
      return;
    }

    const dataRows = jsonData.slice(headerIdx + 1).filter(row => {
      const cnpj = normCnpj(String(row[colCnpj] || ""));
      return cnpj.length >= 11 && String(row[colEmpresa] || "").trim().length > 0;
    });

    const parsed: ParsedRow[] = dataRows.map(row => ({
      empresa: String(row[colEmpresa] || "").trim(),
      cnpj: String(row[colCnpj] || "").trim(),
      cnpjNorm: normCnpj(String(row[colCnpj] || "")),
      tributo: colTributo >= 0 ? normalizeTributo(String(row[colTributo] || "")) : null,
      dez: colDez >= 0 ? parseMoneyCell(row[colDez]) : 0,
      jan: colJan >= 0 ? parseMoneyCell(row[colJan]) : 0,
      fev: colFev >= 0 ? parseMoneyCell(row[colFev]) : 0,
      honorario: colHonorario >= 0 ? parseMoneyCell(row[colHonorario]) : 0,
      saldo: colSaldo >= 0 ? parseMoneyCell(row[colSaldo]) : 0,
      matched: false,
    }));

    setTributoInSheet(colTributo >= 0 && parsed.some((r) => r.tributo));

    // Match with DB clients
    const { data: clientes } = await supabase.from("clientes").select("id, cnpj, empresa");
    const clienteMap = new Map<string, string>();
    (clientes || []).forEach(c => clienteMap.set(normCnpj(c.cnpj), c.id));

    parsed.forEach(r => {
      const id = clienteMap.get(r.cnpjNorm);
      if (id) {
        r.clienteId = id;
        r.matched = true;
      }
    });

    setRows(parsed);
    setStep("preview");
  };

  const handleImport = async () => {
    setStep("importing");
    const matched = rows.filter(r => r.matched && r.clienteId);
    let totalComp = 0;
    const clienteIds = new Set<string>();

    for (const row of matched) {
      const clienteId = row.clienteId!;
      const rowTributo = row.tributo || tributoGlobal || null;

      // Get or create a process for this client — preferindo o que cobre o tributo
      const { data: procs } = await supabase
        .from("processos_teses")
        .select("id, tributo" as any)
        .eq("cliente_id", clienteId) as any;

      let processoId: string;
      const procMatchTributo = rowTributo
        ? (procs || []).find((p: any) => p.tributo === rowTributo)
        : null;
      const procAny = (procs || [])[0];

      if (procMatchTributo) {
        processoId = procMatchTributo.id;
      } else if (procAny && !rowTributo) {
        // sem tributo definido — reaproveita qualquer processo existente (comportamento legado)
        processoId = procAny.id;
      } else {
        const nomeExibicao = rowTributo
          ? `Importação Planilha — ${rowTributo}`
          : "Importação Planilha";
        const { data: newProc } = await supabase
          .from("processos_teses")
          .insert({
            cliente_id: clienteId,
            tese: "importacao_xlsx",
            nome_exibicao: nomeExibicao,
            status_contrato: "assinado",
            status_processo: "compensando",
            valor_credito: row.saldo + row.dez + row.jan + row.fev,
            tributo: rowTributo,
          } as any)
          .select("id")
          .single();
        processoId = newProc?.id || "";
      }

      if (!processoId) continue;

      const months: { date: string; value: number }[] = [];
      if (row.dez > 0) months.push({ date: "2024-12-01", value: row.dez });
      if (row.jan > 0) months.push({ date: "2025-01-01", value: row.jan });
      if (row.fev > 0) months.push({ date: "2025-02-01", value: row.fev });

      if (months.length === 0) continue;

      const honorarioPorMes = months.length > 0 ? row.honorario / months.length : 0;

      const inserts = months.map(m => ({
        cliente_id: clienteId,
        processo_tese_id: processoId,
        mes_referencia: m.date,
        valor_compensado: m.value,
        valor_nf_servico: Math.round(honorarioPorMes * 100) / 100,
        status_pagamento: "pendente" as const,
        observacao: "Importado via planilha XLSX",
        tributo: rowTributo,
      }));

      const { error } = await supabase.from("compensacoes_mensais").insert(
        inserts.map(i => ({ ...i, tributo_enum: "outros" })) as any
      );
      if (!error) {
        totalComp += inserts.length;
        clienteIds.add(clienteId);
        const totalVal = months.reduce((s, m) => s + m.value, 0);
        await logClienteHistorico(
          clienteId,
          "compensacao_adicionada",
          `Importação em lote: ${inserts.length} meses, total ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalVal)}`
        );
      }
    }

    setResult({ compensacoes: totalComp, clientes: clienteIds.size });
    setStep("done");
  };

  const handleClose = () => {
    onOpenChange(false);
    if (step === "done") onImported();
    setTimeout(() => {
      setRows([]);
      setStep("upload");
      setResult({ compensacoes: 0, clientes: 0 });
      setTributoGlobal("");
      setTributoInSheet(false);
    }, 300);
  };

  const matchedCount = rows.filter(r => r.matched).length;
  const unmatchedCount = rows.length - matchedCount;
  const totalMeses = rows.filter(r => r.matched).reduce((s, r) => s + (r.dez > 0 ? 1 : 0) + (r.jan > 0 ? 1 : 0) + (r.fev > 0 ? 1 : 0), 0);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">Importar Compensações (XLSX)</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Selecione a planilha de compensações.<br />
              Formato esperado: EMPRESAS, CNPJ, meses (DEZ, JAN, FEV...), HONORARIO, SALDO<br />
              <span className="text-[11px]">Opcional: coluna TRIBUTO. Sem ela, use o seletor abaixo pra aplicar um tributo global.</span>
            </p>
            <div className="w-full max-w-xs">
              <Label className="text-xs">Tributo desta planilha (fallback)</Label>
              <Select value={tributoGlobal} onValueChange={setTributoGlobal}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="— nenhum —" />
                </SelectTrigger>
                <SelectContent>
                  {TRIBUTO_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Aplicado a linhas sem coluna TRIBUTO na planilha.
              </p>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
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

        {step === "preview" && (
          <>
            <div className="flex flex-wrap gap-3 mb-3 items-center">
              <Badge variant="secondary" className="bg-dash-green/10 text-dash-green">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {matchedCount} encontrados
              </Badge>
              {unmatchedCount > 0 && (
                <Badge variant="secondary" className="bg-dash-red/10 text-dash-red">
                  <XCircle className="h-3 w-3 mr-1" /> {unmatchedCount} não encontrados
                </Badge>
              )}
              <Badge variant="secondary">
                {totalMeses} registros a importar
              </Badge>
              {tributoInSheet ? (
                <Badge variant="secondary" className="bg-cyan-100 text-cyan-800">
                  Tributo por linha (planilha)
                </Badge>
              ) : tributoGlobal ? (
                <Badge variant="secondary" className="bg-cyan-100 text-cyan-800">
                  Tributo global: {tributoGlobal}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  Sem tributo definido — linhas ficarão sem classificação
                </Badge>
              )}
            </div>

            <div className="border rounded-md overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Tributo</TableHead>
                    <TableHead>DEZ</TableHead>
                    <TableHead>JAN</TableHead>
                    <TableHead>FEV</TableHead>
                    <TableHead>Honorário</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const effectiveTributo = r.tributo || tributoGlobal || null;
                    return (
                      <TableRow key={i} className={!r.matched ? "opacity-50" : ""}>
                        <TableCell className="text-xs font-medium">{r.empresa}</TableCell>
                        <TableCell className="text-xs font-mono">{r.cnpj}</TableCell>
                        <TableCell className="text-xs">
                          {effectiveTributo ? (
                            <Badge variant="secondary" className="text-[10px]">{effectiveTributo}</Badge>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.dez > 0 ? fmt(r.dez) : "—"}</TableCell>
                        <TableCell className="text-xs">{r.jan > 0 ? fmt(r.jan) : "—"}</TableCell>
                        <TableCell className="text-xs">{r.fev > 0 ? fmt(r.fev) : "—"}</TableCell>
                        <TableCell className="text-xs">{fmt(r.honorario)}</TableCell>
                        <TableCell>
                          {r.matched ? (
                            <Badge variant="secondary" className="bg-dash-green/10 text-dash-green text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> OK
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-dash-red/10 text-dash-red text-[10px]">
                              <XCircle className="h-3 w-3 mr-0.5" /> Não encontrado
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleImport} disabled={matchedCount === 0}>
                Confirmar importação ({matchedCount} clientes)
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando compensações...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-dash-green" />
            <p className="text-lg font-display font-bold text-navy">Importação concluída!</p>
            <p className="text-sm text-muted-foreground">
              {result.compensacoes} compensações importadas para {result.clientes} clientes
            </p>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
