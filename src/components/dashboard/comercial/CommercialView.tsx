import { memo } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { FunnelRow } from "../dashboard-utils";
import { SkeletonKpi } from "../SkeletonKpi";
import { SkeletonChart } from "../SkeletonChart";
import { SkeletonTable } from "../SkeletonTable";
import { KpiStripComercial } from "./KpiStripComercial";
import { AlertasBanner } from "./AlertasBanner";
import { FunilComercial } from "./FunilComercial";
import { SegmentoCard } from "./SegmentoCard";
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
  segmentoData: { segmento: string; label: string; count: number }[];
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

          {/*
            Grade de 3 colunas. Linha 1: o funil (2 colunas) ao lado do mix por
            regime; sao os dois blocos altos e ficam com alturas parecidas.
            Linha 2: tres cards curtos de mesma largura. Itens de grid ja
            esticam para a altura da linha, entao nao ha card solto nem vao.
          */}
          <div className="animate-slide-up delay-3 grid gap-4 w-full grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2 min-w-0">
              <FunilComercial
                funnelData={props.funnelData} maxFunnelCount={props.maxFunnelCount}
                totalFunnelCount={props.totalFunnelCount} totalFunnelPotencial={props.totalFunnelPotencial}
                navigate={props.navigate}
              />
            </div>
            <MixRegime regimeMix={props.regimeMix} />

            <SegmentoCard segmentoData={props.segmentoData} maxSegCount={props.maxSegCount} />
            <QualidadeCarteira scoreDistribution={props.scoreDistribution} />
            <MotorPerformance
              motorDiagnosticos={props.motorDiagnosticos}
              motorTesesAtivas={props.motorTesesAtivas}
              semCobertura={props.regimeMix.filter((r) => r.teses === 0 && r.leads > 0).length}
            />
          </div>
        </>
      )}
    </>
  );
});
