import { useMetaOverview } from "@/hooks/data/useMetaInsights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonKpi } from "@/components/dashboard/SkeletonKpi";
import { SkeletonChart } from "@/components/dashboard/SkeletonChart";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtInt   = (n: number) => n.toLocaleString("pt-BR");
const fmtPct   = (n: number | null) => (n == null ? "—" : `${(n).toFixed(2)}%`);

export default function MarketingOverview() {
  const { data, isLoading, error } = useMetaOverview(30);

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-destructive font-medium">Erro ao carregar dados do Meta Ads</p>
        <p className="text-sm text-muted-foreground mt-1">{String(error)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Métricas dos últimos 30 dias · agregadas de meta_insights_daily.</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {isLoading || !data ? (
          [...Array(5)].map((_, i) => <SkeletonKpi key={i} />)
        ) : (
          <>
            <KpiCard label="Gasto 30d"      value={fmtMoney(data.kpis.spend)} />
            <KpiCard label="Leads 30d"      value={fmtInt(data.kpis.leads)} />
            <KpiCard label="CPL médio"      value={data.kpis.cpl == null ? "—" : fmtMoney(data.kpis.cpl)} />
            <KpiCard label="CTR médio"      value={fmtPct(data.kpis.ctr)} />
            <KpiCard label="Link clicks"    value={fmtInt(data.kpis.link_clicks)} />
          </>
        )}
      </div>

      {/* Série diária */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto e leads · diário (30d)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <SkeletonChart />
          ) : data.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Sem dados de insights no período.</p>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,21,100,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "rgba(15,17,23,0.6)" }} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: "rgba(15,17,23,0.6)" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "rgba(15,17,23,0.6)" }} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "spend" ? fmtMoney(Number(v)) : fmtInt(Number(v))
                    }
                  />
                  <Line yAxisId="left"  type="monotone" dataKey="spend" stroke="#c8001e" strokeWidth={2} dot={false} name="Gasto" />
                  <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#0a1564" strokeWidth={2} dot={false} name="Leads" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top campanhas & top ads */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 3 campanhas por gasto</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <SkeletonKpi />
            ) : data.topCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.topCampaigns.map((c) => (
                  <li key={c.campaign_id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.campaign_name}</p>
                      <p className="text-xs text-muted-foreground">{fmtInt(c.leads)} leads</p>
                    </div>
                    <p className="text-sm font-bold text-foreground tabular-nums">{fmtMoney(c.spend)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 3 anúncios por leads</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <SkeletonKpi />
            ) : data.topAds.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.topAds.map((a) => (
                  <li key={a.ad_id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.ad_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.campaign_name ?? "—"}</p>
                    </div>
                    <p className="text-sm font-bold text-foreground tabular-nums">{fmtInt(a.leads)} leads</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-base p-4">
      <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-ink-35 mb-2">{label}</p>
      <p className="font-display text-[26px] font-bold leading-none text-navy">{value}</p>
    </div>
  );
}
