import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";
import {
  CLIENTE_STATUS_COMPENSACAO,
  isClienteStatusCompensacao,
  type ClienteStatusCompensacao,
} from "@/lib/client-operation";
import { isEstagioEsteira, type EstagioEsteira } from "@/lib/esteira-constants";
import {
  listClienteResponsaveisElegiveis,
  updateClienteOperacao,
} from "@/services/clientesService";
import { useEsteiraSlaConfig } from "@/hooks/data/useEsteira";
import type { Database } from "@/integrations/supabase/types";

type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  cliente?: ClienteRow;
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
  compensacao_outro_escritorio: "",
  status: "ativo",
  status_compensacao: "",
  estagio_esteira: "",
  responsavel_id: "",
};

export function ClienteFormModal({ open, onOpenChange, onSuccess, cliente }: Props) {
  const queryClient = useQueryClient();
  const slaConfigQ = useEsteiraSlaConfig();
  const responsaveisQ = useQuery({
    queryKey: ["clientes", "responsaveis-elegiveis"],
    queryFn: listClienteResponsaveisElegiveis,
    enabled: open && !!cliente,
    staleTime: 5 * 60_000,
  });
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
        compensacao_outro_escritorio: cliente.compensacao_outro_escritorio || "",
        status: cliente.status || "ativo",
        status_compensacao: isClienteStatusCompensacao(cliente.status_compensacao)
          ? cliente.status_compensacao
          : "",
        estagio_esteira: isEstagioEsteira(cliente.estagio_esteira)
          ? cliente.estagio_esteira
          : "",
        responsavel_id: cliente.responsavel_id || "",
      });
    } else if (open && !cliente) {
      setForm(emptyForm);
    }
  }, [open, cliente]);

  const update = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));
  const responsaveis = useMemo(() => responsaveisQ.data ?? [], [responsaveisQ.data]);
  // O responsável já gravado continua na lista mesmo se perdeu o acesso ou foi
  // desativado; sem isso o campo mostra "Sem responsável" e a gravação seguinte
  // apagaria silenciosamente quem está atendendo a empresa.
  const opcoesResponsavel = useMemo(() => {
    const atual = cliente?.responsavel_id;
    if (!atual || responsaveis.some((item) => item.user_id === atual)) return responsaveis;
    return [
      { user_id: atual, full_name: "Responsável atual", cargo: "sem acesso de edição hoje" },
      ...responsaveis,
    ];
  }, [responsaveis, cliente?.responsavel_id]);
  const etapas = useMemo(
    () =>
      [...(slaConfigQ.data ?? [])]
        .sort((a, b) => a.ordem - b.ordem)
        .filter(
          (item) =>
            (item.ativo || item.estagio === cliente?.estagio_esteira) &&
            isEstagioEsteira(item.estagio),
        ),
    [slaConfigQ.data, cliente?.estagio_esteira],
  );

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
      compensacao_outro_escritorio: form.compensacao_outro_escritorio,
      status: form.status,
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase.from("clientes").update({ ...payload, atualizado_em: new Date().toISOString() }).eq("id", cliente.id));
    } else {
      ({ error } = await supabase.from("clientes").insert(payload));
    }
    if (error) {
      setSaving(false);
      toast.error(isEdit ? "Erro ao atualizar cliente." : "Erro ao cadastrar cliente.");
      return;
    }
    if (isEdit) {
      const statusChanged =
        isClienteStatusCompensacao(form.status_compensacao) &&
        form.status_compensacao !== cliente.status_compensacao;
      const stageChanged =
        isEstagioEsteira(form.estagio_esteira) &&
        form.estagio_esteira !== cliente.estagio_esteira;
      const responsibleChanged =
        !!form.responsavel_id &&
        form.responsavel_id !== (cliente.responsavel_id ?? "");
      if (statusChanged || stageChanged || responsibleChanged) {
        try {
          await updateClienteOperacao({
            clienteId: cliente.id,
            statusCompensacao: statusChanged
              ? (form.status_compensacao as ClienteStatusCompensacao)
              : undefined,
            estagio: stageChanged
              ? (form.estagio_esteira as EstagioEsteira)
              : undefined,
            responsavelId: responsibleChanged ? form.responsavel_id : undefined,
          });
        } catch {
          setSaving(false);
          toast.error("Os dados cadastrais foram salvos, mas a classificação operacional não pôde ser atualizada.");
          return;
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cliente", cliente.id] }),
        queryClient.invalidateQueries({ queryKey: ["esteira"] }),
        queryClient.invalidateQueries({ queryKey: ["clientes"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog", "status_compensacao"] }),
      ]);
    }
    setSaving(false);
    toast.success(isEdit ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!");
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Cliente" : "Cadastrar Cliente"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Edite os dados cadastrais e a classificação geral do cliente."
              : "Cadastre os dados da nova empresa."}
          </DialogDescription>
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
          {isEdit && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div>
                <p className="text-sm font-semibold">Classificação do cliente</p>
                <p className="text-[11px] text-muted-foreground">
                  Status geral, responsável e posição na esteira. A tese tem sua própria situação.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Status geral</Label>
                  <Select
                    value={form.status_compensacao}
                    onValueChange={(value) => update("status_compensacao", value)}
                  >
                    <SelectTrigger>
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
                <div className="space-y-1.5">
                  <Label>Responsável da empresa</Label>
                  <Select
                    value={form.responsavel_id}
                    onValueChange={(value) => update("responsavel_id", value)}
                  >
                    <SelectTrigger aria-label="Responsável da empresa">
                      <SelectValue
                        placeholder={responsaveisQ.isPending ? "Carregando..." : "Sem responsável"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {opcoesResponsavel.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">
                          {responsaveisQ.isPending
                            ? "Carregando..."
                            : responsaveisQ.isError
                              ? "Não foi possível carregar."
                              : "Nenhum usuário com acesso."}
                        </p>
                      ) : (
                        opcoesResponsavel.map((responsavel) => (
                          <SelectItem key={responsavel.user_id} value={responsavel.user_id}>
                            {responsavel.full_name}
                            {responsavel.cargo ? ` · ${responsavel.cargo}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {responsaveisQ.isError && (
                    <p className="text-[11px] text-destructive">
                      Não foi possível carregar a lista.{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void responsaveisQ.refetch()}
                      >
                        Tentar de novo
                      </button>
                    </p>
                  )}
                  {!responsaveisQ.isPending && !responsaveisQ.isError && responsaveis.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Ninguém tem acesso de edição de clientes hoje. Ajuste papéis e permissões
                      em Configurações.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Etapa atual da esteira</Label>
                <Select
                  value={form.estagio_esteira}
                  onValueChange={(value) => update("estagio_esteira", value)}
                  disabled={slaConfigQ.isPending}
                >
                  <SelectTrigger>
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
                <p className="text-[11px] text-muted-foreground">
                  Mudar a etapa reinicia o SLA e fica registrado no histórico.
                </p>
              </div>
            </div>
          )}
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
