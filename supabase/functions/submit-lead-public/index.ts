import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// LP form labels → DB enum
const SEGMENTO_MAP: Record<string, string> = {
  "Supermercado": "supermercado",
  "Farmácia": "farmacia",
  "PET Shop": "pet",
  "Material de Construção": "materiais_construcao",
};

const FATURAMENTO_MAP: Record<string, string> = {
  "Até R$ 500 mil": "ate_500k",
  "R$ 500 mil – R$ 1M": "500k_2m",
  "R$ 500 mil – R$ 2M": "500k_2m",
  "R$ 1M – R$ 5M": "2m_5m",
  "R$ 2M – R$ 5M": "2m_5m",
  "R$ 5M – R$ 15M": "5m_15m",
  "R$ 5M – R$ 20M": "5m_15m",
  "Acima de R$ 15M": "acima_15m",
  "Acima de R$ 20M": "acima_15m",
};

const REGIME_MAP: Record<string, string> = {
  "Simples Nacional": "simples",
  "Lucro Presumido": "lucro_presumido",
  "Lucro Real": "lucro_real",
};

const FATURAMENTO_MIDPOINTS: Record<string, number> = {
  "ate_500k": 250_000,
  "500k_2m": 1_250_000,
  "2m_5m": 3_500_000,
  "5m_15m": 10_000_000,
  "acima_15m": 20_000_000,
};

// Valid DB enum values (case-insensitive match — Meta Ads pode mandar valores já enum)
const VALID_SEGMENTOS = new Set(["supermercado", "farmacia", "pet", "materiais_construcao", "outros"]);
const VALID_REGIMES_KEY = new Set(["simples", "lucro_presumido", "lucro_real"]);

function deriveFaixaFromNumber(n: number): string {
  if (n <= 500_000) return "ate_500k";
  if (n <= 2_000_000) return "500k_2m";
  if (n <= 5_000_000) return "2m_5m";
  if (n <= 15_000_000) return "5m_15m";
  return "acima_15m";
}

function normalizeSegmento(s: string | undefined): string {
  if (!s) return "outros";
  const low = String(s).toLowerCase().trim().replace(/\s+/g, "_");
  if (VALID_SEGMENTOS.has(low)) return low;
  return SEGMENTO_MAP[s] || "outros";
}

function normalizeRegime(r: string | undefined): { key: string; label: string } {
  if (!r) return { key: "simples", label: "Simples Nacional" };
  const low = String(r).toLowerCase().trim().replace(/\s+/g, "_");
  if (VALID_REGIMES_KEY.has(low)) {
    const label = low === "simples" ? "Simples Nacional" : low === "lucro_real" ? "Lucro Real" : "Lucro Presumido";
    return { key: low, label };
  }
  const key = REGIME_MAP[r] || "simples";
  return { key, label: r };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Aceita ambos os formatos: LP (formulario_lp) e Meta Ads (meta_ads)
    const origem: string = body.origem || "formulario_lp";

    const nome: string | undefined = body.nome;
    const empresa: string = body.empresa || body.razao_social || "";
    const cnpj: string | undefined = body.cnpj;
    const whatsapp: string = body.whatsapp || body.telefone || "";
    const email: string = body.email || "";
    const segmento: string | undefined = body.segmento;
    const regimeRaw: string | undefined = body.regime;
    const faturamentoLabel: string | undefined = body.faturamento;                  // LP (label)
    const faturamentoEstimado: number | undefined = body.faturamento_mensal_estimado; // Meta (numeric)

    // Meta-only tracking (não bloqueia, só passa adiante p/ logs)
    const metaLeadId: string | undefined = body.meta_lead_id;
    const metaFormId: string | undefined = body.meta_form_id;
    const metaCampaignId: string | undefined = body.meta_campaign_id;
    const metaAdId: string | undefined = body.meta_ad_id;

    const hasFaturamento = !!faturamentoLabel || (typeof faturamentoEstimado === "number" && faturamentoEstimado > 0);
    if (!nome || !segmento || !hasFaturamento) {
      return new Response(
        JSON.stringify({ error: "nome, segmento e faturamento (label ou estimado) são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const segmentoDb = normalizeSegmento(segmento);
    const { key: regimeKey, label: regimeDb } = normalizeRegime(regimeRaw);

    const faturamentoDb = faturamentoLabel
      ? (FATURAMENTO_MAP[faturamentoLabel] || "ate_500k")
      : deriveFaixaFromNumber(faturamentoEstimado!);

    // Block Simples Nacional — no eligible teses
    if (regimeKey === "simples") {
      return new Response(
        JSON.stringify({
          blocked: true,
          reason: "simples",
          message: "O regime Simples Nacional não se enquadra nas teses tributárias atuais. Entre em contato para uma análise personalizada.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .insert({
        nome: (nome || "").slice(0, 255),
        empresa: (empresa || "").slice(0, 255),
        cnpj: (cnpj || "").replace(/\D/g, "").slice(0, 14),
        whatsapp: (whatsapp || "").replace(/\D/g, "").slice(0, 11),
        email: (email || "").slice(0, 255),
        segmento: segmentoDb,
        regime_tributario: regimeDb,
        faturamento_faixa: faturamentoDb,
        origem,
        status: "novo",
      })
      .select("id, token")
      .single();

    if (leadErr || !lead) {
      console.error("Lead insert error:", leadErr, { origem, metaLeadId });
      return new Response(
        JSON.stringify({ error: "Falha ao salvar lead" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcula o diagnóstico via RPC (mantém pipeline existente)
    const faturamentoMensal = typeof faturamentoEstimado === "number" && faturamentoEstimado > 0
      ? faturamentoEstimado
      : (FATURAMENTO_MIDPOINTS[faturamentoDb] || 1_000_000);

    const { error: rpcErr } = await supabase.rpc("calcular_diagnostico", {
      _lead_id: lead.id,
      _faturamento_mensal: faturamentoMensal,
      _regime: regimeKey,
      _segmento: segmentoDb,
    });

    if (rpcErr) {
      console.error("calcular_diagnostico RPC error:", rpcErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,                       // ← novo: necessário p/ meta-webhook
        token: lead.token,
        origem,
        meta_lead_id: metaLeadId ?? null,        // echo p/ debug
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("submit-lead-public error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
