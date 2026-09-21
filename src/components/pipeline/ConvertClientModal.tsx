import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { toastError } from "@/lib/handle-error";
import type { PipelineLead } from "@/pages/Pipeline";
import { entregarLeadNaEsteira } from "@/services/handoffService";
import { descricaoHandoff, estagioEsteiraDoFunil } from "@/lib/handoff-funil-esteira";
import { esteiraStageLabel } from "@/lib/esteira-constants";

interface Props {
  lead: PipelineLead | null;
  paraEtapa?: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function ConvertClientModal({ lead, paraEtapa = "triagem", onClose, onRefresh }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const estagio = estagioEsteiraDoFunil(paraEtapa, lead?.status_funil);

  const handleConvert = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const result = await entregarLeadNaEsteira({
        lead,
        deEtapa: lead.status_funil,
        paraEtapa,
        usuarioId: user?.id,
      });
      toast.success("Etapas comercial e operacional sincronizadas", {
        description: result.descricao,
      });
      onClose();
      onRefresh();
    } catch (error) {
      toastError(error, "Erro ao enviar lead para a esteira");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sincronizar com a esteira operacional?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <strong>{lead?.empresa}</strong> continua no funil comercial e passa
          a acompanhar a operação em <strong>{esteiraStageLabel(estagio)}</strong>.
          {" "}{descricaoHandoff(estagio)} As próximas etapas compartilhadas
          permanecem sincronizadas.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConvert} disabled={saving}>
            {saving ? "Sincronizando..." : "Avançar e sincronizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
