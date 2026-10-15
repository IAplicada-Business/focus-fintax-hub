// supabase/functions/analyze-lead/index.ts
//
// "Gerar / Regerar diagnóstico" de um lead (cadastro manual, importação em
// lote, painel do lead). Antes recalculava as teses em TypeScript e pedia a
// uma IA um texto em formato de e-mail, gravando uma linha nova em
// relatorios_leads a cada execução — um segundo diagnóstico, diferente do da
// landing page. Agora delega à RPC gerar_diagnostico_lead, que usa o MESMO
// motor da LP (calcular_diagnostico) e salva no lead: o resultado aparece no
// layout oficial /diagnostico/:token.
//
// A RPC roda com o JWT de quem chamou (não com a service role): ela confere
// o papel (admin/pmo/comercial/sdr/gestor_comercial), e como esta função tem
// verify_jwt = false, é essa checagem que impede uso anônimo.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Erros de negócio da RPC → mensagem para a tela (toast).
const MENSAGENS_ERRO: Record<string, string> = {
  dados_insuficientes: "Preencha faturamento e regime tributário do lead para gerar o diagnóstico.",
  simples_nacional: "Empresas do Simples Nacional não têm teses elegíveis no diagnóstico automático.",
  lead_nao_encontrado: "Lead não encontrado.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const { lead_id } = await req.json().catch(() => ({}));
    if (!lead_id) return json({ error: "lead_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data, error } = await supabase.rpc("gerar_diagnostico_lead", { p_lead_id: lead_id });

    if (error) {
      const semPermissao = error.code === "42501";
      console.error("gerar_diagnostico_lead error:", error);
      return json(
        { error: semPermissao ? "Sem permissão para gerar diagnóstico." : error.message },
        semPermissao ? 403 : 500,
      );
    }

    const r = (data ?? {}) as {
      erro?: string;
      token?: string;
      teses?: unknown[];
      estimativa_total_minima?: number;
      estimativa_total_maxima?: number;
      score?: number;
      gerado_em?: string;
    };

    if (r.erro) {
      return json(
        { error: MENSAGENS_ERRO[r.erro] ?? r.erro, codigo: r.erro },
        r.erro === "lead_nao_encontrado" ? 404 : 400,
      );
    }

    // Mesmo formato de antes para quem já consumia ({success, score, ..., token}).
    // leads.status = 'relatorio_gerado' e score_lead já são gravados por
    // calcular_diagnostico.
    return json({
      success: true,
      token: r.token,
      score: r.score ?? 0,
      estimativa_total_minima: r.estimativa_total_minima ?? 0,
      estimativa_total_maxima: r.estimativa_total_maxima ?? 0,
      teses_count: Array.isArray(r.teses) ? r.teses.length : 0,
      gerado_em: r.gerado_em ?? null,
    });
  } catch (err) {
    console.error("analyze-lead error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
