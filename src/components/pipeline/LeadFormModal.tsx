import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { analyzeLead } from "@/services/leadsService";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateLead } from "@/hooks/data/useLeads";
import { useEquipeComercial } from "@/hooks/data/useEquipeComercial";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { FATURAMENTO_FAIXAS, REGIMES, SEGMENTOS } from "@/lib/lead-constants";
import { ORIGENS } from "@/lib/pipeline-constants";
import { PRODUTOS_LEAD, PRODUTO_LEAD_PADRAO, isProdutoLead } from "@/lib/produto-lead";
import { closersDaEquipe, sdrsDaEquipe } from "@/lib/equipe-comercial";
import { z } from "zod";

/** Valor do select quando o lead fica sem SDR/closer (Radix não aceita ""). */
const SEM_RESPONSAVEL = "__nenhum";

const EMPTY_FORM = {
  nome: "",
  empresa: "",
  cnpj: "",
  whatsapp: "",
  email: "",
  faturamento_faixa: "",
  regime_tributario: "",
  segmento: "",
  origem: "manual",
  observacoes: "",
  produto: PRODUTO_LEAD_PADRAO as string,
  sdr_id: SEM_RESPONSAVEL,
  closer_id: SEM_RESPONSAVEL,
};

const schema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(200),
  empresa: z.string().trim().min(1, "Empresa obrigatória").max(200),
  cnpj: z.string().trim().min(14, "CNPJ inválido").max(18),
  whatsapp: z.string().trim().min(1, "WhatsApp obrigatório").max(20),
  email: z.string().trim().email("E-mail inválido").max(255),
  faturamento_faixa: z.string().min(1, "Selecione faixa"),
  regime_tributario: z.string().min(1, "Selecione regime"),
  segmento: z.string().min(1, "Selecione segmento"),
  origem: z.string().min(1, "Selecione origem"),
  observacoes: z.string().optional(),
  produto: z.string().refine(isProdutoLead, "Selecione o produto"),
  sdr_id: z.string(),
  closer_id: z.string(),
});

const responsavelOuNull = (v: string) => (v === SEM_RESPONSAVEL ? null : v);

export type LeadFormFields = {
  id: string;
  nome: string;
  empresa: string;
  cnpj: string;
  email: string;
  whatsapp: string;
  faturamento_faixa: string;
  regime_tributario: string;
  segmento: string;
  origem: string;
  observacoes: string | null;
  produto?: string | null;
  sdr_id?: string | null;
  closer_id?: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lead?: LeadFormFields | null;
  /** Prefill ao criar (ex.: WhatsApp da conversa no atendimento). */
  defaults?: Partial<typeof EMPTY_FORM>;
}

