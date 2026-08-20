import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
import { TrendingUp, TrendingDown, PieChart, Layers, RefreshCw, Plus } from "lucide-react";
import {
  breakdownPorTese,
  formatCurrencyBR,
  formatCompetenciaPT,
  isReportoCompensacao,
  splitCreditosCalculo,
  sumCompensadoCanonical,
} from "@/lib/clientes-constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  STATUS_COMPENSACAO_LABELS,
  STATUS_COMPENSACAO_COLORS,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import { TrocaTeseAtivaModal } from "@/components/clientes/TrocaTeseAtivaModal";
import {
  invalidateClienteOperacional,
  useClienteCompensacoes,
  useClienteCreditos,
  useClienteProcessos,
  useClienteRecord,
  useClienteStatusCompensacao,
  useMotorTesesAtivas,
  useTesesTributarias,
} from "@/hooks/data/useClienteOperacional";

interface Props {
  clienteId: string;
  /** Abre a aba Processos e o fluxo de adicionar tese (opcionalmente com código pré-selecionado) */
  onAddTese?: (teseCodigo?: string) => void;
  /** Incrementar para refetch sem remount (evita header duplicado na tela) */
  refreshToken?: number;
}

interface CompRow {
  valor_compensado: number | null;
  valor_nf_servico: number | null;
  mes_referencia: string;
  honorario_valor: number | null;
  tese_origem_id: string | null;
  processo_tese_id?: string | null;
  tributo?: string | null;
  tributo_enum?: string | null;
  processos_teses?: { tese?: string | null; categoria?: string | null; nome_exibicao?: string | null } | null;
}

interface CreditoRow {
  valor_apurado_inicial: number;
  tese_id: string;
  incluir_no_calculo: boolean | null;
}

interface Dados {
  totalApurado: number;
  tesesAtivas: number;
  totalCompensado: number;
  ultimaCompetencia: string | null;
  totalHonorarios: number;
  statusPrincipal: StatusCompensacao | null;
  tem_reporto: boolean;
  tem_tese_ativa: boolean;
  possiveisFuturos: number;
}

const TODAS_AS_TESES = "todas";

const EMPTY: Dados = {
  totalApurado: 0,
  tesesAtivas: 0,
  totalCompensado: 0,
  ultimaCompetencia: null,
  totalHonorarios: 0,
  statusPrincipal: null,
  tem_reporto: false,
  tem_tese_ativa: false,
  possiveisFuturos: 0,
};

