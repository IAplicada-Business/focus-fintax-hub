import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIENTE_STATUS_COMPENSACAO,
  isClienteStatusCompensacao,
  type ClienteStatusCompensacao,
} from "@/lib/client-operation";
import {
  listClienteResponsaveisElegiveis,
  updateClienteOperacao,
} from "@/services/clientesService";

interface ClienteOperacional {
  id: string;
  status_compensacao?: string | null;
  estagio_esteira: string;
  responsavel_id?: string | null;
}

interface Props {
  cliente: ClienteOperacional;
  editable: boolean;
  onUpdated: (cliente: ClienteOperacional) => void;
}

export function ClienteOperacaoEditor({
  cliente,
  editable,
  onUpdated,
}: Props) {
  const queryClient = useQueryClient();
  const responsaveisQ = useQuery({
    queryKey: ["clientes", "responsaveis-elegiveis"],
    queryFn: listClienteResponsaveisElegiveis,
    enabled: editable,
    staleTime: 5 * 60_000,
  });
  const [status, setStatus] = useState<ClienteStatusCompensacao | "">("");
  const [responsavelId, setResponsavelId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(
      isClienteStatusCompensacao(cliente.status_compensacao)
        ? cliente.status_compensacao
        : "",
    );
    setResponsavelId(cliente.responsavel_id ?? "");
  }, [
    cliente.id,
    cliente.status_compensacao,
    cliente.responsavel_id,
  ]);

  const statusChanged =
    !!status && status !== cliente.status_compensacao;
  const responsibleChanged =
    !!responsavelId && responsavelId !== (cliente.responsavel_id ?? "");
  const changed = statusChanged || responsibleChanged;

  const handleSave = async () => {
    if (!changed) return;
    setSaving(true);
    try {
      const updated = await updateClienteOperacao({
        clienteId: cliente.id,
        statusCompensacao: statusChanged ? status : undefined,
        responsavelId: responsibleChanged ? responsavelId : undefined,
      });
      onUpdated(updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cliente", cliente.id] }),
        queryClient.invalidateQueries({ queryKey: ["esteira"] }),
        queryClient.invalidateQueries({ queryKey: ["clientes"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog", "status_compensacao"] }),
      ]);
      toast.success("Operação do cliente atualizada.");
    } catch {
      toast.error("Não foi possível atualizar a operação do cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <p className="text-xs font-semibold">Operação</p>
        <p className="text-[10px] text-muted-foreground">
          Status de compensação e responsável. A etapa avança na esteira.
        </p>
      </div>

      {!isClienteStatusCompensacao(cliente.status_compensacao) && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Classificação pendente. Isto é uma pendência de dados, não um
            status de compensação.
          </span>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[11px]">Status de compensação</Label>
        <Select
          value={status || undefined}
          onValueChange={(value) =>
            setStatus(value as ClienteStatusCompensacao)
          }
          disabled={!editable}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Classificação pendente" />
          </SelectTrigger>
          <SelectContent>
            {CLIENTE_STATUS_COMPENSACAO.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px]">Responsável da empresa</Label>
        <Select
          value={responsavelId || undefined}
          onValueChange={setResponsavelId}
          disabled={!editable || responsaveisQ.isPending}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Sem responsável" />
          </SelectTrigger>
          <SelectContent>
            {(responsaveisQ.data ?? []).map((responsavel) => (
              <SelectItem
                key={responsavel.user_id}
                value={responsavel.user_id}
              >
                {responsavel.full_name}
                {responsavel.cargo ? ` · ${responsavel.cargo}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {editable && (
        <Button
          type="button"
          size="sm"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={handleSave}
          disabled={!changed || saving}
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Salvando..." : "Salvar operação"}
        </Button>
      )}
    </div>
  );
}
