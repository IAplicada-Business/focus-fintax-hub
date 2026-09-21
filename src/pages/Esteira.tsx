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
import { visibleEsteiraStages } from "@/lib/esteira-constants";
import { defaultEsteiraSlaConfig } from "@/services/esteiraSlaConfigService";
import { RAMO_FILTROS, pertenceAoRamo, ramosDoCliente, type RamoFiltro } from "@/lib/esteira-acompanhamento";
import { cn } from "@/lib/utils";

type EsteiraTab = "acompanhamento" | "kanban" | "cobranca";

// v2: a preferência antiga guardava "acompanhamento" para admin/pmo e deixava
// o quadro invisível para sempre; a chave nova reabre todo mundo no Kanban.
const TAB_KEY = "esteira.tab.v2";
const RAMO_KEY = "esteira.ramo";

const TABS: { value: EsteiraTab; label: string; icon: typeof ListChecks; hint: string }[] = [
  { value: "kanban", label: "Kanban", icon: KanbanSquare, hint: "Quadro — arrastar entre etapas" },
  { value: "acompanhamento", label: "Tabela", icon: TableProperties, hint: "Tabela — quem monitora" },
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

  // Aba inicial: ?tab= > preferência salva > Kanban. O quadro é o formato
  // padrão da esteira para todo papel de operações — inclusive admin/pmo, que
  // antes caíam na tabela e não achavam o Kanban.
  const [tab, setTab] = useState<EsteiraTab>(() => {
    const fromUrl = searchParams.get("tab");
    if (isTab(fromUrl)) return fromUrl;
    try {
      const stored = localStorage.getItem(TAB_KEY);
      if (isTab(stored)) return stored;
    } catch {
      /* storage indisponível */
    }
    return "kanban";
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

  // `?etapa=` vem do painel "Onde os clientes estão" (dashboard operacional);
  // sem isso o link "clique para abrir a etapa" abria o quadro sem destino.
  const etapaFoco = searchParams.get("etapa");

  // A config do banco é opcional: se a query ainda não voltou (ou a RLS de
  // `esteira_sla_config` barrou o papel), o quadro abre com os defaults locais
  // em vez de ficar preso no skeleton.
  const config = useMemo(() => slaConfig ?? defaultEsteiraSlaConfig(), [slaConfig]);

  const stages = useMemo(() => {
    const slaPorEtapa = new Map(config.map((c) => [c.estagio as string, c.sla_dias]));
    return visibleEsteiraStages(
      config,
      (clientes ?? []).map((c) => c.estagio_esteira || "triagem"),
    ).map((s) => ({ ...s, sla_dias: slaPorEtapa.get(s.value) ?? null }));
  }, [config, clientes]);

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

        {/* Alternador de visão: quadro (Kanban), tabela (Acompanhamento) e Cobrança. */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-35">Visão</span>
          <div role="tablist" aria-label="Formato da esteira" className="flex rounded-full border border-ink-06 bg-white p-1 shadow-soft">
            {TABS.map((t) => {
              const ativo = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  title={t.hint}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-colors",
                    ativo ? "bg-navy text-white font-semibold shadow-sm" : "font-medium text-ink-60 hover:bg-ink-03 hover:text-navy",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : tab === "kanban" ? (
        <EsteiraKanban
          clientes={clientesDoRamo}
          stages={stages}
          focusStage={etapaFoco}
          onClienteClick={(id) => navigate(`/clientes/${id}`)}
        />
      ) : tab === "cobranca" ? (
        <EsteiraCobranca clientes={clientesDoRamo} slaConfig={config} />
      ) : (
        <EsteiraAcompanhamento clientes={clientesDoRamo} slaConfig={config} />
      )}
    </div>
  );
}
