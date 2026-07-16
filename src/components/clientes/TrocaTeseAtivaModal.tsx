import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import { logClienteHistorico } from "@/lib/cliente-historico";

interface CreditoLinha {
  tese_id: string;
  tese_codigo: string;
  tese_label: string;
  valor_apurado_inicial: number;
  total_compensado: number;
  saldo_final: number;
  status_utilizacao?: string | null;
  incluir_no_calculo?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  teseAtivaId: string | null;
  onChanged: (novaTeseId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  utilizado: "Compensado",
  em_uso: "Compensando",
  a_utilizar: "Não iniciado",
};

export function TrocaTeseAtivaModal({
  open,
  onOpenChange,
  clienteId,
  teseAtivaId,
  onChanged,
}: Props) {
  const [linhas, setLinhas] = useState<CreditoLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selecionada, setSelecionada] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (supabase as any)
      .from("v_mapa_creditos")
      .select(
        "tese_id, tese_codigo, tese_label, valor_apurado_inicial, total_compensado, saldo_final, status_utilizacao, incluir_no_calculo"
      )
      .eq("cliente_id", clienteId)
      .then(({ data }: { data: CreditoLinha[] | null }) => {
        const rows = (data || []).filter(
          (r) => r.tese_codigo !== "REPORTO" && r.incluir_no_calculo !== false
        );
        setLinhas(rows);
        setSelecionada(teseAtivaId || rows.find((r) => Number(r.saldo_final) > 0)?.tese_id || "");
        setLoading(false);
      });
  }, [open, clienteId, teseAtivaId]);

  const atual = useMemo(
    () => linhas.find((l) => l.tese_id === teseAtivaId) || null,
    [linhas, teseAtivaId]
  );
  const nova = useMemo(
    () => linhas.find((l) => l.tese_id === selecionada) || null,
    [linhas, selecionada]
  );

  const handleConfirm = async () => {
    if (!selecionada || selecionada === teseAtivaId) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("clientes")
      .update({ tese_ativa_id: selecionada } as any)
      .eq("id", clienteId);

    if (error) {
      toast.error("Erro ao trocar tese", { description: error.message });
      setSaving(false);
      return;
    }

    // Marca nova como em_uso; se a antiga zerou, fica utilizado
    if (atual) {
      const statusAntiga = Number(atual.saldo_final) <= 0.011 ? "utilizado" : "em_uso";
      await (supabase.from("creditos_apurados") as any)
        .update({ status_utilizacao: statusAntiga })
        .eq("cliente_id", clienteId)
        .eq("tese_id", atual.tese_id);
    }
    await (supabase.from("creditos_apurados") as any)
      .update({ status_utilizacao: "em_uso" })
      .eq("cliente_id", clienteId)
      .eq("tese_id", selecionada);

    logClienteHistorico(
      clienteId,
      "tese_ativa_trocada",
      `Tese em uso: ${atual?.tese_label || "—"} → ${nova?.tese_label || selecionada}`
    );

    toast.success("Tese em uso atualizada");
    onChanged(selecionada);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">Trocar tese em uso</DialogTitle>
          <DialogDescription>
            Próximas compensações passam a consumir o saldo da tese escolhida. O histórico mensal
            permanece intacto.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-slate-50/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                Tese atual
              </p>
              {atual ? (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm text-navy">{atual.tese_label}</p>
                    <p className="text-xs text-muted-foreground">
                      Saldo {formatCurrencyBR(Number(atual.saldo_final || 0))}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {STATUS_LABEL[atual.status_utilizacao || ""] || "—"}
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma tese ativa definida</p>
              )}
            </div>

            <div className="flex justify-center">
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                Nova tese
              </p>
              <Select value={selecionada} onValueChange={setSelecionada}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a tese" />
                </SelectTrigger>
                <SelectContent>
                  {linhas.map((l) => (
                    <SelectItem key={l.tese_id} value={l.tese_id}>
                      {l.tese_label} — saldo {formatCurrencyBR(Number(l.saldo_final || 0))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nova && (
                <p className="text-xs text-muted-foreground mt-2">
                  Disponível: <strong>{formatCurrencyBR(Number(nova.saldo_final || 0))}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !selecionada || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Confirmar troca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
