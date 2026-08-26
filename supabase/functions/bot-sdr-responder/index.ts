import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Bot SDR: responde uma mensagem de lead no WhatsApp.
 *
 * Chamada pelo fluxo n8n `atendimento-receber` depois de salvar a mensagem.
 *
 * Esta função NÃO decide se pode responder e NÃO envia nada:
 *   - `bot_contexto` avalia todas as travas no banco e devolve pode_responder;
 *   - `bot_registrar_resposta` grava como 'pendente' e o trigger de envio que já
 *     existe leva para a Z-API.
 *
 * Ou seja: nenhuma regra é reimplementada aqui e nenhum token de Z-API passa por
 * aqui. Regra duplicada é regra que diverge.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const segredo = Deno.env.get("BOT_SDR_TOKEN");
    if (segredo && req.headers.get("x-webhook-token") !== segredo) {
      return json({ ok: false, motivo: "token_invalido" }, 401);
    }

    const { telefone } = await req.json().catch(() => ({ telefone: null }));
    if (!telefone) return json({ ok: false, motivo: "telefone_ausente" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: ctx, error: ctxErr } = await supabase.rpc("bot_contexto", {
      p_telefone: telefone,
    });
    if (ctxErr) return json({ ok: false, motivo: "contexto_falhou", erro: ctxErr.message }, 500);

    // Silêncio é resposta válida: "não pode responder" não é erro.
    if (!ctx?.pode_responder) {
      return json({ ok: true, respondeu: false, motivo: ctx?.motivo ?? "desconhecido" });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ ok: false, motivo: "sem_api_key" }, 500);

    // O histórico vira turnos: o que o lead mandou é 'user', o que saiu daqui é
    // 'assistant'. Mensagem de mídia entra como marcador — o modelo precisa
    // saber que houve um áudio, mesmo sem poder ouvi-lo.
    const historico = (ctx.mensagens ?? []).map((m: {
      direcao: string; texto: string | null; tipo: string;
    }) => ({
      role: m.direcao === "entrada" ? "user" : "assistant",
      content: m.texto ?? `[${m.tipo}]`,
    }));

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ctx.modelo,
        messages: [{ role: "system", content: ctx.prompt }, ...historico],
        max_tokens: 300,
      }),
    });

    if (!resp.ok) {
      const detalhe = await resp.text();
      return json({ ok: false, motivo: "gateway_falhou", status: resp.status, detalhe }, 502);
    }

    const payload = await resp.json();
    const texto = payload?.choices?.[0]?.message?.content?.trim();

    // Modelo que devolve vazio não vira mensagem vazia no WhatsApp do lead.
    if (!texto) return json({ ok: true, respondeu: false, motivo: "resposta_vazia" });

    const { data: gravou, error: gravaErr } = await supabase.rpc("bot_registrar_resposta", {
      p_telefone: telefone,
      p_texto: texto,
    });
    if (gravaErr) return json({ ok: false, motivo: "gravar_falhou", erro: gravaErr.message }, 500);

    return json({ ok: true, respondeu: true, mensagem_id: gravou?.mensagem_id, texto });
  } catch (e) {
    return json({ ok: false, motivo: "excecao", erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
