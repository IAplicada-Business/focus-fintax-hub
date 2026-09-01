import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseMoneyBR } from "@/lib/money-mask";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STATUS_CONTRATO, STATUS_PROCESSO, normalizeTeseCatalogCodigo } from "@/lib/clientes-constants";
import { resolveCatalogTeseId, syncCreditoApuradoFromProcesso } from "@/lib/sync-credito-apurado";
import { useMotorTesesAtivas } from "@/hooks/data/useClienteOperacional";
import { logClienteHistorico } from "@/lib/cliente-historico";
import {
  TIPOS_RECUPERACAO,
  isTipoRecuperacao,
  resolveTipoRecuperacao,
  type TipoRecuperacao,
} from "@/lib/tipo-recuperacao";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  existingTeses: string[];
  processo?: any;
  /** Pré-seleciona tese ao abrir para criação */
  presetTese?: string | null;
  onSuccess: () => void;
}

interface TeseOption {
  tese: string;
  nome_exibicao: string;
  tipo_recuperacao_padrao?: string | null;
}

const EMPTY_FORM = {
  tese: "",
  nome_exibicao: "",
  valor_credito: "",
  percentual_honorario: "",
  status_contrato: "aguardando_assinatura",
  status_processo: "a_iniciar",
  observacao: "",
  categoria: "compensacao",
  tipo_recuperacao: "compensacao" as TipoRecuperacao,
};

