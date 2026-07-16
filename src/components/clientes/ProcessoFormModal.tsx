import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STATUS_CONTRATO, STATUS_PROCESSO } from "@/lib/clientes-constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  existingTeses: string[];
  processo?: any;
  onSuccess: () => void;
}

export function ProcessoFormModal({ open, onOpenChange, clienteId, existingTeses, processo, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [teses, setTeses] = useState<{ tese: string; nome_exibicao: string }[]>([]);
  const [form, setForm] = useState({
    tese: "",
    nome_exibicao: "",
    valor_credito: "",
    percentual_honorario: "",
    status_contrato: "aguardando_assinatura",
    status_processo: "a_iniciar",
    observacao: "",
    categoria: "compensacao",
  });

  useEffect(() => {
    supabase.from("motor_teses_config").select("tese, nome_exibicao").eq("ativo", true).then(({ data }) => {
      if (data) setTeses(data);
    });
  }, []);

  useEffect(() => {
    if (processo) {
      setForm({
        tese: processo.tese,
        nome_exibicao: processo.nome_exibicao,
        valor_credito: String(processo.valor_credito || 0),
        percentual_honorario: String(processo.percentual_honorario || 0),
        status_contrato: processo.status_contrato,
        status_processo: processo.status_processo,
        observacao: processo.observacao || "",
        categoria: (processo.categoria === "reporto" ? "reporto" : "compensacao"),
      });
    }
  }, [processo]);

  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const availableTeses = teses.filter((t) => !existingTeses.includes(t.tese) || processo?.tese === t.tese);

  const handleTesePick = (value: string) => {
    const t = teses.find((x) => x.tese === value);
    // Auto-detecta reporto pelo nome — o usuário pode ajustar depois
    const nome = t?.nome_exibicao || value;
    const isReporto = /reporto/i.test(nome) || /reporto/i.test(value);
    setForm((p) => ({
      ...p,
      tese: value,
      nome_exibicao: nome,
      categoria: isReporto ? "reporto" : p.categoria,
    }));
  };

  const handleSave = async () => {
    if (!form.tese) { toast.error("Selecione uma tese."); return; }
    setSaving(true);

    const payload = {
      cliente_id: clienteId,
      tese: form.tese,
      nome_exibicao: form.nome_exibicao,
      valor_credito: Number(form.valor_credito) || 0,
      percentual_honorario: Number(form.percentual_honorario) || 0,
      status_contrato: form.status_contrato,
      status_processo: form.status_processo,
      observacao: form.observacao,
      categoria: form.categoria,
      atualizado_em: new Date().toISOString(),
    } as any;

    const { error } = processo
      ? await supabase.from("processos_teses").update(payload).eq("id", processo.id)
      : await supabase.from("processos_teses").insert(payload);

    setSaving(false);
    if (error) { toast.error("Erro ao salvar processo."); return; }
    toast.success(processo ? "Processo atualizado!" : "Processo adicionado!");
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{processo ? "Editar Processo" : "Adicionar Tese"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Tese *</Label>
            <Select value={form.tese} onValueChange={handleTesePick} disabled={!!processo}>
              <SelectTrigger><SelectValue placeholder="Selecione a tese" /></SelectTrigger>
              <SelectContent>
                {availableTeses.map((t) => (
                  <SelectItem key={t.tese} value={t.tese}>{t.nome_exibicao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.categoria} onValueChange={(v) => update("categoria", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compensacao">Compensação</SelectItem>
                <SelectItem value="reporto">Possíveis futuros (Reporto)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Possíveis futuros / Reporto ficam fora do cálculo automático (Insumos + Subvenção).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Valor do Crédito (R$)</Label>
            <Input type="number" value={form.valor_credito} onChange={(e) => update("valor_credito", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>% Honorário</Label>
            <Input type="number" step="0.01" value={form.percentual_honorario} onChange={(e) => update("percentual_honorario", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status do Contrato</Label>
            <Select value={form.status_contrato} onValueChange={(v) => update("status_contrato", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_CONTRATO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status do Processo</Label>
            <Select value={form.status_processo} onValueChange={(v) => update("status_processo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_PROCESSO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea value={form.observacao} onChange={(e) => update("observacao", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
