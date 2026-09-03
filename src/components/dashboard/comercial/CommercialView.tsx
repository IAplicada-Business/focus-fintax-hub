import { memo } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { FunnelRow } from "../dashboard-utils";
import { SkeletonKpi } from "../SkeletonKpi";
import { SkeletonChart } from "../SkeletonChart";
import { SkeletonTable } from "../SkeletonTable";
import { KpiStripComercial } from "./KpiStripComercial";
import { AlertasBanner } from "./AlertasBanner";
import { FunilComercial } from "./FunilComercial";
import { QualidadeCarteira } from "./QualidadeCarteira";
import { MotorPerformance } from "./MotorPerformance";
import { MixRegime } from "./MixRegime";
import type { RegimeMixRow } from "@/lib/regime-mix";

interface Props {
  kpiLoading: boolean;
  chartLoading: boolean;
  comLeads: number;
  comNewWeek: number;
  trendDiff: number;
  comPotencial: number;
  comContratos: number;
  comTaxaConversao: number;
  stalledLeads: { empresa: string; days: number; id: string }[];
  funnelData: FunnelRow[];
  maxFunnelCount: number;
  totalFunnelCount: number;
  totalFunnelPotencial: number;
  segmentoData: { segmento: string; count: number }[];
  maxSegCount: number;
  scoreDistribution: Record<string, number>;
  motorDiagnosticos: number;
  motorTesesAtivas: number;
  regimeMix: RegimeMixRow[];
  navigate: NavigateFunction;
}

export const CommercialView = memo(function CommercialView(props: Props) {
  return (
    <>
      {props.kpiLoading ? <SkeletonKpi /> : (
        <KpiStripComercial
          comLeads={props.comLeads} comNewWeek={props.comNewWeek} trendDiff={props.trendDiff}
          comPotencial={props.comPotencial} comContratos={props.comContratos} comTaxaConversao={props.comTaxaConversao}
        />
      )}

      {props.chartLoading ? (
        <>
          <SkeletonChart />
          <div className="mt-3.5"><SkeletonTable /></div>
        </>
      ) : (
        <>
          <AlertasBanner stalledLeads={props.stalledLeads} />

          {/* Duas colunas de altura igual: o último card de cada coluna estica (flex-1)
              para que as bordas inferiores fiquem alinhadas, sem buraco em nenhum lado. */}
          <div className="animate-slide-up delay-3 grid gap-4 w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
            <FunilComercial
              funnelData={props.funnelData} maxFunnelCount={props.maxFunnelCount}
              totalFunnelCount={props.totalFunnelCount} totalFunnelPotencial={props.totalFunnelPotencial}
              segmentoData={props.segmentoData} maxSegCount={props.maxSegCount}
              navigate={props.navigate}
            />
            <div className="flex flex-col gap-4 min-w-0">
              <QualidadeCarteira scoreDistribution={props.scoreDistribution} />
              <MotorPerformance motorDiagnosticos={props.motorDiagnosticos} motorTesesAtivas={props.motorTesesAtivas} />
              <MixRegime regimeMix={props.regimeMix} className="flex-1" />
            </div>
          </div>
        </>
      )}
    </>
  );
});
