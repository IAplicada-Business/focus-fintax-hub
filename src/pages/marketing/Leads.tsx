import { useState } from "react";
import { useMetaLeads, useMetaLeadsRealtime } from "@/hooks/data/useMetaLeads";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { Search, ExternalLink, Radio } from "lucide-react";
import { Link } from "react-router-dom";

const ROLES_WITH_PII = new Set(["admin", "pmo", "comercial"]);

function maskEmail(e: string | null | undefined) {
  if (!e) return "—";
  const [u, d] = e.split("@");
  if (!d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}
function maskPhone(p: string | null | undefined) {
  if (!p) return "—";
  const digits = String(p).replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${digits.slice(0, 2)} ****-${digits.slice(-4)}`;
}

export default function Leads() {
  // Realtime: invalida cache quando chega lead novo
  useMetaLeadsRealtime();

  const { data, isLoading } = useMetaLeads(500);
  const { userRole } = useAuth();
  const canSeePii = ROLES_WITH_PII.has(userRole ?? "");
  const [search, setSearch] = useState("");

  const filtered = (data ?? []).filter((l) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      l.nome?.toLowerCase().includes(q) ||
      l.razao_social?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.cnpj?.includes(q) ||
      l.id.includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nome, empresa, email ou CNPJ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-[340px]"
          />
        </div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground ml-auto">
          <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
          Atualizando em tempo real
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-card-border/70 rounded-2xl bg-card">
          <p className="text-muted-foreground">Nenhum lead recebido pela integração Meta ainda.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Quando o webhook receber um lead, ele aparece aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido em</TableHead>
                <TableHead>Empresa / Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead className="text-right">Faturamento est.</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {l.created_time
                      ? new Date(l.created_time).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-foreground">{l.razao_social || l.nome || "—"}</p>
                    {l.cnpj && <p className="text-[11px] text-muted-foreground font-mono">{l.cnpj}</p>}
                  </TableCell>
                  <TableCell className="text-xs">
                    <p className="text-foreground">{canSeePii ? (l.email ?? "—") : maskEmail(l.email)}</p>
                    <p className="text-muted-foreground">{canSeePii ? (l.phone ?? "—") : maskPhone(l.phone)}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.segmento ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.regime_tributacao ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {l.faturamento_estimado
                      ? Number(l.faturamento_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                      : (l.faturamento_faixa ?? "—")}
                  </TableCell>
                  <TableCell>
                    {l.crm_lead_id ? (
                      <Link
                        to={`/leads/${l.crm_lead_id}/relatorio`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.error_text ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200" title={l.error_text}>
                        {l.error_text.startsWith("blocked") ? "Bloqueado" : "Erro"}
                      </Badge>
                    ) : l.processed_at ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                        Processado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                        Pendente
                      </Badge>
                    )}
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
