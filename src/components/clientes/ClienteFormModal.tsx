import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  cliente?: any;
}

const REGIMES = ["Lucro Real", "Lucro Presumido", "Simples Nacional"];
const FAIXAS = ["Até R$ 500 mil", "R$ 500 mil a R$ 1M", "R$ 1M a R$ 2M", "R$ 2M a R$ 5M", "R$ 5M a R$ 10M", "Acima de R$ 10M"];

const emptyForm = {
  empresa: "",
  cnpj: "",
  regime_tributario: "",
  segmento: "",
  nome_contato: "",
  whatsapp: "",
  nao_enviar_mapa: false,
  email: "",
  faturamento_faixa: "",
  compensando_fintax: false,
  compensacao_outro_escritorio: "",
  status: "ativo",
};

export function ClienteFormModal({ open, onOpenChange, onSuccess, cliente }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const isEdit = !!cliente;

  useEffect(() => {
    if (open && cliente) {
      setForm({
        empresa: cliente.empresa || "",
        cnpj: cliente.cnpj || "",
        regime_tributario: cliente.regime_tributario || "",
        segmento: cliente.segmento || "",
        nome_contato: cliente.nome_contato || "",
        whatsapp: cliente.whatsapp || "",
        nao_enviar_mapa: cliente.nao_enviar_mapa ?? false,
        email: cliente.email || "",
        faturamento_faixa: cliente.faturamento_faixa || "",
        compensando_fintax: !!cliente.compensando_fintax,
        compensacao_outro_escritorio: cliente.compensacao_outro_escritorio || "",
        status: cliente.status || "ativo",
      });
    } else if (open && !cliente) {
      setForm(emptyForm);
    }
  }, [open, cliente]);

  const update = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!form.empresa || !form.cnpj) {
      toast.error("Nome da empresa e CNPJ são obrigatórios.");
      return;
    }
    setSaving(true);
    const payload = {
      empresa: form.empresa,
      cnpj: form.cnpj,
      regime_tributario: form.regime_tributario,
      segmento: form.segmento,
      nome_contato: form.nome_contato,
      whatsapp: form.whatsapp,
      nao_enviar_mapa: form.nao_enviar_mapa,
      email: form.email,
      faturamento_faixa: form.faturamento_faixa,
      compensando_fintax: form.compensando_fintax,
      compensacao_outro_escritorio: form.compensacao_outro_escritorio,
      status: form.status,
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase.from("clientes").update({ ...payload, atualizado_em: new Date().toISOString() }).eq("id", cliente.id));
    } else {
      ({ error } = await supabase.from("clientes").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error(isEdit ? "Erro ao atualizar cliente." : "Erro ao cadastrar cliente.");
      return;
    }
    toast.success(isEdit ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!");
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Cliente" : "Cadastrar Cliente"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nome da Empresa *</Label>
              <Input value={form.empresa} onChange={(e) => update("empresa", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ *</Label>
              <Input value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={form.segmento} onValueChange={(v) => update("segmento", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENTO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Regime Tributário</Label>
              <Select value={form.regime_tributario} onValueChange={(v) => update("regime_tributario", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Faturamento</Label>
              <Select value={form.faturamento_faixa} onValueChange={(v) => update("faturamento_faixa", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {FAIXAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome do Responsável</Label>
              <Input value={form.nome_contato} onChange={(e) => update("nome_contato", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.compensando_fintax} onCheckedChange={(v) => update("compensando_fintax", v)} />
            <Label>Compensando pela Fintax</Label>
          </div>
          {/* Opt-out do envio mensal do Mapa. Cliente pede pra parar, o time marca
              aqui, e mapa_envios_pendentes() deixa de incluí-lo. */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.nao_enviar_mapa}
              onCheckedChange={(v) => update("nao_enviar_mapa", v)}
            />
            <Label>Não enviar Mapa mensal por WhatsApp</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Compensação por outro escritório</Label>
            <Input value={form.compensacao_outro_escritorio} onChange={(e) => update("compensacao_outro_escritorio", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
