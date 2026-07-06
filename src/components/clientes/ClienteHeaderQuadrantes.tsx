import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, PieChart, Layers } from "lucide-react";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import {
  STATUS_COMPENSACAO_LABELS,
  STATUS_COMPENSACAO_COLORS,
  type StatusCompensacao,
} from "@/components/StatusCompensacaoFilter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  clienteId: string;
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
};

export function ClienteHeaderQuadrantes({ clienteId }: Props) {
  const [dados, setDados] = useState<Dados>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchDados = async () => {
      setLoading(true);
      const [
        { data: creditos },
        { data: comps },
        { data: view },
      ] = await Promise.all([
        (supabase as any).from("creditos_apurados").select("valor_apurado_inicial, tese_id").eq("cliente_id", clienteId),
        supabase
          .from("compensacoes_mensais")
          .select("valor_compensado, valor_nf_servico, mes_referencia, honorario_valor")
          .eq("cliente_id", clienteId),
        (supabase as any)
          .from("v_clientes_status_compensacao")
          .select("status_principal, tem_reporto, tem_tese_ativa, ultima_competencia_compensada")
          .eq("cliente_id", clienteId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const totalApurado = ((creditos as any[]) || []).reduce(
        (s, c) => s + Number(c.valor_apurado_inicial || 0),
        0
      );
      const tesesAtivas = new Set(((creditos as any[]) || []).map((c) => c.tese_id)).size;

      const totalCompensado = ((comps as any[]) || []).reduce(
        (s, c) => s + Number(c.valor_compensado || 0),
        0
      );
      // Honorário: prefere honorario_valor novo, cai pra valor_nf_servico legado
      const totalHonorarios = ((comps as any[]) || []).reduce(
        (s, c) => s + Number(c.honorario_valor ?? c.valor_nf_servico ?? 0),
        0
      );
      // Última competência com valor > 0
      const compsPagos = ((comps as any[]) || []).filter((c) => Number(c.valor_compensado || 0) > 0);
      const ultimaCompetencia = compsPagos.length > 0
        ? compsPagos.reduce((a, b) => (a.mes_referencia > b.mes_referencia ? a : b)).mes_referencia
        : (view as any)?.ultima_competencia_compensada ?? null;

      setDados({
        totalApurado,
        tesesAtivas,
        totalCompensado,
        ultimaCompetencia,
        totalHonorarios,
        statusPrincipal: ((view as any)?.status_principal ?? null) as StatusCompensacao | null,
        tem_reporto: !!(view as any)?.tem_reporto,
        tem_tese_ativa: !!(view as any)?.tem_tese_ativa,
      });
      setLoading(false);
    };
    fetchDados();
    return () => { cancelled = true; };
  }, [clienteId]);

  const saldo = dados.totalApurado - dados.totalCompensado;
  const pctUtilizado = dados.totalApurado > 0 ? (dados.totalCompensado / dados.totalApurado) * 100 : 0;

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {/* Q1 — Crédito Apurado */}
      <Quadrante
        label="Crédito Apurado"
        icon={<Layers className="w-3.5 h-3.5" />}
        valor={formatCurrencyBR(dados.totalApurado)}
        cor="var(--navy)"
        rodape={
          dados.tesesAtivas > 0
            ? `${dados.tesesAtivas} tese${dados.tesesAtivas > 1 ? "s" : ""} com crédito`
            : "Sem créditos apurados"
        }
      />

      {/* Q2 — Total Compensado */}
      <Quadrante
        label="Total Compensado"
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        valor={formatCurrencyBR(dados.totalCompensado)}
        cor="var(--dash-green)"
        rodape={
          dados.ultimaCompetencia
            ? `Última: ${format(new Date(dados.ultimaCompetencia), "MMM/yyyy", { locale: ptBR })}`
            : "Sem compensações"
        }
      />

      {/* Q3 — Saldo */}
      <Quadrante
        label="Saldo Restante"
        icon={<PieChart className="w-3.5 h-3.5" />}
        valor={formatCurrencyBR(saldo)}
        cor={saldo > 0 ? "var(--navy)" : "var(--ink-35)"}
        rodape={
          dados.totalApurado > 0
            ? `${pctUtilizado.toFixed(1)}% do apurado utilizado`
            : "—"
        }
        extra={
          dados.totalApurado > 0 && (
            <div className="mt-2 h-1 rounded-full bg-[var(--ink-06)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(pctUtilizado, 100)}%`, background: "var(--dash-green)" }}
              />
            </div>
          )
        }
      />

      {/* Q4 — Status + trilhas */}
      <div className="card-base px-4 py-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-ink-35" />
          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-35">Status</p>
        </div>
        {dados.statusPrincipal ? (
          <Badge
            variant="outline"
            className={`${STATUS_COMPENSACAO_COLORS[dados.statusPrincipal]} text-xs mb-2`}
          >
            {STATUS_COMPENSACAO_LABELS[dados.statusPrincipal]}
          </Badge>
        ) : (
          <p className="text-xs text-muted-foreground">—</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {dados.tem_tese_ativa && (
            <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 text-[9px]">
              Compensação
            </Badge>
          )}
          {dados.tem_reporto && (
            <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-[9px]">
              Reporto
            </Badge>
          )}
        </div>
        {dados.totalHonorarios > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Honorários acumulados: <strong className="text-foreground">{formatCurrencyBR(dados.totalHonorarios)}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-componente card
// -----------------------------------------------------------------------------

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
