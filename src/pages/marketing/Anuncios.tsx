import { useMemo, useState } from "react";
import { useMetaAds } from "@/hooks/data/useMetaAds";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { Search } from "lucide-react";

const fmtMoney = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);

export default function Anuncios() {
  const { data, isLoading } = useMetaAds(30);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q
      ? data.filter((a) =>
          a.name?.toLowerCase().includes(q) ||
          a.id.includes(q) ||
          a.campaign_name?.toLowerCase().includes(q),
        )
      : data;
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar anúncio, ID ou campanha"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-[320px]"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} anúncio(s) · métricas 30d
        </span>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-card-border/70 rounded-2xl bg-card">
          <p className="text-muted-foreground">Nenhum anúncio encontrado.</p>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anúncio</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Impressões</TableHead>
                <TableHead className="text-right">Clicks (link)</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{a.name ?? a.id}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{a.id}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.campaign_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      a.status === "ACTIVE" ? "bg-green-100 text-green-800 border-green-200"
                      : a.status === "PAUSED" ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-muted text-muted-foreground border-border"
                    }>{a.status ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(a.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(a.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(a.link_clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(a.ctr)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtInt(a.leads)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(a.cpl)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
