import { useMemo, useState } from "react";
import { useMetaCampaigns } from "@/hooks/data/useMetaCampaigns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { Search } from "lucide-react";

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const statusBadgeClass = (s: string | null) => {
  if (s === "ACTIVE")   return "bg-green-100 text-green-800 border-green-200";
  if (s === "PAUSED")   return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "DELETED" || s === "ARCHIVED") return "bg-muted text-muted-foreground border-border";
  return "bg-muted text-muted-foreground border-border";
};

export default function Campanhas() {
  const [search, setSearch]       = useState("");
  const [status, setStatus]       = useState<string>("all");
  const [objective, setObjective] = useState<string>("all");

  const { data, isLoading } = useMetaCampaigns({
    status:    status === "all"    ? undefined : status,
    objective: objective === "all" ? undefined : objective,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q ? data.filter((c) => c.name?.toLowerCase().includes(q) || c.id.includes(q)) : data;
  }, [data, search]);

  const objectives = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((c) => c.objective).filter(Boolean) as string[])].sort();
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nome ou ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-[280px]"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
            <SelectItem value="PAUSED">PAUSED</SelectItem>
            <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
            <SelectItem value="DELETED">DELETED</SelectItem>
          </SelectContent>
        </Select>
        <Select value={objective} onValueChange={setObjective}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Objetivo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os objetivos</SelectItem>
            {objectives.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} campanha(s)</span>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-card-border/70 rounded-2xl bg-card">
          <p className="text-muted-foreground">Nenhuma campanha encontrada.</p>
          <p className="text-xs text-muted-foreground mt-1">Rode <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">meta-sync-structure</code> manualmente se a sincronização ainda não rodou.</p>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Objetivo</TableHead>
                <TableHead className="text-right">Daily budget</TableHead>
                <TableHead className="text-right">Lifetime</TableHead>
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <p className="font-medium text-foreground">{c.name ?? c.id}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{c.id}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadgeClass(c.status)}>{c.status ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.objective ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(c.daily_budget)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(c.lifetime_budget)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.created_time ? new Date(c.created_time).toLocaleDateString("pt-BR") : "—"}
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
