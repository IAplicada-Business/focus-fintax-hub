import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { closersDaEquipe, sdrsDaEquipe, type MembroEquipeComercial } from "@/lib/equipe-comercial";
import { PRODUTOS_LEAD } from "@/lib/produto-lead";
import type { AtribuicaoLeads } from "@/services/leadsService";

/** Valores especiais do select além dos user_ids. */
const MANTER = "__manter";
const LIMPAR = "__limpar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quantidade: number;
  equipe: MembroEquipeComercial[];
  onConfirm: (atribuicao: AtribuicaoLeads) => Promise<void> | void;
  busy?: boolean;
}

/**
 * Atribuição em lote (Fila de Leads). Cada campo tem "manter atual" para a
 * gestora trocar só o closer de uma lista sem mexer nos SDRs, e "deixar
 * solto" para devolver leads ao pool de qualquer SDR.
 */
export function AtribuirLeadsDialog({ open, onOpenChange, quantidade, equipe, onConfirm, busy }: Props) {
  const [sdr, setSdr] = useState(MANTER);
  const [closer, setCloser] = useState(MANTER);
  const [produto, setProduto] = useState(MANTER);

  useEffect(() => {
    if (!open) return;
    setSdr(MANTER);
    setCloser(MANTER);
    setProduto(MANTER);
  }, [open]);

  const nadaMuda = sdr === MANTER && closer === MANTER && produto === MANTER;

  const confirmar = async () => {
    await onConfirm({
      sdrId: sdr === MANTER || sdr === LIMPAR ? null : sdr,
      limparSdr: sdr === LIMPAR,
      closerId: closer === MANTER || closer === LIMPAR ? null : closer,
      limparCloser: closer === LIMPAR,
      produto: produto === MANTER ? null : produto,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atribuir {quantidade} lead{quantidade === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>Define quem cuida destes leads. "Manter atual" não altera o campo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="atribuir-sdr">SDR</Label>
            <Select value={sdr} onValueChange={setSdr}>
              <SelectTrigger id="atribuir-sdr"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MANTER}>Manter atual</SelectItem>
                <SelectItem value={LIMPAR}>Deixar solto (sem SDR)</SelectItem>
                {sdrsDaEquipe(equipe).map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || "Sem nome"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="atribuir-closer">Closer</Label>
            <Select value={closer} onValueChange={setCloser}>
              <SelectTrigger id="atribuir-closer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MANTER}>Manter atual</SelectItem>
                <SelectItem value={LIMPAR}>Sem closer</SelectItem>
                {closersDaEquipe(equipe).map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || "Sem nome"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="atribuir-produto">Produto</Label>
            <Select value={produto} onValueChange={setProduto}>
              <SelectTrigger id="atribuir-produto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MANTER}>Manter atual</SelectItem>
                {PRODUTOS_LEAD.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={busy || nadaMuda} className="bg-navy hover:bg-navy/90">
            <UserCheck className="h-4 w-4 mr-1" />
            {busy ? "Atribuindo..." : "Atribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