export function LeadFormModal({ open, onClose, onSaved, lead, defaults }: Props) {
  const { user } = useAuth();
  const updateLeadMutation = useUpdateLead();
  const { data: equipe = [] } = useEquipeComercial(open);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const isEdit = Boolean(lead);

  useEffect(() => {
    if (!open) return;
    if (lead) {
      setForm({
        nome: lead.nome ?? "",
        empresa: lead.empresa ?? "",
        cnpj: lead.cnpj ?? "",
        whatsapp: lead.whatsapp ?? "",
        email: lead.email ?? "",
        faturamento_faixa: lead.faturamento_faixa ?? "",
        regime_tributario: lead.regime_tributario ?? "",
        segmento: lead.segmento ?? "",
        origem: lead.origem || "manual",
        observacoes: lead.observacoes ?? "",
        produto: isProdutoLead(lead.produto) ? lead.produto : PRODUTO_LEAD_PADRAO,
        sdr_id: lead.sdr_id ?? SEM_RESPONSAVEL,
        closer_id: lead.closer_id ?? SEM_RESPONSAVEL,
      });
    } else {
      setForm({ ...EMPTY_FORM, ...defaults });
    }
  }, [open, lead, defaults]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    if (isEdit && lead) {
      try {
        await updateLeadMutation.mutateAsync({
          id: lead.id,
          payload: {
            nome: parsed.data.nome,
            empresa: parsed.data.empresa,
            cnpj: parsed.data.cnpj,
            email: parsed.data.email,
            whatsapp: parsed.data.whatsapp,
            regime_tributario: parsed.data.regime_tributario,
            segmento: parsed.data.segmento,
            faturamento_faixa: parsed.data.faturamento_faixa,
            observacoes: parsed.data.observacoes || "",
            produto: parsed.data.produto,
            sdr_id: responsavelOuNull(parsed.data.sdr_id),
            closer_id: responsavelOuNull(parsed.data.closer_id),
          },
        });
        onSaved();
        onClose();
      } catch {
        // toast already shown by useUpdateLead
      }
      return;
    }

    setSaving(true);
    const { data: created, error } = await supabase.from("leads").insert({
      nome: parsed.data.nome,
      empresa: parsed.data.empresa,
      cnpj: parsed.data.cnpj,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
      faturamento_faixa: parsed.data.faturamento_faixa,
      regime_tributario: parsed.data.regime_tributario,
      segmento: parsed.data.segmento,
      origem: parsed.data.origem,
      observacoes: parsed.data.observacoes || "",
      produto: parsed.data.produto,
      sdr_id: responsavelOuNull(parsed.data.sdr_id),
      closer_id: responsavelOuNull(parsed.data.closer_id),
      status: "novo",
      status_funil: "novo",
      created_by: user?.id,
    }).select("id").single();

    if (error || !created) {
      toast.error("Erro ao salvar lead", { description: error?.message });
      setSaving(false);
      return;
    }

    toast.success("Lead cadastrado! Gerando diagnóstico...");

    try {
      // analyzeLead lança com a mensagem do motivo (sem faturamento/regime,
      // Simples Nacional); invoke direto não lança em 4xx e o toast mentia.
      await analyzeLead(created.id);
      toast.success("Diagnóstico gerado!");
    } catch (err) {
      toast.error("Lead salvo, mas o diagnóstico não foi gerado", {
        description: err instanceof Error ? err.message : undefined,
      });
    }

    setSaving(false);
    setForm(EMPTY_FORM);
    onSaved();
    onClose();
  };

  const busy = saving || updateLeadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Lead" : "Novo Lead"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome completo *</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Nome" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Empresa *</Label>
              <Input value={form.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="Empresa" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CNPJ *</Label>
              <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp *</Label>
              <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">E-mail *</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Faturamento mensal *</Label>
              <Select value={form.faturamento_faixa} onValueChange={(v) => set("faturamento_faixa", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{FATURAMENTO_FAIXAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Regime tributário *</Label>
              <Select value={form.regime_tributario} onValueChange={(v) => set("regime_tributario", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Segmento *</Label>
              <Select value={form.segmento} onValueChange={(v) => set("segmento", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{SEGMENTOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Origem *</Label>
              <Select value={form.origem} onValueChange={(v) => set("origem", v)} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{ORIGENS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Produto *</Label>
              <Select value={form.produto} onValueChange={(v) => set("produto", v)}>
                <SelectTrigger aria-label="Produto"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{PRODUTOS_LEAD.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Quem cuida do lead. Lista pode ficar solta (sem SDR) de propósito. */}
            <div className="space-y-1">
              <Label className="text-xs">SDR</Label>
              <Select value={form.sdr_id} onValueChange={(v) => set("sdr_id", v)}>
                <SelectTrigger aria-label="SDR"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_RESPONSAVEL}>Solto (sem SDR)</SelectItem>
                  {sdrsDaEquipe(equipe).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || "Sem nome"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Closer</Label>
              <Select value={form.closer_id} onValueChange={(v) => set("closer_id", v)}>
                <SelectTrigger aria-label="Closer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_RESPONSAVEL}>Sem closer</SelectItem>
                  {closersDaEquipe(equipe).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || "Sem nome"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} />
          </div>
          <Button onClick={handleSave} disabled={busy} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            {busy ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar e Analisar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
