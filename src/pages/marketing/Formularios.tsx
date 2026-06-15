import { useState } from "react";
import { useMetaForms } from "@/hooks/data/useMetaForms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { Eye } from "lucide-react";

export default function Formularios() {
  const { data, isLoading } = useMetaForms();
  const [openForm, setOpenForm] = useState<{ name: string; questions: unknown } | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Formulários de Lead Generation publicados na Page da Focus FinTax (vindos do sync diário).
      </p>

      {isLoading ? (
        <SkeletonTable />
      ) : !data || data.length === 0 ? (
        <div className="text-center py-12 border border-card-border/70 rounded-2xl bg-card">
          <p className="text-muted-foreground">Nenhum formulário sincronizado ainda.</p>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Leads totais</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-[120px]">Questions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{f.name ?? f.id}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{f.id}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      f.status === "ACTIVE" ? "bg-green-100 text-green-800 border-green-200"
                      : "bg-muted text-muted-foreground border-border"
                    }>{f.status ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.leads_count ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {f.created_time ? new Date(f.created_time).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setOpenForm({ name: f.name ?? f.id, questions: f.questions })}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Eye className="h-3.5 w-3.5" /> Ver
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!openForm} onOpenChange={(v) => !v && setOpenForm(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Questions · {openForm?.name}</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted/40 rounded-xl p-4 overflow-auto font-mono">
            {JSON.stringify(openForm?.questions, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