export function ClienteHeaderQuadrantes({ clienteId, onAddTese, refreshToken = 0 }: Props) {
  const qc = useQueryClient();
  const creditosQ = useClienteCreditos(clienteId);
  const compsQ = useClienteCompensacoes(clienteId);
  const processosQ = useClienteProcessos(clienteId);
  const tesesQ = useTesesTributarias();
  const motorQ = useMotorTesesAtivas();
  const statusQ = useClienteStatusCompensacao(clienteId);
  const clienteQ = useClienteRecord(clienteId);

  const [mesInicio, setMesInicio] = useState("");
  const [mesFim, setMesFim] = useState("");
  const [trocaOpen, setTrocaOpen] = useState(false);
  const [teseFiltro, setTeseFiltro] = useState<string>(TODAS_AS_TESES);

  useEffect(() => {
    if (!refreshToken) return;
    void invalidateClienteOperacional(qc, clienteId);
    void qc.invalidateQueries({ queryKey: ["cliente", clienteId, "record"] });
  }, [refreshToken, clienteId, qc]);

  const creditos = (creditosQ.data ?? []) as CreditoRow[];
  const compsRaw = (compsQ.data ?? []) as CompRow[];
  const processos = processosQ.data ?? [];
  const teses = tesesQ.data ?? [];
  const opcoesTese = motorQ.data ?? [];
  const view = statusQ.data;
  const teseAtivaId = (clienteQ.data as { tese_ativa_id?: string | null } | undefined)?.tese_ativa_id ?? null;
  const teseAtivaLabel = teses.find((t) => t.id === teseAtivaId)?.label ?? null;

  const reportoTeseIds = useMemo(
    () => new Set(teses.filter((t) => (t.codigo || "").toUpperCase() === "REPORTO").map((t) => t.id)),
    [teses],
  );
  const reportoProcessoIds = useMemo(
    () => new Set(processos.filter((p) => p.tese === "REPORTO").map((p) => p.id)),
    [processos],
  );

  const comps = useMemo(
    () => compsRaw.filter((c) => !isReportoCompensacao(c, { reportoTeseIds, reportoProcessoIds })),
    [compsRaw, reportoTeseIds, reportoProcessoIds],
  );

  const dadosBase = useMemo<Dados>(() => {
    if (!creditosQ.data && !compsQ.data) return EMPTY;
    const split = splitCreditosCalculo(creditos, reportoTeseIds);
    const incluirIds = new Set(
      creditos.filter((c) => c.incluir_no_calculo !== false).map((c) => c.tese_id),
    );
    const teseSet = split.teseIdsNoCalculo;
    const compsNoCalculo = comps.filter(
      (c) => !c.tese_origem_id || teseSet.has(c.tese_origem_id) || incluirIds.size === 0,
    );
    const totalHonorarios = compsNoCalculo.reduce(
      (s, c) => s + Number(c.honorario_valor ?? c.valor_nf_servico ?? 0),
      0,
    );
    const compsPagos = compsNoCalculo.filter((c) => Number(c.valor_compensado || 0) > 0);
    const ultimaCompetencia = compsPagos.length > 0
      ? compsPagos.reduce((a, b) => (a.mes_referencia > b.mes_referencia ? a : b)).mes_referencia
      : view?.ultima_competencia_compensada ?? null;
    return {
      totalApurado: split.creditoApurado,
      tesesAtivas: split.tesesNoCalculo,
      totalCompensado: 0,
      ultimaCompetencia,
      totalHonorarios,
      statusPrincipal: (view?.status_principal ?? null) as StatusCompensacao | null,
      tem_reporto: !!view?.tem_reporto,
      tem_tese_ativa: !!view?.tem_tese_ativa,
      possiveisFuturos: split.possiveisFuturos,
    };
  }, [creditos, creditosQ.data, compsQ.data, comps, reportoTeseIds, view]);

  const processosCount = processos.length;
  const hasCached =
    compsQ.data !== undefined || creditosQ.data !== undefined || processosQ.data !== undefined;
  const loading =
    !hasCached && (compsQ.isPending || creditosQ.isPending || processosQ.isPending);

  const compsNoPeriodo = useMemo(
    () =>
      comps.filter((c) => {
        const mes = (c.mes_referencia || "").slice(0, 7);
        if (mesInicio && mes < mesInicio) return false;
        if (mesFim && mes > mesFim) return false;
        return true;
      }),
    [comps, mesInicio, mesFim],
  );

  const totalCompensadoPeriodo = useMemo(
    // Fonte única = aba Compensações (sem Reporto, sem órfãs duplicadas).
    // Não misturar com v_cliente_totais_calculo: a view usa GREATEST com
    // valor_compensado_manual (snapshot de planilha) e infla o card
    // (AP MEDEIROS, Liberdade, etc.).
    () => sumCompensadoCanonical(compsNoPeriodo, { reportoTeseIds, reportoProcessoIds }),
    [compsNoPeriodo, reportoTeseIds, reportoProcessoIds],
  );

  const processoIdsByTese = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const p of processos as { id: string; tese?: string | null }[]) {
      const cod = String(p.tese || "").toUpperCase();
      if (!cod) continue;
      if (!map.has(cod)) map.set(cod, new Set());
      map.get(cod)!.add(p.id);
    }
    return map;
  }, [processos]);

  const porTese = useMemo(
    () =>
      breakdownPorTese({
        creditos,
        comps: compsNoPeriodo,
        teseInfo: new Map(teses.map((t) => [t.id, { codigo: t.codigo, label: t.label }])),
        processoIdsByTese,
        reportoTeseIds,
        reportoProcessoIds,
      }),
    [creditos, compsNoPeriodo, teses, processoIdsByTese, reportoTeseIds, reportoProcessoIds],
  );

  const multiTese = porTese.length > 1;
  const teseAtual = porTese.find((t) => t.teseId === teseFiltro) ?? null;

  // Filtro por tese existe porque somar Insumos + Subvenção num card só cruza
  // o apurado de uma tese com o compensado de outra.
  const apuradoExibido = teseAtual ? teseAtual.apurado : dadosBase.totalApurado;
  const compensadoExibido = teseAtual ? teseAtual.compensado : totalCompensadoPeriodo;

  // Saldo = apurado ao vivo − compensado da aba. Nunca view.saldo_restante
  // (essa coluna da view subtrai GREATEST com snapshot legado).
  const saldo = apuradoExibido - compensadoExibido;
  const pctUtilizado = apuradoExibido > 0
    ? (compensadoExibido / apuradoExibido) * 100
    : 0;

  const periodoLabel = mesInicio || mesFim
    ? `${mesInicio || "…"} → ${mesFim || "…"}`
    : dadosBase.ultimaCompetencia
      ? `Última: ${formatCompetenciaPT(dadosBase.ultimaCompetencia)}`
      : "Sem compensações";

  if (loading) {
    return (
      <div className="mb-4 space-y-2.5">
        <div className="h-8 w-full max-w-xl animate-pulse rounded-md bg-muted/40" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,1fr)]">
          <div className="card-base h-[6.5rem] animate-pulse bg-muted/40" />
          <div className="card-base h-[6.5rem] animate-pulse bg-muted/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Compensado</span>
          <MonthPicker
            aria-label="Compensado de"
            value={mesInicio}
            onChange={setMesInicio}
            placeholder="mês/ano"
          />
          <span className="text-[11px] text-ink-35">até</span>
          <MonthPicker
            aria-label="Compensado até"
            value={mesFim}
            onChange={setMesFim}
            placeholder="mês/ano"
          />
          {(mesInicio || mesFim) && (
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => { setMesInicio(""); setMesFim(""); }}
            >
              Limpar
            </button>
          )}
        </div>
        {multiTese && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Tese</span>
            <Select value={teseFiltro} onValueChange={setTeseFiltro}>
              <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Filtrar cards por tese">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_AS_TESES}>Todas as teses (consolidado)</SelectItem>
                {porTese.map((t) => (
                  <SelectItem key={t.teseId} value={t.teseId}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-[11px] text-ink-35 sm:ml-auto">
          {teseAtual
            ? `Cards filtrados por ${teseAtual.label}`
            : "Totais usam só teses marcadas no cálculo (padrão: Insumos + Subvenção)"}
        </p>
      </div>

      {multiTese && !teseAtual && (
        <div className="flex flex-wrap items-center gap-1.5">
          {porTese.map((t) => (
            <button
              key={t.teseId}
              type="button"
              onClick={() => setTeseFiltro(t.teseId)}
              className="rounded-full border border-[var(--ink-06)] px-2.5 py-1 text-[10px] text-ink-35 transition-colors hover:border-primary hover:text-foreground"
            >
              <strong className="text-foreground">{t.label}</strong>{" "}
              {formatCurrencyBR(t.apurado)} apurado · {formatCurrencyBR(t.saldo)} saldo
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,1fr)]">
        <div className="card-base grid grid-cols-1 divide-y divide-[var(--ink-06)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <KpiCell
            label="Crédito Apurado"
            icon={<Layers className="h-4 w-4" />}
            valor={formatCurrencyBR(apuradoExibido)}
            cor="var(--navy)"
            rodape={
              teseAtual
                ? teseAtual.label
                : dadosBase.tesesAtivas > 0
                  ? `${dadosBase.tesesAtivas} tese${dadosBase.tesesAtivas > 1 ? "s" : ""} no cálculo`
                  : "Sem créditos no cálculo"
            }
          />
          <KpiCell
            label="Total Compensado"
            icon={<TrendingUp className="h-4 w-4" />}
            valor={formatCurrencyBR(compensadoExibido)}
            cor="var(--dash-green)"
            rodape={periodoLabel}
          />
          <KpiCell
            label="Saldo Restante"
            icon={<PieChart className="h-4 w-4" />}
            valor={formatCurrencyBR(saldo)}
            cor={saldo > 0 ? "var(--navy)" : "var(--ink-35)"}
            rodape={
              apuradoExibido > 0
                ? `${pctUtilizado.toFixed(1)}% do apurado utilizado`
                : "—"
            }
            extra={
              apuradoExibido > 0 && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--ink-06)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pctUtilizado, 100)}%`, background: "var(--dash-green)" }}
                  />
                </div>
              )
            }
          />
        </div>

        <div className="card-base flex h-full flex-col gap-2.5 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-ink-35" />
              <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Status</p>
            </div>
            {processosCount > 0 && (
              dadosBase.statusPrincipal && dadosBase.statusPrincipal !== "reporto" ? (
                <Badge
                  variant="outline"
                  className={`${STATUS_COMPENSACAO_COLORS[dadosBase.statusPrincipal]} text-[10px]`}
                >
                  {STATUS_COMPENSACAO_LABELS[dadosBase.statusPrincipal]}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Em configuração
                </Badge>
              )
            )}
          </div>

          {processosCount === 0 ? (
            <>
              <Badge
                variant="outline"
                className={`${STATUS_COMPENSACAO_COLORS.sem_operacao} w-fit text-[10px]`}
              >
                Sem operação
              </Badge>
              <p className="text-[12px] font-medium leading-snug text-foreground">
                Nenhuma tese cadastrada
              </p>
              {opcoesTese.length > 0 ? (
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {opcoesTese.slice(0, 4).map((t) => (
                    <Button
                      key={t.tese}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onAddTese?.(t.tese)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {t.nome_exibicao}
                    </Button>
                  ))}
                  {opcoesTese.length > 4 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => onAddTese?.()}
                    >
                      Ver todas
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="mt-auto h-8 text-[11px]"
                  onClick={() => onAddTese?.()}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adicionar tese
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {dadosBase.tem_tese_ativa && (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[9px] text-blue-800">
                    Compensação
                  </Badge>
                )}
                {(dadosBase.tem_reporto || dadosBase.possiveisFuturos > 0) && (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[9px] text-slate-700">
                    Possíveis futuros
                  </Badge>
                )}
              </div>
              {(dadosBase.possiveisFuturos > 0 || dadosBase.totalHonorarios > 0) && (
                <div className="space-y-0.5 text-[10px] text-muted-foreground">
                  {dadosBase.possiveisFuturos > 0 && (
                    <p>
                      Fora do cálculo:{" "}
                      <strong className="text-foreground">{formatCurrencyBR(dadosBase.possiveisFuturos)}</strong>
                    </p>
                  )}
                  {dadosBase.totalHonorarios > 0 && (
                    <p>
                      Honorários:{" "}
                      <strong className="text-foreground">{formatCurrencyBR(dadosBase.totalHonorarios)}</strong>
                    </p>
                  )}
                </div>
              )}
              <div className="mt-auto border-t border-[var(--ink-06)] pt-2">
                <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
                  Tese em uso:{" "}
                  <strong className="text-foreground">{teseAtivaLabel || "não definida"}</strong>
                </p>
                {teseAtivaId || dadosBase.tesesAtivas > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-[11px]"
                    onClick={() => setTrocaOpen(true)}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    {teseAtivaId ? "Trocar tese em uso" : "Definir tese em uso"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-[11px]"
                    onClick={() => onAddTese?.()}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Adicionar tese ao cálculo
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <TrocaTeseAtivaModal
        open={trocaOpen}
        onOpenChange={setTrocaOpen}
        clienteId={clienteId}
        teseAtivaId={teseAtivaId}
        onChanged={() => {
          void invalidateClienteOperacional(qc, clienteId);
          void qc.invalidateQueries({ queryKey: ["cliente", clienteId, "record"] });
        }}
      />
    </div>
  );
}

function KpiCell({
  label,
  icon,
  valor,
  cor,
  rodape,
  extra,
}: {
  label: string;
  icon: React.ReactNode;
  valor: string;
  cor: string;
  rodape?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center px-5 py-5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-ink-35">{icon}</span>
        <p className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-35">{label}</p>
      </div>
      <p className="font-display text-[26px] font-bold leading-none tracking-tight" style={{ color: cor }}>
        {valor}
      </p>
      {rodape && <p className="mt-2 text-xs text-ink-35">{rodape}</p>}
      {extra}
    </div>
  );
}
