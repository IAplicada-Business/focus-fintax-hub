import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { toastError } from "@/lib/handle-error";
import { useNavigate } from "react-router-dom";
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

export function ConvertClientModal({ lead, paraEtapa = "cliente_ativo", onClose, onRefresh }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
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
      toast.success("Lead enviado para a esteira operacional", {
        description: result.descricao,
      });
      onClose();
      onRefresh();
      navigate(`/esteira?tab=kanban&etapa=${encodeURIComponent(result.estagio)}`);
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
          <DialogTitle>Enviar para a esteira operacional?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <strong>{lead?.empresa}</strong> sai do funil comercial e entra na
          operação em <strong>{esteiraStageLabel(estagio)}</strong>.{" "}
          {descricaoHandoff(estagio)} Não recomeça triagem se o contrato já
          foi emitido.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConvert} disabled={saving}>
            {saving ? "Enviando..." : "Enviar para a esteira"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
