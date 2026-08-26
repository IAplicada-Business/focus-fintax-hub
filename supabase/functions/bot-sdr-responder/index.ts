import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

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

    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return json({ ok: false, motivo: "sem_api_key" }, 500);
    }
    const anthropic = new Anthropic();

    // O que o lead mandou é 'user', o que saiu daqui é 'assistant'. Mídia entra
    // como marcador: o modelo precisa saber que houve um áudio mesmo sem ouvir.
    const turnos: Anthropic.MessageParam[] = (ctx.mensagens ?? []).map((m: {
      direcao: string;
      texto: string | null;
      tipo: string;
    }) => ({
      role: m.direcao === "entrada" ? ("user" as const) : ("assistant" as const),
      content: m.texto ?? `[${m.tipo}]`,
    }));

    // A primeira mensagem TEM que ser do lead. Se a conversa começou com uma
    // saída (campanha, ou mensagem manual do time), a API rejeita o array.
    while (turnos.length > 0 && turnos[0].role === "assistant") turnos.shift();
    if (turnos.length === 0) {
      return json({ ok: true, respondeu: false, motivo: "sem_turno_do_lead" });
    }

    const modelo: string = ctx.modelo || "claude-haiku-4-5";

    // `effort` e o fallback server-side existem só na geração atual (Opus 5/4.x,
    // Sonnet 5/4.6, Fable 5). Mandar `output_config.effort` para um Haiku 4.5
    // devolve erro — então o formato do request depende do modelo escolhido na
    // tela, e não pode ser fixo.
    const geracaoAtual = /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5|mythos-5)$/.test(modelo);

    // Resposta de WhatsApp tem 3 linhas; o teto existe só para não truncar no
    // meio de uma frase.
    const base = { model: modelo, max_tokens: 4000, system: ctx.prompt, messages: turnos };

    const resposta = geracaoAtual
      ? await anthropic.beta.messages.create({
          ...base,
          // Qualificar lead é tarefa simples: effort baixo responde mais rápido
          // e gasta menos, o que importa com alguém esperando no WhatsApp.
          output_config: { effort: "low" },
          // Recusa por política cai em outro modelo na mesma chamada, em vez de
          // deixar o lead sem resposta.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
      : await anthropic.messages.create(base);

    // Recusa da cadeia inteira: melhor ficar calado e deixar para o humano do
    // que mandar algo estranho para o lead.
    if (resposta.stop_reason === "refusal") {
      return json({
        ok: true,
        respondeu: false,
        motivo: "recusado",
        categoria: resposta.stop_details?.category ?? null,
      });
    }

    const texto = resposta.content
      .filter((b): b is Anthropic.TextBlock | Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Modelo que devolve vazio não vira mensagem vazia no WhatsApp do lead.
    if (!texto) return json({ ok: true, respondeu: false, motivo: "resposta_vazia" });

    const { data: gravou, error: gravaErr } = await supabase.rpc("bot_registrar_resposta", {
      p_telefone: telefone,
      p_texto: texto,
    });
    if (gravaErr) return json({ ok: false, motivo: "gravar_falhou", erro: gravaErr.message }, 500);

    return json({
      ok: true,
      respondeu: true,
      mensagem_id: gravou?.mensagem_id,
      texto,
      modelo: resposta.model,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return json({ ok: false, motivo: "rate_limit" }, 429);
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return json({ ok: false, motivo: "api_key_invalida" }, 401);
    }
    if (e instanceof Anthropic.APIError) {
      return json({ ok: false, motivo: "anthropic_erro", status: e.status, erro: e.message }, 502);
    }
    return json({ ok: false, motivo: "excecao", erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