export function ProcessoFormModal({
  open,
  onOpenChange,
  clienteId,
  existingTeses,
  processo,
  presetTese,
  onSuccess,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const motorQ = useMotorTesesAtivas();
  const teses = (motorQ.data ?? []) as TeseOption[];

  useEffect(() => {
    if (open) void motorQ.refetch();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (processo) {
      setForm({
        tese: processo.tese,
        nome_exibicao: processo.nome_exibicao,
        valor_credito: String(processo.valor_credito || 0),
        percentual_honorario: String(processo.percentual_honorario || 0),
        status_contrato: processo.status_contrato,
        status_processo: processo.status_processo,
        observacao: processo.observacao || "",
        categoria: processo.categoria === "reporto" ? "reporto" : "compensacao",
        tipo_recuperacao: isTipoRecuperacao(processo.tipo_recuperacao)
          ? processo.tipo_recuperacao
          : "compensacao",
      });
      return;
    }
    setForm(EMPTY_FORM);
  }, [open, processo]);

  useEffect(() => {
    if (!open || processo || !presetTese || teses.length === 0) return;
    const t = teses.find((x) => x.tese === presetTese);
    const nome = t?.nome_exibicao || presetTese;
    const isReporto = /reporto/i.test(nome) || /reporto/i.test(presetTese);
    setForm({
      ...EMPTY_FORM,
      tese: presetTese,
      nome_exibicao: nome,
      categoria: isReporto ? "reporto" : "compensacao",
      tipo_recuperacao: resolveTipoRecuperacao(t?.tipo_recuperacao_padrao, presetTese, nome),
    });
  }, [open, processo, presetTese, teses]);

  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const takenNorm = new Set(
    existingTeses
      .filter((t) => t !== processo?.tese)
      .map((t) => normalizeTeseCatalogCodigo(t))
      .filter((c): c is string => !!c),
  );

  const availableTeses = teses.filter((t) => {
    if (processo?.tese === t.tese) return true;
    if (existingTeses.includes(t.tese)) return false;
    const n = normalizeTeseCatalogCodigo(t.tese, t.nome_exibicao);
    if (n && takenNorm.has(n)) return false;
    return true;
  });

  const handleTesePick = (value: string) => {
    const t = teses.find((x) => x.tese === value);
    const nome = t?.nome_exibicao || value;
    const isReporto = /reporto/i.test(nome) || /reporto/i.test(value);
    setForm((p) => ({
      ...p,
      tese: value,
      nome_exibicao: nome,
      categoria: isReporto ? "reporto" : p.categoria,
      tipo_recuperacao: resolveTipoRecuperacao(t?.tipo_recuperacao_padrao, value, nome),
    }));
  };

  const teseJaUsada = (slug: string) => {
    if (existingTeses.includes(slug) && slug !== processo?.tese) return true;
    const n = normalizeTeseCatalogCodigo(slug, form.nome_exibicao);
    return !!(n && takenNorm.has(n));
  };

  const handleSave = async () => {
    if (!form.tese) { toast.error("Selecione uma tese."); return; }
    if (teseJaUsada(form.tese)) {
      toast.error("Já existe um processo com essa tese neste cliente.");
      return;
    }

    const teseMudou = !!processo && form.tese !== processo.tese;
    if (teseMudou) {
      const { count } = await supabase
        .from("compensacoes_mensais")
        .select("id", { count: "exact", head: true })
        .eq("processo_tese_id", processo.id);
      if ((count ?? 0) > 0) {
        const ok = window.confirm(
          "Este processo já tem compensações. A tese do processo e a tese em uso da empresa passam a ser a nova. Os valores lançados não mudam. Continuar?",
        );
        if (!ok) return;
      }
    }

    setSaving(true);

    const payload = {
      cliente_id: clienteId,
      tese: form.tese,
      nome_exibicao: form.nome_exibicao,
      valor_credito: parseMoneyBR(form.valor_credito),
      percentual_honorario: Number(form.percentual_honorario) || 0,
      status_contrato: form.status_contrato,
      status_processo: form.status_processo,
      observacao: form.observacao,
      categoria: form.categoria,
      tipo_recuperacao: form.tipo_recuperacao,
      atualizado_em: new Date().toISOString(),
    } as any;

    const { error } = processo
      ? await supabase.from("processos_teses").update(payload).eq("id", processo.id)
      : await supabase.from("processos_teses").insert(payload);

    if (error) {
      setSaving(false);
      toast.error("Erro ao salvar processo.");
      return;
    }

    if (teseMudou) {
      const teseId = await resolveCatalogTeseId(form.tese, form.nome_exibicao);
      if (teseId) {
        await supabase
          .from("compensacoes_mensais")
          .update({ tese_origem_id: teseId } as any)
          .eq("processo_tese_id", processo.id);
        await supabase
          .from("clientes")
          .update({ tese_ativa_id: teseId } as any)
          .eq("id", clienteId);
      }
      logClienteHistorico(
        clienteId,
        "tese_processo_alterada",
        `Processo "${form.nome_exibicao}": ${processo.tese} → ${form.tese}`,
      );
    }

    try {
      await syncCreditoApuradoFromProcesso({
        clienteId,
        tese: form.tese,
        nomeExibicao: form.nome_exibicao,
        valorCredito: payload.valor_credito,
        previousTese: teseMudou ? processo.tese : undefined,
        previousNomeExibicao: teseMudou ? processo.nome_exibicao : undefined,
      });
    } catch {
      // Processo já gravado; o fallback do cabeçalho cobre até a próxima edição.
    }

    setSaving(false);
    toast.success(processo ? "Processo atualizado!" : "Processo adicionado!");
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 px-6 pb-3 pt-6 pr-12 text-left">
          <DialogTitle>{processo ? "Editar Processo" : "Adicionar Tese"}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Tese *</Label>
            <Select value={form.tese} onValueChange={handleTesePick}>
              <SelectTrigger><SelectValue placeholder="Selecione a tese" /></SelectTrigger>
              <SelectContent>
                {availableTeses.map((t) => (
                  <SelectItem key={t.tese} value={t.tese}>{t.nome_exibicao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ramo de recuperação</Label>
            <Select
              value={form.tipo_recuperacao}
              onValueChange={(v) => {
                if (isTipoRecuperacao(v)) update("tipo_recuperacao", v);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_RECUPERACAO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Compensação, Ressarcimento ou Recuperação Judicial — um tipo por processo.
            </p>
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
            <CurrencyInput value={form.valor_credito} onValueChange={(v) => update("valor_credito", v)} />
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
        </div>
        <DialogFooter className="shrink-0 border-t border-[var(--ink-06)] px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
