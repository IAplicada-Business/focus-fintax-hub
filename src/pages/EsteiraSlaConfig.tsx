import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Save, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useEsteiraSlaConfig,
  useUpdateEsteiraSlaConfig,
} from "@/hooks/data/useEsteira";
import type { EsteiraSlaConfigRow } from "@/services/esteiraSlaConfigService";
import type { EstagioEsteira } from "@/lib/esteira-constants";

function canEditSla(role: string | undefined | null): boolean {
  return role === "admin" || role === "pmo";
}

export default function EsteiraSlaConfigPage() {
  const { userRole } = useAuth();
  const editable = canEditSla(userRole);
  const { data, isLoading, isError, error, refetch } = useEsteiraSlaConfig();
  const update = useUpdateEsteiraSlaConfig();
  const [rows, setRows] = useState<EsteiraSlaConfigRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setRows(data.map((r) => ({ ...r })));
      setDirty(false);
    }
  }, [data]);

  const setSla = (estagio: EstagioEsteira, raw: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.estagio !== estagio) return r;
        if (raw.trim() === "") return { ...r, sla_dias: null };
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return r;
        return { ...r, sla_dias: Math.floor(n) };
      }),
    );
    setDirty(true);
  };

  const handleSave = async () => {
    if (!editable) return;
    try {
      await update.mutateAsync(
        rows.map((r) => ({
          estagio: r.estagio,
          sla_dias: r.sla_dias,
          label: r.label,
        })),
      );
      toast.success("Prazos da esteira atualizados.");
      setDirty(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível salvar os prazos.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to="/esteira"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar à esteira
        </Link>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">SLA da Esteira</h1>
            <p className="text-sm text-muted-foreground">
              Prazos por etapa (dias de calendário). Alterações valem na hora no
              kanban e no painel de SLA — sem redeploy.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Falha ao carregar a config</p>
          <p className="mt-1 text-muted-foreground">
            {(error as Error)?.message || "Tente de novo."}
          </p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="grid grid-cols-[1fr_7rem] gap-2 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Etapa</span>
            <span className="text-right">Prazo (dias)</span>
          </div>
          <ul className="divide-y">
            {rows.map((r) => (
              <li
                key={r.estagio}
                className="grid grid-cols-[1fr_7rem] items-center gap-2 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground">{r.estagio}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Label htmlFor={`sla-${r.estagio}`} className="sr-only">
                    SLA {r.label}
                  </Label>
                  <Input
                    id={`sla-${r.estagio}`}
                    type="number"
                    min={0}
                    step={1}
                    disabled={!editable || update.isPending}
                    placeholder="—"
                    className="h-8 w-24 text-right text-sm"
                    value={r.sla_dias ?? ""}
                    onChange={(e) => setSla(r.estagio, e.target.value)}
                  />
                  {r.sla_dias == null && (
                    <span className="text-[10px] text-muted-foreground">sem meta</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
            <p className="text-[11px] text-muted-foreground">
              Campo vazio = etapa sem SLA (não gera atraso). Default Financeiro: 5 dias.
            </p>
            {editable ? (
              <Button
                type="button"
                size="sm"
                disabled={!dirty || update.isPending}
                onClick={handleSave}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {update.isPending ? "Salvando…" : "Salvar"}
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">Somente admin/PMO editam</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
