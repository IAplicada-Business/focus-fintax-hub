import { useEffect, useMemo, useState } from "react";
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
import {
  STATUS_CONTRATO,
  TESES_OFICIAIS,
  isProcessoJudicialForaCalculo,
  isReportoProcesso,
  normalizeTeseCatalogCodigo,
  processoTeseCatalogCodigo,
  teseOficialLabel,
} from "@/lib/clientes-constants";
import { resolveCatalogTeseId, syncCreditoApuradoFromProcesso } from "@/lib/sync-credito-apurado";
import { useMotorTesesAtivas } from "@/hooks/data/useClienteOperacional";
import { logClienteHistorico } from "@/lib/cliente-historico";
import {
  TIPOS_RECUPERACAO,
  isTipoRecuperacao,
  resolveTipoRecuperacao,
  type TipoRecuperacao,
} from "@/lib/tipo-recuperacao";
import {
  isStatusProcessoEditavel,
  statusProcessoEditaveis,
} from "@/lib/client-operation";
import type { Database } from "@/integrations/supabase/types";

type ProcessoRow = Database["public"]["Tables"]["processos_teses"]["Row"];
type ProcessoInsert = Database["public"]["Tables"]["processos_teses"]["Insert"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  existingTeses: string[];
  processo?: ProcessoRow | null;
  /** Pré-seleciona tese ao abrir para criação */
  presetTese?: string | null;
  onSuccess: () => void;
  editable?: boolean;
}

interface TeseOption {
  tese: string;
  nome_exibicao: string;
  tipo_recuperacao_padrao?: string | null;
}

/**
 * Tratamento financeiro sugerido ao escolher a tese/ramo: Reporto é "possível
 * futuro"; ramo judicial fica fora do cálculo como recuperação judicial; o
 * resto entra no cálculo. O usuário pode trocar no seletor.
 */
function categoriaPadrao(isReporto: boolean, tipo: TipoRecuperacao): string {
  if (isReporto) return "reporto";
  if (tipo === "recuperacao_judicial") return "recuperacao_judicial";
  return "compensacao";
}

