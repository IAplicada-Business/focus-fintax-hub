import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { loadXlsx } from "@/lib/lazy-libs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useEquipeComercial } from "@/hooks/data/useEquipeComercial";
import { useAnalisarLeadsEmLote } from "@/hooks/data/useAnalisarLeadsEmLote";
import {
  atualizarImportacaoLeads,
  criarImportacaoLeads,
  inserirLeadsEmLote,
  listLeadsChavesDedupe,
} from "@/services/leadsService";
import {
  CAMPOS_LEAD,
  CAMPO_LEAD_LABEL,
  deduplicarLeads,
  detectarMapeamento,
  elegivelDiagnostico,
  formatarCnpj,
  formatarTelefoneBR,
  lerPrimeiraAba,
  linhasParaLeads,
  type CampoLead,
  type LeadImportado,
  type MapeamentoColunas,
  type PlanilhaLida,
} from "@/lib/import-leads-parser";
import { PRODUTOS_LEAD, PRODUTO_LEAD_LABEL, type ProdutoLead } from "@/lib/produto-lead";
import { ORIGENS } from "@/lib/pipeline-constants";
import { FATURAMENTO_FAIXAS } from "@/lib/lead-constants";
import { closersDaEquipe, sdrsDaEquipe } from "@/lib/equipe-comercial";
import { toastError } from "@/lib/handle-error";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type Etapa = "arquivo" | "lote" | "preview" | "importando" | "resultado";

const IGNORAR = "__ignorar";
const SOLTO = "__solto";
const PREVIEW_LINHAS = 20;

interface ResultadoImportacao {
  inseridos: number;
  erros: string[];
  diagnosticos: { elegiveis: number; concluidos: number; falhas: number } | null;
}

/**
 * Importação de leads por planilha (listas de prospecção de até 20k
 * contatos). Quatro passos: arquivo + mapeamento de colunas, configuração do
 * lote (produto, origem, dono), prévia com duplicados e, por fim, inserção
 * em blocos com diagnóstico automático opcional.
 */
