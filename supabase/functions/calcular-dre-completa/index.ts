// supabase/functions/calcular-dre-completa/index.ts
//
// Puxa focus_indices do banco, roda o motor puro em _shared/calc-motor,
// devolve DRE estruturada por grupo. Sem auth (verify_jwt = false).
//
// POST body:
//   { faturamento_mensal: number, segmento?: string }
// Response 200:
//   { dre: DreOutput }

import { createClient } from "npm:@supabase/supabase-js@2";
import { calcularDRE, type FocusIndice, CONFIG_DEFAULT } from "../_shared/calc-motor.ts";

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

    // Puxa cmv_pct do config (fallback pro default se a chave não existir)
    const { data: cfgRows } = await sb
      .from("reforma_config")
      .select("chave, valor")
      .in("chave", ["cmv_pct_default"]);
    const cmvRow = (cfgRows as any[] | null)?.find((r) => r.chave === "cmv_pct_default");
    const cmvPct = cmvRow ? Number(cmvRow.valor) : CONFIG_DEFAULT.cmv_pct_default;

    // Puxa índices ativos do segmento
    const { data: idxRows, error } = await sb
      .from("focus_indices")
      .select("segmento, grupo, rubrica, percentual_sobre_faturamento, gera_credito_ibs_cbs, entra_na_exclusao_credito, ordem_exibicao")
      .eq("segmento", segmento)
      .eq("ativo", true);

    if (error) {
      return new Response(
        JSON.stringify({ error: `Erro ao ler focus_indices: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const indices = (idxRows as any[] as FocusIndice[]).map((r) => ({
      ...r,
      percentual_sobre_faturamento: Number(r.percentual_sobre_faturamento),
    }));

    const dre = calcularDRE(faturamentoMensal, indices, cmvPct);

    return new Response(JSON.stringify({ dre }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calcular-dre-completa error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
