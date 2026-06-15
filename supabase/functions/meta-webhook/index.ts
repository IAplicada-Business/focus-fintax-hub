// supabase/functions/meta-webhook/index.ts
// Recebe eventos leadgen do Meta Ads, valida assinatura, busca o lead completo
// via Graph API, grava em meta_leads e delega ao submit-lead-public.
import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN  = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;
const APP_SECRET    = Deno.env.get("META_APP_SECRET")!;
const SYS_TOKEN     = Deno.env.get("META_SYSTEM_USER_TOKEN")!;
const GRAPH         = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Mediana das faixas do form FM - 02 (ajuste se o form mudar)
const FATURAMENTO_MAP: Record<string, number> = {
  "r$_700_mil_–_r$_1_milhão":     850_000,
  "r$_1_milhão_–_r$_3_milhões":  2_000_000,
  "r$_3_milhões_–_r$_5_milhões": 4_000_000,
  "acima_de_r$_5_milhões":       7_500_000,
};

function pick(field_data: any[], name: string): string | undefined {
  return field_data?.find((f) => f.name === name)?.values?.[0];
}

async function verifySignature(_req: Request, body: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatureHeader === `sha256=${hex}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1) Verificação inicial do webhook (handshake GET)
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  // 2) Recebimento de eventos (POST)
  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256");

  if (!(await verifySignature(req, rawBody, sig))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const exec = await supabase
    .from("meta_execution_log")
    .insert({ function_name: "meta-webhook", context: payload })
    .select()
    .single();

  let processed = 0;
  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const v = change.value;

        // 2.1) Busca o lead completo via Graph API
        const r = await fetch(
          `${GRAPH}/${v.leadgen_id}?fields=created_time,field_data,ad_id,form_id,campaign_id` +
          `&access_token=${SYS_TOKEN}`,
        );
        const lead = await r.json();
        if (lead.error) throw new Error(JSON.stringify(lead.error));

        const fd = lead.field_data ?? [];
        const email   = pick(fd, "email");
        const phone   = pick(fd, "phone_number");
        const cnpj    = (pick(fd, "cnpj") ?? "").replace(/\D/g, "");
        const razao   = pick(fd, "razão_social_da_empresa");
        const nome    = pick(fd, "nome_do_dono/seu_nome");
        const seg     = pick(fd, "segmento_da_empresa");
        const reg     = pick(fd, "regime_de_tributação");
        const faixa   = pick(fd, "faturamento_mensal_da_empresa");
        const fatNum  = FATURAMENTO_MAP[faixa ?? ""] ?? null;
        const jaFez   = ["sim", "yes", "true"].includes(
          (pick(fd, "você_faz_ou_já_fez_compensação_tributária?_") ?? "").toLowerCase()
        );

        // 2.2) Grava em meta_leads (raw + desnormalizado)
        const { error: upsertErr } = await supabase.from("meta_leads").upsert({
          id: lead.id,
          form_id: lead.form_id ?? v.form_id,
          ad_id: lead.ad_id ?? v.ad_id ?? null,
          campaign_id: v.campaign_id ?? null,
          page_id: v.page_id ?? entry.id,
          created_time: lead.created_time,
          field_data: fd,
          email, phone, cnpj,
          razao_social: razao,
          nome,
          segmento: seg,
          regime_tributacao: reg,
          faturamento_faixa: faixa,
          faturamento_estimado: fatNum,
          ja_fez_compensacao: jaFez,
          raw: lead,
        }, { onConflict: "id" });

        if (upsertErr) {
          console.error("meta_leads upsert error:", upsertErr);
        }

        // 2.3) Delega ao submit-lead-public (mesmo pipeline da LP)
        const { data: submitResp, error: submitErr } = await supabase.functions.invoke(
          "submit-lead-public",
          {
            body: {
              origem: "meta_ads",
              nome,
              email,
              telefone: phone,
              cnpj,
              razao_social: razao,
              segmento: seg,
              regime: reg,
              faturamento_mensal_estimado: fatNum ?? 1_000_000,
              ja_fez_compensacao: jaFez,
              meta_lead_id: lead.id,
              meta_form_id: lead.form_id ?? v.form_id,
              meta_campaign_id: v.campaign_id,
              meta_ad_id: v.ad_id,
            },
          },
        );

        // 2.4) Vincula o crm_lead_id criado
        const crmLeadId = (submitResp as any)?.lead_id ?? null;
        const errText = submitErr
          ? String(submitErr)
          : (submitResp as any)?.blocked
            ? `blocked: ${(submitResp as any)?.reason ?? "unknown"}`
            : null;

        await supabase
          .from("meta_leads")
          .update({
            crm_lead_id: crmLeadId,
            processed_at: new Date().toISOString(),
            error_text: errText,
          })
          .eq("id", lead.id);

        processed++;
      }
    }

    await supabase
      .from("meta_execution_log")
      .update({
        finished_at: new Date().toISOString(),
        ok: true,
        rows_affected: processed,
      })
      .eq("id", exec.data?.id);

    return new Response("ok", { status: 200 });
  } catch (e) {
    await supabase
      .from("meta_execution_log")
      .update({
        finished_at: new Date().toISOString(),
        ok: false,
        error_text: String(e),
      })
      .eq("id", exec.data?.id);
    // Responder 200 mesmo em erro evita Meta repetir indefinidamente
    return new Response("ok-with-error", { status: 200 });
  }
});
