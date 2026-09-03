import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ListChecks, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ResponsavelAvatar } from "@/components/esteira/ResponsavelAvatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EsteiraCliente } from "@/services/esteiraService";
import type { EsteiraSlaConfigRow } from "@/services/esteiraSlaConfigService";
import {
  FAIXAS_ATRASO,
  ordenarPorSla,
  pertenceAFaixa,
  proximaAcao,
  ramosDoCliente,
  slaInfo,
  type FaixaAtraso,
  type SlaStatus,
} from "@/lib/esteira-acompanhamento";
import { TIPO_RECUPERACAO_BADGE, TIPO_RECUPERACAO_LABEL } from "@/lib/tipo-recuperacao";
import { cn } from "@/lib/utils";

interface Props {
  clientes: EsteiraCliente[];
  slaConfig: EsteiraSlaConfigRow[];
}

const TODOS = "__todos__";
const SEM_RESP = "__sem__";

const SLA_PILL: Record<SlaStatus, string> = {
  estourado: "bg-red-50 text-red-700 border-red-200",
  atencao: "bg-amber-50 text-amber-800 border-amber-200",
  no_prazo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sem_sla: "bg-muted text-muted-foreground border-transparent",
};

function slaTexto(status: SlaStatus, restante: number | null): string {
  if (status === "sem_sla" || restante == null) return "sem meta";
  if (restante < 0) return `${Math.abs(restante)}d estourado`;
  if (restante === 0) return "vence hoje";
  if (restante === 1) return "vence amanhã";
  return `${restante}d restantes`;
}

/**
 * Aba Acompanhamento — visão padrão do PMO. Uma tabela, todos os clientes do
 * ramo selecionado, SLA mais estourado primeiro. Não arrasta nada: quem opera
 * usa o Kanban; aqui é só leitura + clique pra abrir o cliente.
 */
export function EsteiraAcompanhamento({ clientes, slaConfig }: Props) {
  const navigate = useNavigate();
  const [faixa, setFaixa] = useState<FaixaAtraso>("todas");
  const [responsavel, setResponsavel] = useState<string>(TODOS);
  const [busca, setBusca] = useState("");

  const labelEtapa = useMemo(() => {
    const m = new Map(slaConfig.map((r) => [r.estagio as string, r.label]));
    return (e: string) => m.get(e) ?? e;
  }, [slaConfig]);

  const responsaveis = useMemo(() => {
    const m = new Map<string, string>();
    let semResp = false;
    for (const c of clientes) {
      if (c.responsavel_id) m.set(c.responsavel_id, c.responsavel_nome ?? "Sem nome");
      else semResp = true;
    }
    const lista = [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
    return { lista, semResp };
  }, [clientes]);

  const contagem = useMemo(() => {
    const c = { estourado: 0, atencao: 0, no_prazo: 0, sem_sla: 0 } as Record<SlaStatus, number>;
    for (const cli of clientes) c[slaInfo(cli).status] += 1;
    return c;
  }, [clientes]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = clientes.filter((c) => {
      if (!pertenceAFaixa(c, faixa)) return false;
      if (responsavel === SEM_RESP && c.responsavel_id) return false;
      if (responsavel !== TODOS && responsavel !== SEM_RESP && c.responsavel_id !== responsavel) return false;
      if (termo && !c.empresa.toLowerCase().includes(termo) && !(c.cnpj || "").includes(termo)) return false;
      return true;
    });
    return ordenarPorSla(filtrados);
  }, [clientes, faixa, responsavel, busca]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-card p-0.5">
          {FAIXAS_ATRASO.map((f) => {
            const n = f.value === "todas" ? clientes.length : contagem[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFaixa(f.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  faixa === f.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                    f.value === "estourado" && n > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <Select value={responsavel} onValueChange={setResponsavel}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS} className="text-xs">Todos os responsáveis</SelectItem>
            {responsaveis.semResp && (
              <SelectItem value={SEM_RESP} className="text-xs">Sem responsável</SelectItem>
            )}
            {responsaveis.lista.map(([id, nome]) => (
              <SelectItem key={id} value={id} className="text-xs">{nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative ml-auto w-full sm:w-60">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou CNPJ" className="h-8 pl-8 text-xs" />
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={<ListChecks className="h-5 w-5 text-[rgba(10,21,100,0.3)]" />}
            title="Nenhum cliente neste filtro"
            subtitle="Troque a faixa, o responsável ou o ramo."
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="text-[10px] uppercase tracking-wide">
                <TableHead className="pl-3">Cliente</TableHead>
                <TableHead>Esteira</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead className="text-right">Parado</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Última ação</TableHead>
                <TableHead>Próxima ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((c) => {
                const sla = slaInfo(c);
                const ramos = ramosDoCliente(c);
                return (
                  <TableRow
                    key={c.id}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className={cn("cursor-pointer", sla.status === "estourado" && "bg-red-50/40 hover:bg-red-50/70")}
                  >
                    <TableCell className="max-w-[240px] pl-3">
                      <p className="truncate text-sm font-medium text-foreground">{c.empresa}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.cnpj || "—"}
                        {(c.teses_assinadas ?? 0) > 1 ? ` · ${c.teses_assinadas} teses` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {ramos.map((r) => (
                          <span key={r} className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", TIPO_RECUPERACAO_BADGE[r])}>
                            {TIPO_RECUPERACAO_LABEL[r]}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-foreground">
                      {labelEtapa(c.estagio_esteira)}
                      {c.estagio_esteira === "nova_abordagem" && (c.tentativas_abordagem ?? 0) > 0 && (
                        <span className="ml-1 text-[10px] text-violet-700">({c.tentativas_abordagem}ª)</span>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right text-xs tabular-nums", sla.status === "estourado" ? "font-semibold text-destructive" : "text-foreground")}>
                      {sla.dias}d
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", SLA_PILL[sla.status])}>
                        {sla.status === "estourado" && <AlertTriangle className="h-3 w-3" />}
                        {slaTexto(sla.status, sla.restante)}
                      </span>
                      {sla.sla != null && <p className="mt-0.5 text-[10px] text-muted-foreground">meta {sla.sla}d</p>}
                    </TableCell>
                    <TableCell className="max-w-[170px]">
                      <ResponsavelAvatar nome={c.responsavel_nome} comNome />
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {c.ultima_acao_em ? (
                        <>
                          <p className="truncate text-xs text-foreground" title={c.ultima_acao_descricao ?? undefined}>
                            {c.ultima_acao_descricao || c.ultima_acao_tipo || "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(c.ultima_acao_em), { locale: ptBR, addSuffix: true })}
                          </p>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Nenhuma registrada</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px] text-xs text-foreground">
                      <span className="line-clamp-2">{proximaAcao(c, slaConfig)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
