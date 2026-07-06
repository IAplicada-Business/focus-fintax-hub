// supabase/functions/submit-calculadora-lead/index.ts
//
// Orchestrator do form da LP /calculadora:
//   1. Valida payload (Zod-like em código puro)
//   2. Roda motor (calcularCenarios) local — sem chamar as outras edge functions
//      pra evitar N round trips (cold start + rede).
//   3. Grava lead em calculadora_leads
//   4. Grava snapshot em calculadora_snapshots (versionamento)
//   5. Retorna { lead_id, resultado }
//
// Insert bypasses RLS via service role — anon não tem policy INSERT
// nas duas tabelas (garantia de auditoria + LGPD).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  calcularCenarios,
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

interface LeadPayload {
  nome?: string;
  telefone?: string;
  email?: string;
  segmento?: string;
  regime?: string;
  faturamento_mensal?: number;
  ja_faz_recuperacao?: boolean;
  aceite_lgpd?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

function validate(p: LeadPayload): { ok: true } | { ok: false; error: string } {
  if (!p.nome || String(p.nome).trim().length < 3) return { ok: false, error: "nome inválido" };
  if (!p.telefone || String(p.telefone).replace(/\D/g, "").length < 10)
    return { ok: false, error: "telefone inválido" };
  if (!p.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email))
    return { ok: false, error: "email inválido" };
  if (!["simples", "presumido", "real"].includes(String(p.regime)))
    return { ok: false, error: "regime inválido (esperado: simples/presumido/real)" };
  const f = Number(p.faturamento_mensal);
  if (!Number.isFinite(f) || f < 100_000)
    return { ok: false, error: "faturamento_mensal inválido (mínimo R$ 100.000)" };
  if (typeof p.ja_faz_recuperacao !== "boolean")
    return { ok: false, error: "ja_faz_recuperacao obrigatório" };
  if (p.aceite_lgpd !== true)
    return { ok: false, error: "aceite_lgpd obrigatório (LGPD)" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as LeadPayload;

    const v = validate(body);
    if (!v.ok) {
      return new Response(JSON.stringify({ error: v.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const segmento = (body.segmento || "supermercado").toLowerCase();
    const faturamento = Number(body.faturamento_mensal);

    // Puxa motor
    const [cfgRes, idxRes] = await Promise.all([
      sb.from("reforma_config").select("chave, valor"),
      sb
        .from("focus_indices")
        .select("id, segmento, grupo, rubrica, percentual_sobre_faturamento, gera_credito_ibs_cbs, entra_na_exclusao_credito, ordem_exibicao")
        .eq("segmento", segmento)
        .eq("ativo", true),
    ]);

    if (cfgRes.error) throw new Error(`config: ${cfgRes.error.message}`);
    if (idxRes.error) throw new Error(`indices: ${idxRes.error.message}`);

    const config = configFromRows((cfgRes.data as any[]) ?? []);
    const indices = ((idxRes.data as any[]) ?? []).map((r) => ({
      ...r,
      percentual_sobre_faturamento: Number(r.percentual_sobre_faturamento),
    })) as FocusIndice[];

    // Roda motor
    const resultado = calcularCenarios({
      faturamento_mensal: faturamento,
      indices,
      config,
    });

    const ibsCbsEstimado = resultado.reforma.saldo_a_pagar;
    const economiaAnual =
      (resultado.reforma.credito_bruto.total -
        resultado.reforma.exclusao.total -
        resultado.reforma.debito.total) *
      12; // saldo mensal × 12 (positivo se favorável)

    // Grava lead
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const { data: lead, error: leadErr } = await sb
      .from("calculadora_leads")
      .insert({
        nome: String(body.nome).slice(0, 255),
        telefone: String(body.telefone).slice(0, 32),
        email: String(body.email).slice(0, 255),
        segmento,
        regime: body.regime,
        faturamento_mensal: faturamento,
        ja_faz_recuperacao: !!body.ja_faz_recuperacao,
        aceite_lgpd: true,
        aceite_lgpd_at: new Date().toISOString(),
        utm_source: body.utm_source ?? null,
        utm_medium: body.utm_medium ?? null,
        utm_campaign: body.utm_campaign ?? null,
        utm_term: body.utm_term ?? null,
        utm_content: body.utm_content ?? null,
        ip_address: clientIp,
        user_agent: userAgent,
        resultado_dre_atual: resultado.dre as any,
        resultado_dre_reforma: resultado.dre as any,
        ibs_cbs_estimado: ibsCbsEstimado,
        economia_potencial_anual: economiaAnual,
      })
      .select("id")
      .single();

    if (leadErr || !lead) {
      console.error("submit-calculadora-lead insert lead err:", leadErr);
      return new Response(
        JSON.stringify({ error: "Falha ao salvar lead" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Grava snapshot (versionamento)
    const { error: snapErr } = await sb.from("calculadora_snapshots").insert({
      lead_id: lead.id,
      focus_indices_snapshot: indices as any,
      reforma_config_snapshot: config as any,
      input_payload: {
        faturamento_mensal: faturamento,
        regime: body.regime,
        segmento,
        ja_faz_recuperacao: body.ja_faz_recuperacao,
      },
      output_payload: {
        dre: resultado.dre,
        reforma: resultado.reforma,
      },
    });

    if (snapErr) {
      // Snapshot é auditoria — não bloqueia o retorno pro user
      console.error("submit-calculadora-lead snapshot err:", snapErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        resultado: {
          dre: resultado.dre,
          reforma: resultado.reforma,
          ibs_cbs_estimado: ibsCbsEstimado,
          economia_potencial_anual: economiaAnual,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("submit-calculadora-lead error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
