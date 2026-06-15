import { useMetaLogs } from "@/hooks/data/useMetaLogs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";

function formatDuration(start: string, finish: string | null): string {
  if (!finish) return "—";
  const ms = new Date(finish).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function Logs() {
  const { data, isLoading } = useMetaLogs(100);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Histórico das execuções das edge functions Meta (últimas 100). Útil pra debug do webhook e dos crons.
      </p>

      {isLoading ? (
        <SkeletonTable />
      ) : !data || data.length === 0 ? (
        <div className="text-center py-12 border border-card-border/70 rounded-2xl bg-card">
          <p className="text-muted-foreground">Nenhuma execução registrada ainda.</p>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Linhas</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono">{l.id}</TableCell>
                  <TableCell className="text-xs font-mono">{l.function_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.started_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {formatDuration(l.started_at, l.finished_at)}
                  </TableCell>
                  <TableCell>
                    {l.finished_at == null ? (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                        Em execução
                      </Badge>
                    ) : l.ok ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">OK</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        Erro
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{l.rows_affected ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[420px] truncate" title={l.error_text ?? ""}>
                    {l.error_text ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