export function ImportLeadsModal({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { data: equipe = [] } = useEquipeComercial(open);
  const analiseLote = useAnalisarLeadsEmLote(3);

  const [etapa, setEtapa] = useState<Etapa>("arquivo");
  const [arquivoNome, setArquivoNome] = useState("");
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null);
  const [mapeamento, setMapeamento] = useState<MapeamentoColunas>({});
  const [lendo, setLendo] = useState(false);

  const [produto, setProduto] = useState<ProdutoLead | "">("");
  const [origem, setOrigem] = useState("prospeccao_ativa");
  const [sdrId, setSdrId] = useState(SOLTO);
  const [closerId, setCloserId] = useState(SOLTO);
  const [gerarDiagnostico, setGerarDiagnostico] = useState(true);

  const [existentes, setExistentes] = useState<{ cnpj: string; whatsapp: string; email: string }[]>([]);
  const [carregandoExistentes, setCarregandoExistentes] = useState(false);
  const [progressoInsert, setProgressoInsert] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  useEffect(() => {
    if (open) return;
    // Fecha limpo: a próxima lista começa do zero.
    setEtapa("arquivo");
    setArquivoNome("");
    setPlanilha(null);
    setMapeamento({});
    setProduto("");
    setOrigem("prospeccao_ativa");
    setSdrId(SOLTO);
    setCloserId(SOLTO);
    setGerarDiagnostico(true);
    setResultado(null);
    setProgressoInsert({ feitos: 0, total: 0 });
    analiseLote.reiniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFile = async (file: File) => {
    setLendo(true);
    try {
      const XLSX = await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: true });
      const lida = lerPrimeiraAba(wb, XLSX);
      if (lida.linhas.length === 0) {
        toast.error("Nenhuma linha de dados encontrada na primeira aba.");
        return;
      }
      setArquivoNome(file.name);
      setPlanilha(lida);
      setMapeamento(detectarMapeamento(lida.headers));
    } catch (e) {
      toastError(e, "Erro ao ler planilha");
    } finally {
      setLendo(false);
    }
  };

  const mapeamentoOk = mapeamento.nome !== undefined || mapeamento.empresa !== undefined;

  const trocarMapeamento = (campo: CampoLead, valor: string) => {
    setMapeamento((prev) => {
      const next = { ...prev };
      if (valor === IGNORAR) {
        delete next[campo];
        return next;
      }
      const idx = Number(valor);
      // Uma coluna só alimenta um campo: tira de quem a usava.
      for (const c of CAMPOS_LEAD) if (next[c] === idx) delete next[c];
      next[campo] = idx;
      return next;
    });
  };

  const irParaPreview = async () => {
    if (!produto) {
      toast.error("Selecione o produto da lista.");
      return;
    }
    setCarregandoExistentes(true);
    try {
      const rows = await listLeadsChavesDedupe();
      setExistentes(rows.map((r) => ({ cnpj: r.cnpj ?? "", whatsapp: r.whatsapp ?? "", email: r.email ?? "" })));
      setEtapa("preview");
    } catch (e) {
      toastError(e, "Erro ao conferir leads existentes");
    } finally {
      setCarregandoExistentes(false);
    }
  };

  const analise = useMemo(() => {
    if (!planilha || !produto) return null;
    const { leads, invalidos } = linhasParaLeads(
      planilha.linhas,
      mapeamento,
      { produto, origem, sdrId: sdrId === SOLTO ? null : sdrId, closerId: closerId === SOLTO ? null : closerId },
      planilha.linhaCabecalho,
    );
    const dedupe = deduplicarLeads(leads, existentes);
    return { invalidos, ...dedupe, elegiveis: dedupe.novos.filter(elegivelDiagnostico).length };
  }, [planilha, mapeamento, produto, origem, sdrId, closerId, existentes]);

  const importar = async () => {
    if (!analise || !planilha || !produto) return;
    setEtapa("importando");
    setProgressoInsert({ feitos: 0, total: analise.novos.length });

    let importacaoId: string | null = null;
    try {
      importacaoId = await criarImportacaoLeads({
        nome_arquivo: arquivoNome,
        produto,
        origem,
        sdr_id: sdrId === SOLTO ? null : sdrId,
        closer_id: closerId === SOLTO ? null : closerId,
        total_linhas: planilha.linhas.length,
        duplicados: analise.duplicadosArquivo.length + analise.jaExistentes.length,
        invalidos: analise.invalidos.length,
      });
    } catch (e) {
      toastError(e, "Erro ao registrar a importação");
      setEtapa("preview");
      return;
    }

    const payload = analise.novos.map((l: LeadImportado) => ({
      nome: l.nome,
      empresa: l.empresa,
      cnpj: l.cnpj ? formatarCnpj(l.cnpj) : "",
      email: l.email,
      whatsapp: l.whatsapp ? formatarTelefoneBR(l.whatsapp) : "",
      faturamento_faixa: l.faturamento_faixa,
      regime_tributario: l.regime_tributario,
      segmento: l.segmento,
      origem: l.origem,
      observacoes: l.observacoes,
      produto: l.produto,
      sdr_id: l.sdr_id,
      closer_id: l.closer_id,
      status: "novo",
      status_funil: "novo",
      created_by: user?.id ?? null,
      importacao_id: importacaoId,
    }));

    const { ids, erros } = await inserirLeadsEmLote(payload, (feitos, total) => setProgressoInsert({ feitos, total }));

    try {
      await atualizarImportacaoLeads(importacaoId, { inseridos: ids.length, erros });
    } catch {
      /* contadores são auditoria; a importação em si já aconteceu */
    }

    let diagnosticos: ResultadoImportacao["diagnosticos"] = null;
    if (gerarDiagnostico) {
      const elegiveis = ids.filter(elegivelDiagnostico).map((l) => l.id);
      if (elegiveis.length > 0) {
        const r = await analiseLote.analisar(elegiveis);
        diagnosticos = { elegiveis: elegiveis.length, ...r };
      } else {
        diagnosticos = { elegiveis: 0, concluidos: 0, falhas: 0 };
      }
    }

    setResultado({ inseridos: ids.length, erros, diagnosticos });
    setEtapa("resultado");
    onImported();
    if (ids.length > 0) toast.success(`${ids.length} lead${ids.length === 1 ? "" : "s"} importado${ids.length === 1 ? "" : "s"}`);
  };

  const colunaOpcoes = planilha?.headers.map((h, i) => ({ value: String(i), label: h || `Coluna ${i + 1}` })) ?? [];
  const faixaLabel = (v: string) => FATURAMENTO_FAIXAS.find((f) => f.value === v)?.label ?? "—";

  return (
    <Dialog open={open} onOpenChange={(o) => (etapa === "importando" ? null : onOpenChange(o))}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-navy" /> Importar leads de planilha
          </DialogTitle>
          <DialogDescription>
            {etapa === "arquivo" && "Escolha o arquivo (.xlsx ou .csv) e confira a que campo cada coluna corresponde."}
            {etapa === "lote" && "Configuração da lista: produto, origem e quem vai cuidar destes leads."}
            {etapa === "preview" && "Confira os números antes de importar. Duplicados e inválidos ficam de fora."}
            {etapa === "importando" && "Importando... não feche esta janela."}
            {etapa === "resultado" && "Importação concluída."}
          </DialogDescription>
        </DialogHeader>

        {/* Passo 1: arquivo + mapeamento */}
        {etapa === "arquivo" && (
          <div className="space-y-4">
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-06 bg-ink-03 px-4 py-6 text-center cursor-pointer hover:border-navy/40 transition-colors",
                lendo && "opacity-60 pointer-events-none",
              )}
            >
              {lendo ? <Loader2 className="h-6 w-6 animate-spin text-navy" /> : <Upload className="h-6 w-6 text-ink-35" />}
              <span className="text-sm font-semibold text-navy">{arquivoNome || "Clique para escolher a planilha"}</span>
              <span className="text-xs text-ink-35">.xlsx, .xls ou .csv · primeira aba · cabeçalho detectado automaticamente</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                data-testid="import-leads-arquivo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>

            {planilha && (
              <div className="space-y-2">
                <p className="text-xs text-ink-60">
                  <strong className="text-navy">{planilha.linhas.length}</strong> linhas na aba "{planilha.nomeAba}" · cabeçalho na linha {planilha.linhaCabecalho}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CAMPOS_LEAD.map((campo) => (
                    <div key={campo} className="flex items-center gap-2">
                      <Label className="text-xs w-36 shrink-0">
                        {CAMPO_LEAD_LABEL[campo]}
                        {(campo === "nome" || campo === "empresa") && <span className="text-ink-35"> *</span>}
                      </Label>
                      <Select value={mapeamento[campo] === undefined ? IGNORAR : String(mapeamento[campo])} onValueChange={(v) => trocarMapeamento(campo, v)}>
                        <SelectTrigger className="h-8 text-xs" aria-label={`Coluna de ${CAMPO_LEAD_LABEL[campo]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORAR}>— não importar —</SelectItem>
                          {colunaOpcoes.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {!mapeamentoOk && (
                  <p className="text-xs text-dash-red flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Mapeie pelo menos Nome ou Empresa.
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => setEtapa("lote")} disabled={!planilha || !mapeamentoOk} className="bg-navy hover:bg-navy/90">
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Passo 2: lote */}
        {etapa === "lote" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Produto *</Label>
                <Select value={produto} onValueChange={(v) => setProduto(v as ProdutoLead)}>
                  <SelectTrigger aria-label="Produto da lista"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{PRODUTOS_LEAD.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
                {mapeamento.produto !== undefined && <p className="text-[11px] text-ink-35">A coluna "Produto" da planilha prevalece quando preenchida.</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Origem *</Label>
                <Select value={origem} onValueChange={setOrigem}>
                  <SelectTrigger aria-label="Origem da lista"><SelectValue /></SelectTrigger>
                  <SelectContent>{ORIGENS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SDR</Label>
                <Select value={sdrId} onValueChange={setSdrId}>
                  <SelectTrigger aria-label="SDR da lista"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SOLTO}>Deixar solto (qualquer SDR)</SelectItem>
                    {sdrsDaEquipe(equipe).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || "Sem nome"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Closer</Label>
                <Select value={closerId} onValueChange={setCloserId}>
                  <SelectTrigger aria-label="Closer da lista"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SOLTO}>Sem closer</SelectItem>
                    {closersDaEquipe(equipe).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || "Sem nome"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={gerarDiagnostico} onCheckedChange={(v) => setGerarDiagnostico(v === true)} className="mt-0.5" />
              <span>
                Gerar diagnóstico automático para quem tiver faturamento e regime
                <span className="block text-xs text-ink-35">Roda o motor de teses lead a lead (3 por vez). Pode levar alguns minutos em listas grandes.</span>
              </span>
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEtapa("arquivo")}>Voltar</Button>
              <Button onClick={() => void irParaPreview()} disabled={!produto || carregandoExistentes} className="bg-navy hover:bg-navy/90">
                {carregandoExistentes ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Ver prévia
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Passo 3: prévia */}
        {etapa === "preview" && analise && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Contador label="Válidos" valor={analise.novos.length} tom="green" />
              <Contador label="Duplicados no arquivo" valor={analise.duplicadosArquivo.length} tom="amber" />
              <Contador label="Já no sistema" valor={analise.jaExistentes.length} tom="amber" />
              <Contador label="Inválidos" valor={analise.invalidos.length} tom="red" sub="sem nome e sem empresa" />
            </div>
            <p className="text-xs text-ink-60">
              Produto <strong className="text-navy">{PRODUTO_LEAD_LABEL[produto as ProdutoLead]}</strong>
              {gerarDiagnostico && (
                <> · diagnóstico automático para <strong className="text-navy">{analise.elegiveis}</strong> lead{analise.elegiveis === 1 ? "" : "s"} com faturamento e regime</>
              )}
            </p>

            <div className="rounded-lg border border-ink-06 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Linha</TableHead>
                    <TableHead className="text-xs">Empresa</TableHead>
                    <TableHead className="text-xs">Contato</TableHead>
                    <TableHead className="text-xs">CNPJ</TableHead>
                    <TableHead className="text-xs">WhatsApp</TableHead>
                    <TableHead className="text-xs">Faturamento</TableHead>
                    <TableHead className="text-xs">Regime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analise.novos.slice(0, PREVIEW_LINHAS).map((l) => (
                    <TableRow key={l.linha_planilha}>
                      <TableCell className="text-xs text-ink-35 tabular-nums">{l.linha_planilha}</TableCell>
                      <TableCell className="text-xs font-medium">{l.empresa}</TableCell>
                      <TableCell className="text-xs">{l.nome}</TableCell>
                      <TableCell className="text-xs font-mono">{l.cnpj ? formatarCnpj(l.cnpj) : "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{l.whatsapp ? formatarTelefoneBR(l.whatsapp) : "—"}</TableCell>
                      <TableCell className="text-xs">{faixaLabel(l.faturamento_faixa)}</TableCell>
                      <TableCell className="text-xs">{l.regime_tributario || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {analise.novos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-ink-35 py-6">Nenhum lead novo para importar.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {analise.novos.length > PREVIEW_LINHAS && (
              <p className="text-[11px] text-ink-35">Mostrando as primeiras {PREVIEW_LINHAS} de {analise.novos.length} linhas válidas.</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEtapa("lote")}>Voltar</Button>
              <Button onClick={() => void importar()} disabled={analise.novos.length === 0} className="bg-navy hover:bg-navy/90">
                <Upload className="h-4 w-4 mr-1" /> Importar {analise.novos.length} lead{analise.novos.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Passo 4: importando / resultado */}
        {(etapa === "importando" || etapa === "resultado") && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-navy">Inserindo leads</span>
                <span className="tabular-nums text-ink-60">{progressoInsert.feitos} / {progressoInsert.total}</span>
              </div>
              <Progress value={progressoInsert.total ? (progressoInsert.feitos / progressoInsert.total) * 100 : 0} />
            </div>
            {gerarDiagnostico && analiseLote.progresso.total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-navy">Gerando diagnósticos</span>
                  <span className="tabular-nums text-ink-60">
                    {analiseLote.progresso.concluidos + analiseLote.progresso.falhas} / {analiseLote.progresso.total}
                    {analiseLote.progresso.falhas > 0 && <span className="text-dash-red"> · {analiseLote.progresso.falhas} falha{analiseLote.progresso.falhas === 1 ? "" : "s"}</span>}
                  </span>
                </div>
                <Progress value={((analiseLote.progresso.concluidos + analiseLote.progresso.falhas) / analiseLote.progresso.total) * 100} />
              </div>
            )}

            {etapa === "importando" && (
              <p className="text-xs text-ink-35 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguarde...</p>
            )}

            {etapa === "resultado" && resultado && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Contador label="Inseridos" valor={resultado.inseridos} tom="green" />
                  <Contador label="Duplicados" valor={(analise?.duplicadosArquivo.length ?? 0) + (analise?.jaExistentes.length ?? 0)} tom="amber" />
                  <Contador label="Erros" valor={resultado.erros.length} tom={resultado.erros.length ? "red" : "muted"} />
                </div>
                {resultado.diagnosticos && (
                  <p className="text-sm text-ink-60 flex items-center gap-2">
                    {resultado.diagnosticos.falhas === 0 ? <CheckCircle2 className="h-4 w-4 text-dash-green" /> : <AlertTriangle className="h-4 w-4 text-dash-amber" />}
                    Diagnósticos: {resultado.diagnosticos.concluidos} gerado{resultado.diagnosticos.concluidos === 1 ? "" : "s"} de {resultado.diagnosticos.elegiveis} elegíve{resultado.diagnosticos.elegiveis === 1 ? "l" : "is"}
                    {resultado.diagnosticos.falhas > 0 && ` · ${resultado.diagnosticos.falhas} falha${resultado.diagnosticos.falhas === 1 ? "" : "s"} (reprocesse pela Fila de Leads)`}
                  </p>
                )}
                {resultado.erros.length > 0 && (
                  <ul className="text-xs text-dash-red space-y-1 max-h-32 overflow-y-auto">
                    {resultado.erros.map((e, i) => (
                      <li key={i} className="flex items-start gap-1"><XCircle className="h-3.5 w-3.5 mt-px shrink-0" /> {e}</li>
                    ))}
                  </ul>
                )}
                <DialogFooter>
                  <Button onClick={() => onOpenChange(false)} className="bg-navy hover:bg-navy/90">Fechar</Button>
                </DialogFooter>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const TOM: Record<string, string> = {
  green: "border-dash-green/25 bg-dash-green/5 text-dash-green",
  amber: "border-dash-amber/25 bg-dash-amber/5 text-dash-amber",
  red: "border-dash-red/25 bg-dash-red/5 text-dash-red",
  muted: "border-ink-06 bg-ink-03 text-ink-60",
};

function Contador({ label, valor, tom, sub }: { label: string; valor: number; tom: keyof typeof TOM; sub?: string }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", TOM[tom])}>
      <p className="font-display text-xl font-extrabold tabular-nums leading-none">{valor}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[1px] mt-1 text-ink-60">{label}</p>
      {sub && <p className="text-[10px] text-ink-35">{sub}</p>}
    </div>
  );
}