const EMPTY_FORM = {
  tese: "",
  nome_exibicao: "",
  valor_credito: "",
  percentual_honorario: "",
  status_contrato: "aguardando_assinatura",
  status_processo: "a_compensar",
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
  editable = true,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const motorQ = useMotorTesesAtivas();
  // Seletor = as 6 teses oficiais (código do catálogo + nome padronizado).
  // O motor só empresta o ramo padrão; seus slugs não viram opção, senão a
  // mesma tese aparecia duplicada com nomes diferentes.
  const teses = useMemo<TeseOption[]>(() => {
    const motor = (motorQ.data ?? []) as TeseOption[];
    return TESES_OFICIAIS.map(({ codigo, label }) => ({
      tese: codigo,
      nome_exibicao: label,
      tipo_recuperacao_padrao:
        motor.find((m) => normalizeTeseCatalogCodigo(m.tese, m.nome_exibicao) === codigo)
          ?.tipo_recuperacao_padrao ?? null,
    }));
  }, [motorQ.data]);
  // Processo legado pode guardar slug (`subvencao_icms`); o form trabalha com o código.
  const processoCodigo = processo
    ? String(processoTeseCatalogCodigo(processo) || processo.tese)
    : null;
  const refetchMotor = motorQ.refetch;

  useEffect(() => {
    if (open) void refetchMotor();
  }, [open, refetchMotor]);

  useEffect(() => {
    if (!open) return;
    if (processo) {
      const codigo = String(processoTeseCatalogCodigo(processo) || processo.tese);
      setForm({
        tese: codigo,
        nome_exibicao: teseOficialLabel(codigo) ?? processo.nome_exibicao,
        valor_credito: String(processo.valor_credito || 0),
        percentual_honorario: String(processo.percentual_honorario || 0),
        status_contrato: processo.status_contrato,
        status_processo: processo.status_processo,
        observacao: processo.observacao || "",
        categoria: isReportoProcesso(processo)
          ? "reporto"
          : isProcessoJudicialForaCalculo(processo)
            ? "recuperacao_judicial"
            : "compensacao",
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
    const codigo = String(normalizeTeseCatalogCodigo(presetTese) || presetTese);
    const t = teses.find((x) => x.tese === codigo);
    const nome = t?.nome_exibicao || presetTese;
    const isReporto = isReportoProcesso({ tese: codigo, nome_exibicao: nome });
    const tipo = resolveTipoRecuperacao(t?.tipo_recuperacao_padrao, codigo, nome);
    setForm({
      ...EMPTY_FORM,
      tese: codigo,
      nome_exibicao: nome,
      categoria: categoriaPadrao(isReporto, tipo),
      tipo_recuperacao: tipo,
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
    if (processoCodigo === t.tese) return true;
    if (existingTeses.includes(t.tese)) return false;
    const n = normalizeTeseCatalogCodigo(t.tese, t.nome_exibicao);
    if (n && takenNorm.has(n)) return false;
    return true;
  });

  /**
   * O seletor abrir vazio tem três causas diferentes e o usuário não tem como
   * distinguir olhando: ainda carregando, o catálogo não voltou nenhuma tese
   * ativa, ou o cliente já usa todas. Nomeia cada caso em vez de mostrar nada.
   */
  const avisoListaVazia = "Este cliente já tem todas as teses oficiais.";

  const handleTesePick = (value: string) => {
    const t = teses.find((x) => x.tese === value);
    const nome = t?.nome_exibicao || value;
    const isReporto = isReportoProcesso({ tese: value, nome_exibicao: nome });
    const tipo = resolveTipoRecuperacao(t?.tipo_recuperacao_padrao, value, nome);
    setForm((p) => ({
      ...p,
      tese: value,
      nome_exibicao: nome,
      categoria: categoriaPadrao(isReporto, tipo),
      tipo_recuperacao: tipo,
    }));
  };

  const teseJaUsada = (slug: string) => {
    // Editar sem trocar a tese nunca bloqueia (cliente legado com processo
    // duplicado da mesma tese precisa continuar editável).
    if (processo && slug === processoCodigo) return false;
    if (existingTeses.includes(slug) && slug !== processo?.tese && slug !== processoCodigo) return true;
    const n = normalizeTeseCatalogCodigo(slug, form.nome_exibicao);
    return !!(n && takenNorm.has(n));
  };

  const formIsReporto = isReportoProcesso({
    tese: form.tese,
    nome_exibicao: form.nome_exibicao,
    categoria: form.categoria,
  });

  const handleSave = async () => {
    if (!editable) return;
    if (!form.tese) { toast.error("Selecione uma tese."); return; }
    if (teseJaUsada(form.tese)) {
      toast.error("Já existe um processo com essa tese neste cliente.");
      return;
    }

    const teseMudou = !!processo && form.tese !== processoCodigo;
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

    if (!isStatusProcessoEditavel(form.status_processo, formIsReporto)) {
      toast.error("Escolha um status de processo disponível.");
      return;
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
    } satisfies ProcessoInsert;

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
          .update({ tese_origem_id: teseId })
          .eq("processo_tese_id", processo.id);
        await supabase
          .from("clientes")
          .update({ tese_ativa_id: teseId })
          .eq("id", clienteId);
      }
      logClienteHistorico(
        clienteId,
        "tese_processo_alterada",
        `Processo "${form.nome_exibicao}": ${processo.tese} → ${form.tese}`,
      );
    }
    if (
      processo &&
      (processo.status_contrato !== form.status_contrato ||
        processo.status_processo !== form.status_processo)
    ) {
      logClienteHistorico(
        clienteId,
        "status_mudado",
        `Situação da tese "${form.nome_exibicao}" atualizada`,
        {
          status_contrato: processo.status_contrato,
          status_processo: processo.status_processo,
        },
        {
          status_contrato: form.status_contrato,
          status_processo: form.status_processo,
        },
      );
    }

    try {
      await syncCreditoApuradoFromProcesso({
        clienteId,
        tese: form.tese,
        nomeExibicao: form.nome_exibicao,
        valorCredito: payload.valor_credito,
        categoria: form.categoria,
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
          <DialogTitle>{processo ? "Editar tese" : "Adicionar tese"}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Tese *</Label>
            <Select value={form.tese} onValueChange={handleTesePick}>
              <SelectTrigger><SelectValue placeholder="Selecione a tese" /></SelectTrigger>
              <SelectContent>
                {availableTeses.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">{avisoListaVazia}</p>
                ) : (
                  availableTeses.map((t) => (
                    <SelectItem key={t.tese} value={t.tese}>{t.nome_exibicao}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ramo da tese</Label>
            <Select
              value={form.tipo_recuperacao}
              onValueChange={(v) => {
                if (!isTipoRecuperacao(v)) return;
                setForm((current) => ({
                  ...current,
                  tipo_recuperacao: v,
                  // Ramo judicial acompanha o tratamento (e volta ao cálculo ao sair dele),
                  // a não ser que a tese seja Reporto.
                  categoria:
                    current.categoria === "reporto"
                      ? current.categoria
                      : v === "recuperacao_judicial"
                        ? "recuperacao_judicial"
                        : current.categoria === "recuperacao_judicial"
                          ? "compensacao"
                          : current.categoria,
                }));
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
              Como esta tese será conduzida: compensação, ressarcimento ou recuperação judicial.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Tratamento financeiro</Label>
            <Select
              value={form.categoria}
              onValueChange={(v) => {
                setForm((current) => ({
                  ...current,
                  categoria: v,
                  status_processo:
                    !isReportoProcesso({
                      tese: current.tese,
                      nome_exibicao: current.nome_exibicao,
                      categoria: v,
                    }) &&
                    current.status_processo === "pedido_feito_receita"
                      ? "a_compensar"
                      : current.status_processo,
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compensacao">Crédito no cálculo</SelectItem>
                <SelectItem value="reporto">Possível futuro (REPORTO)</SelectItem>
                <SelectItem value="recuperacao_judicial">Recuperação judicial (fora do cálculo)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Define se o crédito entra nos totais ou fica separado: possibilidade futura (Reporto)
              ou tese judicial ainda em julgamento, que não soma no apurado nem no compensado.
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
            <Label>Etapa da tese</Label>
            <Select value={form.status_processo} onValueChange={(v) => update("status_processo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {!isStatusProcessoEditavel(
                  form.status_processo,
                  formIsReporto,
                ) && (
                  <SelectItem value={form.status_processo || "__legacy__"} disabled>
                    Legado: {form.status_processo || "sem classificação"}
                  </SelectItem>
                )}
                {statusProcessoEditaveis(
                  formIsReporto,
                ).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Contrato e etapa são editados somente aqui.
            </p>
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
