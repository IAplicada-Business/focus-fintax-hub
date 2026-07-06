import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PIPELINE_STAGES, STAGE_COLORS, SEGMENTO_LABELS, SCORE_CONFIG, getScoreLabel, formatCurrency, daysSince } from "@/lib/pipeline-constants";
import { SEGMENTOS, REGIMES } from "@/lib/lead-constants";
import type { PipelineLead } from "@/pages/Pipeline";

interface Props {
  leads: PipelineLead[];
  onLeadClick: (id: string) => void;
}

const PAGE_SIZE = 25;

export function PipelineList({ leads, onLeadClick }: Props) {
  const [search, setSearch] = useState("");
  const [segFilter, setSegFilter] = useState("all");
  const [regimeFilter, setRegimeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [origemFilter, setOrigemFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string>("criado_em");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let result = [...leads];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((l) => l.empresa.toLowerCase().includes(s) || l.cnpj.includes(s));
    }
    if (segFilter !== "all") result = result.filter((l) => l.segmento === segFilter);
    if (regimeFilter !== "all") result = result.filter((l) => l.regime_tributario === regimeFilter);
    if (stageFilter !== "all") result = result.filter((l) => l.status_funil === stageFilter);
    if (origemFilter !== "all") result = result.filter((l) => l.origem === origemFilter);

    result.sort((a, b) => {
      let va: any, vb: any;
      if (sortCol === "empresa") { va = a.empresa; vb = b.empresa; }
      else if (sortCol === "score") { va = a.score_lead || 0; vb = b.score_lead || 0; }
      else if (sortCol === "potencial") {
        va = a.relatorios_leads?.[0]?.estimativa_total_maxima || 0;
        vb = b.relatorios_leads?.[0]?.estimativa_total_maxima || 0;
      }
      else if (sortCol === "dias") {
        va = daysSince(a.status_funil_atualizado_em || a.criado_em);
        vb = daysSince(b.status_funil_atualizado_em || b.criado_em);
      }
      else { va = a.criado_em; vb = b.criado_em; }

      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [leads, search, segFilter, regimeFilter, stageFilter, origemFilter, sortCol, sortAsc]);

  const origensDisponiveis = useMemo(
    () => Array.from(new Set(leads.map((l) => l.origem).filter(Boolean))).sort(),
    [leads]
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(col)}>
      {children} {sortCol === col ? (sortAsc ? "↑" : "↓") : ""}
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar empresa ou CNPJ" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9 w-[220px]" />
        </div>
        <Select value={segFilter} onValueChange={(v) => { setSegFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Segmento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos segmentos</SelectItem>
            {SEGMENTOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={regimeFilter} onValueChange={(v) => { setRegimeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Regime" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos regimes</SelectItem>
            {REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas etapas</SelectItem>
            {PIPELINE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={origemFilter} onValueChange={(v) => { setOrigemFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            {origensDisponiveis.map((o) => (
              <SelectItem key={o} value={o}>
                {o === "calculadora" ? "Calculadora RT"
                  : o === "formulario_lp" ? "Formulário LP"
                  : o === "meta_ads" ? "Meta Ads"
                  : o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader col="empresa">Empresa</SortHeader>
              <TableHead>Segmento</TableHead>
              <TableHead>Regime</TableHead>
              <SortHeader col="score">Score</SortHeader>
              <SortHeader col="potencial">Potencial</SortHeader>
              <TableHead>Etapa</TableHead>
              <TableHead>Fonte</TableHead>
              <SortHeader col="criado_em">Criado em</SortHeader>
              <SortHeader col="dias">Dias na etapa</SortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((lead, idx) => {
              const scoreLabel = getScoreLabel(lead.score_lead);
              const scoreConf = SCORE_CONFIG[scoreLabel];
              const potMin = lead.relatorios_leads?.[0]?.estimativa_total_minima || 0;
              const potMax = lead.relatorios_leads?.[0]?.estimativa_total_maxima || 0;
              const days = daysSince(lead.status_funil_atualizado_em || lead.criado_em);
              const stageLabel = PIPELINE_STAGES.find((s) => s.value === lead.status_funil)?.label || lead.status_funil;
              const stageColor = STAGE_COLORS[lead.status_funil] || "";

              return (
                <TableRow key={lead.id} className={`cursor-pointer hover:bg-[rgba(10,21,100,0.025)] ${idx % 2 === 0 ? "bg-[rgba(10,21,100,0.012)]" : ""}`} onClick={() => onLeadClick(lead.id)}>
                  <TableCell className="font-medium">{lead.empresa}</TableCell>
                  <TableCell><span className="text-xs">{SEGMENTO_LABELS[lead.segmento] || lead.segmento}</span></TableCell>
                  <TableCell><span className="text-xs">{lead.regime_tributario}</span></TableCell>
                  <TableCell>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreConf.color}`}>{scoreLabel}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {potMax > 0 ? `${formatCurrency(potMin)} → ${formatCurrency(potMax)}` : "—"}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${stageColor}`}>{stageLabel}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {lead.origem === "calculadora" ? (
                      <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">
                        Calculadora RT
                      </Badge>
                    ) : lead.origem === "formulario_lp" ? (
                      <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
                        LP
                      </Badge>
                    ) : lead.origem === "meta_ads" ? (
                      <Badge variant="outline" className="bg-cyan-100 text-cyan-800 border-cyan-200 text-[10px]">
                        Meta Ads
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{lead.origem}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(lead.criado_em).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="text-xs">{days}d</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{filtered.length} leads</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
