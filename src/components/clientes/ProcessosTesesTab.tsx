import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Plus, AlertTriangle, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ProcessoFormModal } from "./ProcessoFormModal";
import { formatCurrencyBR, getStatusContratoConfig, getStatusProcessoConfig, STATUS_PROCESSO } from "@/lib/clientes-constants";
import { logClienteHistorico } from "@/lib/cliente-historico";

interface Props {
  clienteId: string;
  compensacoesTotal: number;
}

export function ProcessosTesesTab({ clienteId, compensacoesTotal }: Props) {
  const [processos, setProcessos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editProcesso, setEditProcesso] = useState<any>(null);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const fetchProcessos = useCallback(async () => {
    const { data } = await supabase
      .from("processos_teses")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("criado_em");
    setProcessos(data || []);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { fetchProcessos(); }, [fetchProcessos]);

  const handleInlineUpdate = (id: string, field: string, value: string | number) => {
    let honorarioCalc: number | null = null;
    setProcessos((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, [field]: value };
      if (field === "percentual_honorario" || field === "valor_credito") {
        const perc = Number(field === "percentual_honorario" ? value : next.percentual_honorario || 0);
        const credito = Number(field === "valor_credito" ? value : next.valor_credito || 0);
        honorarioCalc = Math.round(credito * perc * 100) / 100;
        next.valor_honorario = honorarioCalc;
      }
      return next;
    }));
    if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = setTimeout(async () => {
      const updateData: Record<string, any> = { [field]: value, atualizado_em: new Date().toISOString() };
      if (honorarioCalc != null) updateData.valor_honorario = honorarioCalc;
      const { error } = await supabase
        .from("processos_teses")
        .update(updateData as any)
        .eq("id", id);
      if (error) toast.error("Erro ao salvar.");
      else fetchProcessos();
    }, 800);
  };

  const handleStatusProcessoChange = async (id: string, value: string) => {
    const prev = processos.find((p) => p.id === id);
    const oldStatus = prev?.status_processo;
    setProcessos((ps) => ps.map((p) => p.id === id ? { ...p, status_processo: value } : p));
    await supabase.from("processos_teses").update({ status_processo: value, atualizado_em: new Date().toISOString() }).eq("id", id);
    logClienteHistorico(clienteId, "status_mudado", `Status de "${prev?.nome_exibicao}" alterado`, { status_processo: oldStatus }, { status_processo: value });
    fetchProcessos();
  };

  const assinados = processos.filter((p) => p.status_contrato === "assinado");
  const totalCreditoAssinado = assinados.reduce((s, p) => s + Number(p.valor_credito || 0), 0);
  const totalHonorarios = assinados.reduce((s, p) => s + Number(p.valor_honorario || 0), 0);
  const totalACompensar = processos
    .filter((p) => ["a_compensar", "a_iniciar"].includes(p.status_processo) && p.status_contrato === "assinado")
    .reduce((s, p) => s + Number(p.valor_credito || 0), 0);

  const now = Date.now();
  const alertAguardando = processos.filter(
    (p) => p.status_contrato === "aguardando_assinatura" && (now - new Date(p.criado_em).getTime()) > 7 * 86400000
  );
  const alertNaoProtocolado = processos.filter(
    (p) => p.status_processo === "nao_protocolado" && (now - new Date(p.atualizado_em).getTime()) > 15 * 86400000
  );

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Possíveis créditos</p><p className="text-lg font-bold">{formatCurrencyBR(totalCreditoAssinado)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Honorários</p><p className="text-lg font-bold">{formatCurrencyBR(totalHonorarios)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">A Compensar</p><p className="text-lg font-bold">{formatCurrencyBR(totalACompensar)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Já Compensado</p><p className="text-lg font-bold">{formatCurrencyBR(compensacoesTotal)}</p></CardContent></Card>
      </div>

      {/* Alerts */}
      {alertAguardando.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
          <AlertTriangle className="h-4 w-4" />
          {alertAguardando.length} processo(s) aguardando assinatura há mais de 7 dias.
        </div>
      )}
      {alertNaoProtocolado.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertTriangle className="h-4 w-4" />
          {alertNaoProtocolado.length} processo(s) não protocolado(s) há mais de 15 dias.
        </div>
      )}

      {/* Table */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditProcesso(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar tese
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tese</TableHead>
            <TableHead>Valor Crédito</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>% Hon.</TableHead>
            <TableHead>Valor Hon.</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Obs.</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
          ) : processos.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum processo cadastrado.</TableCell></TableRow>
          ) : processos.map((p) => {
            const sc = getStatusContratoConfig(p.status_contrato);
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{p.nome_exibicao}</span>
                    {p.categoria === "reporto" && (
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">
                        Possíveis futuros
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-28 h-7 text-xs"
                    value={p.valor_credito ?? ""}
                    onChange={(e) => handleInlineUpdate(p.id, "valor_credito", Number(e.target.value))}
                  />
                </TableCell>
                <TableCell><Badge variant="outline" className={sc.color}>{sc.label}</Badge></TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-20 h-7 text-xs"
                    value={p.percentual_honorario}
                    onChange={(e) => handleInlineUpdate(p.id, "percentual_honorario", Number(e.target.value))}
                  />
                </TableCell>
                <TableCell className="text-sm">{formatCurrencyBR(Number(p.valor_honorario || 0))}</TableCell>
                <TableCell>
                  <Select value={p.status_processo} onValueChange={(v) => handleStatusProcessoChange(p.id, v)}>
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_PROCESSO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-7 text-xs w-32"
                    value={p.observacao || ""}
                    onChange={(e) => handleInlineUpdate(p.id, "observacao", e.target.value)}
                    placeholder="..."
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditProcesso(p); setModalOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
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
                            Esta ação não pode ser desfeita. A tese{" "}
                            <strong>{p.nome_exibicao}</strong> será removida permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              const { error } = await supabase.from("processos_teses").delete().eq("id", p.id);
                              if (error) { toast.error("Erro ao excluir."); return; }
                              toast.success("Tese excluída.");
                              logClienteHistorico(clienteId, "processo_removido", `Tese removida: ${p.nome_exibicao}`);
                              fetchProcessos();
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
      </Table>

      <ProcessoFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        clienteId={clienteId}
        existingTeses={processos.map((p) => p.tese)}
        processo={editProcesso}
        onSuccess={fetchProcessos}
      />
    </div>
  );
}
