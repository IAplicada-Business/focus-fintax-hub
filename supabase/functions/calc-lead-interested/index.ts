// supabase/functions/calc-lead-interested/index.ts
//
// Chamada quando o usuário clica em "Quer saber mais? Fale com um especialista"
// na tela de resultado da /calculadora. Marca o lead como pronto pra comercial:
//   1. calculadora_leads.interesse_conversao = true
//   2. leads.observacoes += "[TAG: quer_saber_mais]" (idempotente)
//   3. leads.status_funil promove pra "qualificado" (se ainda estiver em "novo")
//
// Público (sem auth) — protegido pelo par (calculadora_lead_id, lead_id) que
// só quem submeteu o form tem. Idempotente: rodar 2x não duplica tag nem estado.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TAG = "[TAG: quer_saber_mais]";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const lead_id: string | undefined = body?.lead_id;
    const calculadora_lead_id: string | undefined = body?.calculadora_lead_id;

    if (!lead_id && !calculadora_lead_id) {
      return new Response(
        JSON.stringify({ error: "informe lead_id ou calculadora_lead_id" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // Até esta correção a /calculadora mandava o id de calculadora_leads no
    // campo `lead_id`: nenhum UPDATE batia e o lead nunca era marcado. Agora
    // a tela manda os dois campos certos, mas um `lead_id` que não exista em
    // `leads` ainda é tratado como id da calculadora (página antiga em cache).
    let calcId = calculadora_lead_id;
    let resolvedLeadId: string | undefined;

    if (lead_id) {
      const { data: crm } = await sb.from("leads").select("id, calculadora_lead_id").eq("id", lead_id).maybeSingle();
      if (crm) {
        resolvedLeadId = crm.id;
        calcId = calcId ?? (crm.calculadora_lead_id ?? undefined);
      } else {
        calcId = calcId ?? lead_id;
      }
    }

    // 1) marca calculadora_leads.interesse_conversao
    if (calcId) {
      const { error: calcErr } = await sb
        .from("calculadora_leads")
        .update({ interesse_conversao: true, interesse_conversao_em: new Date().toISOString() })
        .eq("id", calcId);
      if (calcErr) console.error("calc-lead-interested calculadora_leads:", calcErr);
    }

    // 2) descobre o lead do CRM vinculado à calculadora
    if (!resolvedLeadId && calcId) {
      const { data: cl } = await sb
        .from("leads")
        .select("id")
        .eq("calculadora_lead_id", calcId)
        .maybeSingle();
      resolvedLeadId = cl?.id;
    }

    if (resolvedLeadId) {
      // 3) tag em observacoes (idempotente)
      const { data: lead } = await sb
        .from("leads")
        .select("observacoes, status_funil")
        .eq("id", resolvedLeadId)
        .maybeSingle();
      const currentObs = String(lead?.observacoes ?? "");
      const patch: Record<string, unknown> = {};
      if (!currentObs.includes(TAG)) {
        patch.observacoes = (currentObs ? currentObs + " · " : "") + TAG;
      }
      // 4) promove pra qualificado se ainda está no início do funil
      if (lead?.status_funil === "novo") {
        patch.status_funil = "qualificado";
        patch.status_funil_atualizado_em = new Date().toISOString();
      }
      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await sb.from("leads").update(patch).eq("id", resolvedLeadId);
        if (upErr) console.error("calc-lead-interested leads:", upErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, lead_id: resolvedLeadId ?? null, calculadora_lead_id: calcId ?? null }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e) {
    console.error("calc-lead-interested error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "erro interno" }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
