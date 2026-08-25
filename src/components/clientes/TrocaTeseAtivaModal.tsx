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
import {
  formatCurrencyBR,
  normalizeTeseCatalogCodigo,
  statusUtilizacaoFromSaldo,
  sumCompensadoForTese,
} from "@/lib/clientes-constants";
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

    (async () => {
      const [{ data: mapa }, { data: comps }, { data: procs }, { data: creditos }, { data: catalogo }] =
        await Promise.all([
          (supabase as any)
            .from("v_mapa_creditos")
            .select(
              "tese_id, tese_codigo, tese_label, valor_apurado_inicial, total_compensado, saldo_final, status_utilizacao, incluir_no_calculo"
            )
            .eq("cliente_id", clienteId),
          supabase
            .from("compensacoes_mensais")
            .select(
              "valor_compensado, tese_origem_id, processo_tese_id, mes_referencia, tributo, tributo_enum, processos_teses:processo_tese_id(tese, nome_exibicao)"
            )
            .eq("cliente_id", clienteId),
          supabase.from("processos_teses").select("id, tese, nome_exibicao").eq("cliente_id", clienteId),
          (supabase as any)
            .from("creditos_apurados")
            .select("tese_id, valor_compensado_manual")
            .eq("cliente_id", clienteId),
          (supabase as any).from("teses_tributarias").select("id, codigo, label"),
        ]);

      const catalog = (catalogo || []) as { id: string; codigo: string | null; label: string | null }[];
      const catalogByCodigo = new Map(
        catalog
          .filter((t) => t.codigo)
          .map((t) => [String(t.codigo).toUpperCase(), t] as const),
      );
      const catalogById = new Map(catalog.map((t) => [t.id, t]));

      const processoIdsByTese = new Map<string, Set<string>>();
      for (const p of (procs as { id: string; tese: string | null; nome_exibicao?: string | null }[]) || []) {
        const cod = normalizeTeseCatalogCodigo(p.tese, p.nome_exibicao || "");
        if (!cod) continue;
        const key = String(cod).toUpperCase();
        if (!processoIdsByTese.has(key)) processoIdsByTese.set(key, new Set());
        processoIdsByTese.get(key)!.add(p.id);
      }

      const manualByTese = new Map<string, number>();
      for (const c of (creditos as { tese_id: string; valor_compensado_manual: number | null }[]) || []) {
        if (c.valor_compensado_manual != null) {
          manualByTese.set(c.tese_id, Number(c.valor_compensado_manual));
        }
      }

      const enrich = (r: CreditoLinha): CreditoLinha => {
        const codigo = String(r.tese_codigo || "").toUpperCase();
        const fromAba = sumCompensadoForTese((comps as any[]) || [], {
          teseCodigo: codigo,
          teseId: r.tese_id,
          processoIds: processoIdsByTese.get(codigo),
        });
        const manual = manualByTese.get(r.tese_id);
        const compensado = Math.max(
          fromAba,
          manual != null ? manual : 0,
          Number(r.total_compensado || 0),
        );
        const apurado = Number(r.valor_apurado_inicial || 0);
        return {
          ...r,
          total_compensado: compensado,
          saldo_final: apurado - compensado,
          status_utilizacao: statusUtilizacaoFromSaldo(apurado, compensado),
        };
      };

      const mapaRows = (mapa || []) as CreditoLinha[];
      const mapaById = new Map(mapaRows.map((r) => [r.tese_id, r]));
      const seen = new Set<string>();
      const rows: CreditoLinha[] = [];

      const pushRow = (r: CreditoLinha) => {
        if (!r.tese_id || seen.has(r.tese_id) || r.tese_codigo === "REPORTO") return;
        seen.add(r.tese_id);
        rows.push(enrich(r));
      };

      for (const r of mapaRows) {
        if (r.incluir_no_calculo === false) continue;
        pushRow(r);
      }

      for (const p of (procs as { tese: string | null; nome_exibicao?: string | null }[]) || []) {
        const codigo = normalizeTeseCatalogCodigo(p.tese, p.nome_exibicao || "");
        if (!codigo || codigo === "REPORTO") continue;
        const cat = catalogByCodigo.get(String(codigo).toUpperCase());
        if (!cat || seen.has(cat.id)) continue;
        const fromMapa = mapaById.get(cat.id);
        pushRow(
          fromMapa ?? {
            tese_id: cat.id,
            tese_codigo: String(cat.codigo || codigo).toUpperCase(),
            tese_label: cat.label || String(cat.codigo || codigo),
            valor_apurado_inicial: 0,
            total_compensado: 0,
            saldo_final: 0,
          },
        );
      }

      if (teseAtivaId && !seen.has(teseAtivaId)) {
        const cat = catalogById.get(teseAtivaId);
        const fromMapa = mapaById.get(teseAtivaId);
        if (fromMapa || (cat && String(cat.codigo || "").toUpperCase() !== "REPORTO")) {
          pushRow(
            fromMapa ?? {
              tese_id: cat!.id,
              tese_codigo: String(cat!.codigo || "").toUpperCase(),
              tese_label: cat!.label || String(cat!.codigo || ""),
              valor_apurado_inicial: 0,
              total_compensado: 0,
              saldo_final: 0,
            },
          );
        }
      }

      setLinhas(rows);
      setSelecionada(teseAtivaId || rows.find((r) => Number(r.saldo_final) > 0)?.tese_id || "");
      setLoading(false);
    })();
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
