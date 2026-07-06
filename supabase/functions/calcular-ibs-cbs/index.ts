// supabase/functions/calcular-ibs-cbs/index.ts
//
// Puxa focus_indices + reforma_config, roda motor completo (DRE + IBS/CBS),
// devolve os 2 cenários lado a lado.
//
// POST body:
//   { faturamento_mensal: number, segmento?: string }
// Response 200:
//   { dre_atual: DreOutput, dre_reforma: DreOutput, ibs_cbs: IbsCbsOutput }
//
// Nota: dre_atual == dre_reforma no motor V1 (a única diferença é o cálculo
// de impostos, que fica isolado em ibs_cbs). Frontend combina os dois pra
// UI de comparativo.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  calcularDRE,
  calcularIbsCbs,
  configFromRows,
  type FocusIndice,
} from "../_shared/calc-motor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const faturamentoMensal = Number(body.faturamento_mensal);
    const segmento = body.segmento ?? "supermercado";

    if (!Number.isFinite(faturamentoMensal) || faturamentoMensal <= 0) {
      return new Response(
        JSON.stringify({ error: "faturamento_mensal inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [cfgRes, idxRes] = await Promise.all([
      sb.from("reforma_config").select("chave, valor"),
      sb
        .from("focus_indices")
        .select("segmento, grupo, rubrica, percentual_sobre_faturamento, gera_credito_ibs_cbs, entra_na_exclusao_credito, ordem_exibicao")
        .eq("segmento", segmento)
        .eq("ativo", true),
    ]);

    if (cfgRes.error || idxRes.error) {
      const msg = cfgRes.error?.message ?? idxRes.error?.message ?? "unknown";
      return new Response(
        JSON.stringify({ error: `Erro carregando motor: ${msg}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const config = configFromRows((cfgRes.data as any[]) ?? []);
    const indices = ((idxRes.data as any[]) ?? []).map((r) => ({
      ...r,
      percentual_sobre_faturamento: Number(r.percentual_sobre_faturamento),
    })) as FocusIndice[];

    const dre = calcularDRE(faturamentoMensal, indices, config.cmv_pct_default);
    const ibs_cbs = calcularIbsCbs(faturamentoMensal, dre, indices, config);

    return new Response(
      JSON.stringify({
        dre_atual: dre,
        dre_reforma: dre,
        ibs_cbs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("calcular-ibs-cbs error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
