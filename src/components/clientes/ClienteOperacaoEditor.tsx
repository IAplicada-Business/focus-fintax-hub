import { useEffect, useMemo, useState } from "react";
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
  isEstagioEsteira,
  type EstagioEsteira,
} from "@/lib/esteira-constants";
import {
  listClienteResponsaveisElegiveis,
  updateClienteOperacao,
} from "@/services/clientesService";
import { useEsteiraSlaConfig } from "@/hooks/data/useEsteira";

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
  const slaConfigQ = useEsteiraSlaConfig();
  const responsaveisQ = useQuery({
    queryKey: ["clientes", "responsaveis-elegiveis"],
    queryFn: listClienteResponsaveisElegiveis,
    enabled: editable,
    staleTime: 5 * 60_000,
  });
  const [status, setStatus] = useState<ClienteStatusCompensacao | "">("");
  const [estagio, setEstagio] = useState<EstagioEsteira | "">("");
  const [responsavelId, setResponsavelId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(
      isClienteStatusCompensacao(cliente.status_compensacao)
        ? cliente.status_compensacao
        : "",
    );
    setEstagio(
      isEstagioEsteira(cliente.estagio_esteira)
        ? cliente.estagio_esteira
        : "",
    );
    setResponsavelId(cliente.responsavel_id ?? "");
  }, [
    cliente.id,
    cliente.status_compensacao,
    cliente.estagio_esteira,
    cliente.responsavel_id,
  ]);

  const etapas = useMemo(
    () =>
      [...(slaConfigQ.data ?? [])]
        .sort((a, b) => a.ordem - b.ordem)
        .filter(
          (item) =>
            (item.ativo || item.estagio === cliente.estagio_esteira) &&
            isEstagioEsteira(item.estagio),
        ),
    [slaConfigQ.data, cliente.estagio_esteira],
  );

  const statusChanged =
    !!status && status !== cliente.status_compensacao;
  const stageChanged =
    !!estagio && estagio !== cliente.estagio_esteira;
  const responsibleChanged =
    !!responsavelId && responsavelId !== (cliente.responsavel_id ?? "");
  const changed = statusChanged || stageChanged || responsibleChanged;

  const handleSave = async () => {
    if (!changed) return;
    setSaving(true);
    try {
      const updated = await updateClienteOperacao({
        clienteId: cliente.id,
        statusCompensacao: statusChanged ? status : undefined,
        estagio: stageChanged ? estagio : undefined,
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
          Status, responsável e etapa operacional da empresa.
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

      <div className="space-y-1">
        <Label className="text-[11px]">Etapa atual da esteira</Label>
        <Select
          value={estagio || undefined}
          onValueChange={(value) => {
            if (isEstagioEsteira(value)) setEstagio(value);
          }}
          disabled={!editable || slaConfigQ.isPending}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Etapa não configurada" />
          </SelectTrigger>
          <SelectContent>
            {etapas.map((item) => (
              <SelectItem key={item.estagio} value={item.estagio}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          A alteração é auditada e reinicia o SLA da etapa.
        </p>
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
