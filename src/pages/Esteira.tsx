import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BellRing, KanbanSquare, ListChecks, Settings2, TableProperties } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEsteiraClientes, useEsteiraSlaConfig } from "@/hooks/data/useEsteira";
import { EsteiraKanban } from "@/components/esteira/EsteiraKanban";
import { EsteiraAcompanhamento } from "@/components/esteira/EsteiraAcompanhamento";
import { EsteiraCobranca } from "@/components/esteira/EsteiraCobranca";
import { SkeletonTable } from "@/components/dashboard/SkeletonTable";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { visibleEsteiraStages } from "@/lib/esteira-constants";
import { RAMO_FILTROS, pertenceAoRamo, ramosDoCliente, type RamoFiltro } from "@/lib/esteira-acompanhamento";
import { cn } from "@/lib/utils";

type EsteiraTab = "acompanhamento" | "kanban" | "cobranca";

const TAB_KEY = "esteira.tab";
const RAMO_KEY = "esteira.ramo";

const TABS: { value: EsteiraTab; label: string; icon: typeof ListChecks; hint: string }[] = [
  { value: "acompanhamento", label: "Acompanhamento", icon: TableProperties, hint: "Tabela — quem monitora" },
  { value: "kanban", label: "Kanban", icon: KanbanSquare, hint: "Arrastar — quem opera" },
  { value: "cobranca", label: "Cobrança", icon: BellRing, hint: "Fim de dia — quem cobrar" },
];

function isTab(v: string | null): v is EsteiraTab {
  return v === "acompanhamento" || v === "kanban" || v === "cobranca";
}

function isRamo(v: string | null): v is RamoFiltro {
  return RAMO_FILTROS.some((r) => r.value === v);
}

export default function Esteira() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userRole } = useAuth();
  const podeOrganizar = userRole === "admin" || userRole === "pmo";
  const { data: clientes, isLoading } = useEsteiraClientes();
  const { data: slaConfig } = useEsteiraSlaConfig();

  // Aba inicial: ?tab= > preferência salva > papel (PMO/admin monitora, o resto opera).
  const [tab, setTab] = useState<EsteiraTab>(() => {
    const fromUrl = searchParams.get("tab");
    if (isTab(fromUrl)) return fromUrl;
    try {
      const stored = localStorage.getItem(TAB_KEY);
      if (isTab(stored)) return stored;
    } catch {
      /* storage indisponível */
    }
    return userRole === "admin" || userRole === "pmo" ? "acompanhamento" : "kanban";
  });

  const [ramo, setRamo] = useState<RamoFiltro>(() => {
    const fromUrl = searchParams.get("ramo");
    if (isRamo(fromUrl)) return fromUrl;
    try {
      const stored = localStorage.getItem(RAMO_KEY);
      if (isRamo(stored)) return stored;
    } catch {
      /* storage indisponível */
    }
    return "todas";
  });

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
      localStorage.setItem(RAMO_KEY, ramo);
    } catch {
      /* storage indisponível */
    }
    // Mantém a URL compartilhável (Dashboard linka pra cá com filtro).
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (ramo === "todas") next.delete("ramo");
    else next.set("ramo", ramo);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [tab, ramo, searchParams, setSearchParams]);

  const stages = useMemo(() => {
    if (!slaConfig) return undefined;
    return visibleEsteiraStages(
      slaConfig,
      (clientes ?? []).map((c) => c.estagio_esteira || "triagem"),
    );
  }, [slaConfig, clientes]);

  const contagemRamo = useMemo(() => {
    const m: Record<RamoFiltro, number> = { todas: 0, compensacao: 0, ressarcimento: 0, recuperacao_judicial: 0 };
    for (const c of clientes ?? []) {
      m.todas += 1;
      for (const r of ramosDoCliente(c)) m[r] += 1;
    }
    return m;
  }, [clientes]);

  const clientesDoRamo = useMemo(
    () => (clientes ?? []).filter((c) => pertenceAoRamo(c, ramo)),
    [clientes, ramo],
  );

  useEffect(() => {
    const channel = supabase
      .channel("esteira-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["esteira"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const tabAtual = TABS.find((t) => t.value === tab) ?? TABS[0];

  // h-full + min-h-0: o conteúdo ocupa a altura restante do <main> em vez de
  // depender de um calc(100vh - N) que nunca bate com o header real.
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Esteira Administrativa</h1>
          <p className="text-sm text-muted-foreground">{tabAtual.hint} · fluxo operacional dos clientes ativos.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {podeOrganizar && (
            <Button asChild size="sm" variant="outline">
              <Link to="/esteira/organizar">
                <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                Organizar
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/configuracoes/esteira-sla">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Configurar SLA
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        {/* Seletor de esteira (ramo). Cliente com mais de um ramo aparece em cada um deles. */}
        <div role="tablist" aria-label="Esteira por ramo" className="flex rounded-lg border bg-card p-0.5">
          {RAMO_FILTROS.map((r) => {
            const ativo = ramo === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => setRamo(r.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  ativo ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
                <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {contagemRamo[r.value]}
                </span>
              </button>
            );
          })}
        </div>

        <Tabs value={tab} onValueChange={(v) => { if (isTab(v)) setTab(v); }}>
          <TabsList className="h-9">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3 text-xs">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading || !slaConfig ? (
        <SkeletonTable />
      ) : tab === "kanban" ? (
        <EsteiraKanban
          clientes={clientesDoRamo}
          stages={stages}
          onClienteClick={(id) => navigate(`/clientes/${id}`)}
        />
      ) : tab === "cobranca" ? (
        <EsteiraCobranca clientes={clientesDoRamo} slaConfig={slaConfig} />
      ) : (
        <EsteiraAcompanhamento clientes={clientesDoRamo} slaConfig={slaConfig} />
      )}
    </div>
  );
}
