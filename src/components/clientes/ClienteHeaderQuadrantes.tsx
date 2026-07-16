import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, PieChart, Layers, RefreshCw } from "lucide-react";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import {
  STATUS_COMPENSACAO_LABELS,
  STATUS_COMPENSACAO_COLORS,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import { TrocaTeseAtivaModal } from "@/components/clientes/TrocaTeseAtivaModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  clienteId: string;
}

interface CompRow {
  valor_compensado: number | null;
  valor_nf_servico: number | null;
  mes_referencia: string;
  honorario_valor: number | null;
  tese_origem_id: string | null;
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

export function ClienteHeaderQuadrantes({ clienteId }: Props) {
  const [dadosBase, setDadosBase] = useState<Dados>(EMPTY);
  const [comps, setComps] = useState<CompRow[]>([]);
  const [teseIncluir, setTeseIncluir] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mesInicio, setMesInicio] = useState("");
  const [mesFim, setMesFim] = useState("");
  const [teseAtivaId, setTeseAtivaId] = useState<string | null>(null);
  const [teseAtivaLabel, setTeseAtivaLabel] = useState<string | null>(null);
  const [trocaOpen, setTrocaOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchDados = async () => {
      setLoading(true);
      const [
        { data: creditos },
        { data: compsData },
        { data: view },
        { data: totaisView },
        { data: cli },
      ] = await Promise.all([
        (supabase as any)
          .from("creditos_apurados")
          .select("valor_apurado_inicial, tese_id, incluir_no_calculo")
          .eq("cliente_id", clienteId),
        supabase
          .from("compensacoes_mensais")
          .select("valor_compensado, valor_nf_servico, mes_referencia, honorario_valor, tese_origem_id")
          .eq("cliente_id", clienteId),
        (supabase as any)
          .from("v_clientes_status_compensacao")
          .select("status_principal, tem_reporto, tem_tese_ativa, ultima_competencia_compensada")
          .eq("cliente_id", clienteId)
          .maybeSingle(),
        (supabase as any)
          .from("v_cliente_totais_calculo")
          .select("credito_apurado, total_compensado, saldo_restante, possiveis_creditos_futuros, teses_no_calculo")
          .eq("cliente_id", clienteId)
          .maybeSingle(),
        supabase.from("clientes").select("tese_ativa_id").eq("id", clienteId).maybeSingle(),
      ]);

      const ativaId = (cli as any)?.tese_ativa_id ?? null;
      setTeseAtivaId(ativaId);
      if (ativaId) {
        const { data: t } = await (supabase as any)
          .from("teses_tributarias")
          .select("label")
          .eq("id", ativaId)
          .maybeSingle();
        if (!cancelled) setTeseAtivaLabel(t?.label ?? null);
      } else if (!cancelled) {
        setTeseAtivaLabel(null);
      }

      if (cancelled) return;

      const creditosRows = ((creditos as CreditoRow[]) || []);
      const incluirIds = new Set(
        creditosRows.filter((c) => c.incluir_no_calculo !== false).map((c) => c.tese_id)
      );
      // Se a coluna ainda não existe / veio null em tudo, fallback: todos
      const hasFlag = creditosRows.some((c) => c.incluir_no_calculo === true || c.incluir_no_calculo === false);
      const teseSet = hasFlag
        ? new Set(creditosRows.filter((c) => c.incluir_no_calculo).map((c) => c.tese_id))
        : new Set(creditosRows.map((c) => c.tese_id));

      const fromView = totaisView as {
        credito_apurado?: number;
        possiveis_creditos_futuros?: number;
        teses_no_calculo?: number;
      } | null;

      const totalApurado = fromView?.credito_apurado != null
        ? Number(fromView.credito_apurado)
        : creditosRows
            .filter((c) => !hasFlag || c.incluir_no_calculo)
            .reduce((s, c) => s + Number(c.valor_apurado_inicial || 0), 0);

      const possiveisFuturos = fromView?.possiveis_creditos_futuros != null
        ? Number(fromView.possiveis_creditos_futuros)
        : creditosRows
            .filter((c) => hasFlag && !c.incluir_no_calculo)
            .reduce((s, c) => s + Number(c.valor_apurado_inicial || 0), 0);

      const compsRows = ((compsData as CompRow[]) || []);
      const compsNoCalculo = compsRows.filter(
        (c) => !c.tese_origem_id || teseSet.has(c.tese_origem_id) || incluirIds.size === 0
      );

      const totalHonorarios = compsNoCalculo.reduce(
        (s, c) => s + Number(c.honorario_valor ?? c.valor_nf_servico ?? 0),
        0
      );
      const compsPagos = compsNoCalculo.filter((c) => Number(c.valor_compensado || 0) > 0);
      const ultimaCompetencia = compsPagos.length > 0
        ? compsPagos.reduce((a, b) => (a.mes_referencia > b.mes_referencia ? a : b)).mes_referencia
        : (view as any)?.ultima_competencia_compensada ?? null;

      setTeseIncluir(teseSet);
      setComps(compsRows);
      setDadosBase({
        totalApurado,
        tesesAtivas: fromView?.teses_no_calculo ?? teseSet.size,
        totalCompensado: 0, // recalculado com filtro de período
        ultimaCompetencia,
        totalHonorarios,
        statusPrincipal: ((view as any)?.status_principal ?? null) as StatusCompensacao | null,
        tem_reporto: !!(view as any)?.tem_reporto,
        tem_tese_ativa: !!(view as any)?.tem_tese_ativa,
        possiveisFuturos,
      });
      setLoading(false);
    };
    fetchDados();
    return () => { cancelled = true; };
  }, [clienteId, reloadKey]);

  const totalCompensadoPeriodo = useMemo(() => {
    return comps
      .filter((c) => {
        if (c.tese_origem_id && teseIncluir.size > 0 && !teseIncluir.has(c.tese_origem_id)) {
          return false;
        }
        const mes = (c.mes_referencia || "").slice(0, 7);
        if (mesInicio && mes < mesInicio) return false;
        if (mesFim && mes > mesFim) return false;
        return true;
      })
      .reduce((s, c) => s + Number(c.valor_compensado || 0), 0);
  }, [comps, teseIncluir, mesInicio, mesFim]);

  const saldo = dadosBase.totalApurado - totalCompensadoPeriodo;
  const pctUtilizado = dadosBase.totalApurado > 0
    ? (totalCompensadoPeriodo / dadosBase.totalApurado) * 100
    : 0;

  const periodoLabel = mesInicio || mesFim
    ? `${mesInicio || "…"} → ${mesFim || "…"}`
    : dadosBase.ultimaCompetencia
      ? `Última: ${format(new Date(dadosBase.ultimaCompetencia), "MMM/yyyy", { locale: ptBR })}`
      : "Sem compensações";

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-base h-24 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Filtro de período — total compensado flexível (Review Fox 08/jul) */}
      <div className="flex flex-wrap items-end gap-3 card-base px-4 py-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.8px] text-ink-35">Compensado de</Label>
          <Input
            type="month"
            className="h-8 w-40 text-xs"
            value={mesInicio}
            onChange={(e) => setMesInicio(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.8px] text-ink-35">até</Label>
          <Input
            type="month"
            className="h-8 w-40 text-xs"
            value={mesFim}
            onChange={(e) => setMesFim(e.target.value)}
          />
        </div>
        {(mesInicio || mesFim) && (
          <button
            type="button"
            className="text-xs text-primary underline pb-1.5"
            onClick={() => { setMesInicio(""); setMesFim(""); }}
          >
            Limpar período
          </button>
        )}
        <p className="text-[11px] text-ink-35 pb-1.5 ml-auto">
          Totais usam só teses marcadas no cálculo (padrão: Insumos + Subvenção)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Quadrante
          label="Crédito Apurado"
          icon={<Layers className="w-3.5 h-3.5" />}
          valor={formatCurrencyBR(dadosBase.totalApurado)}
          cor="var(--navy)"
          rodape={
            dadosBase.tesesAtivas > 0
              ? `${dadosBase.tesesAtivas} tese${dadosBase.tesesAtivas > 1 ? "s" : ""} no cálculo`
              : "Sem créditos no cálculo"
          }
        />

        <Quadrante
          label="Total Compensado"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          valor={formatCurrencyBR(totalCompensadoPeriodo)}
          cor="var(--dash-green)"
          rodape={periodoLabel}
        />

        <Quadrante
          label="Saldo Restante"
          icon={<PieChart className="w-3.5 h-3.5" />}
          valor={formatCurrencyBR(saldo)}
          cor={saldo > 0 ? "var(--navy)" : "var(--ink-35)"}
          rodape={
            dadosBase.totalApurado > 0
              ? `${pctUtilizado.toFixed(1)}% do apurado utilizado`
              : "—"
          }
          extra={
            dadosBase.totalApurado > 0 && (
              <div className="mt-2 h-1 rounded-full bg-[var(--ink-06)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(pctUtilizado, 100)}%`, background: "var(--dash-green)" }}
                />
              </div>
            )
          }
        />

        <div className="card-base px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-ink-35" />
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Status</p>
          </div>
          {dadosBase.statusPrincipal && dadosBase.statusPrincipal !== "reporto" ? (
            <Badge
              variant="outline"
              className={`${STATUS_COMPENSACAO_COLORS[dadosBase.statusPrincipal]} text-xs mb-2`}
            >
              {STATUS_COMPENSACAO_LABELS[dadosBase.statusPrincipal]}
            </Badge>
          ) : (
            <p className="text-xs text-muted-foreground mb-2">—</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {dadosBase.tem_tese_ativa && (
              <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 text-[9px]">
                Compensação
              </Badge>
            )}
            {(dadosBase.tem_reporto || dadosBase.possiveisFuturos > 0) && (
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[9px]">
                Possíveis futuros
              </Badge>
            )}
          </div>
          {dadosBase.possiveisFuturos > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Fora do cálculo: <strong className="text-foreground">{formatCurrencyBR(dadosBase.possiveisFuturos)}</strong>
            </p>
          )}
          {dadosBase.totalHonorarios > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Honorários acumulados: <strong className="text-foreground">{formatCurrencyBR(dadosBase.totalHonorarios)}</strong>
            </p>
          )}
          <div className="mt-3 pt-2 border-t border-[var(--ink-06)]">
            <p className="text-[10px] text-muted-foreground mb-1">
              Tese em uso:{" "}
              <strong className="text-foreground">{teseAtivaLabel || "não definida"}</strong>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px] w-full"
              onClick={() => setTrocaOpen(true)}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Trocar tese em uso
            </Button>
          </div>
        </div>
      </div>

      <TrocaTeseAtivaModal
        open={trocaOpen}
        onOpenChange={setTrocaOpen}
        clienteId={clienteId}
        teseAtivaId={teseAtivaId}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

function Quadrante({
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
    <div className="card-base px-4 py-3.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-ink-35">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">{label}</p>
      </div>
      <p className="font-display text-[22px] font-bold leading-none" style={{ color: cor }}>
        {valor}
      </p>
      {rodape && <p className="text-[11px] text-ink-35 mt-1.5">{rodape}</p>}
      {extra}
    </div>
  );
}
