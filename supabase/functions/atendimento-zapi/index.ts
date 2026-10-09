import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { conteudoDoEvento, enviarMidia, enviarTexto, idExternoDoEvento, telefoneDoEvento, tipoDoEvento } from "./whatsapp.ts";

/**
 * Transporte Z-API <-> Supabase. Substitui os dois workflows n8n
 * (atendimento-receber / atendimento-enviar) por uma função só, com duas rotas:
 *
 *   POST /atendimento-zapi/webhook?chave=...   mensagens/status que chegam da Z-API
 *   POST /atendimento-zapi/enviar              chamada pelo trigger-outbox do Postgres
 *
 * Nenhuma regra de atendimento ou do bot SDR mora aqui — só grava/lê pelas RPCs
 * que já existem (atendimento_registrar_entrada, bot-sdr-responder) e fala com
 * a Z-API. Regra duplicada é regra que diverge.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function acionarBot(telefone: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const botToken = Deno.env.get("BOT_SDR_TOKEN");
  try {
    await fetch(`${supabaseUrl}/functions/v1/bot-sdr-responder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        ...(botToken ? { "x-webhook-token": botToken } : {}),
      },
      body: JSON.stringify({ telefone }),
    });
  } catch (e) {
    console.error("acionarBot falhou:", e instanceof Error ? e.message : e);
  }
}

async function webhook(req: Request, url: URL) {
  const chaveEsperada = Deno.env.get("ATENDIMENTO_ZAPI_WEBHOOK_CHAVE");
  if (chaveEsperada && url.searchParams.get("chave") !== chaveEsperada) {
    return json({ ok: false, motivo: "chave_invalida" }, 401);
  }

  const ev = await req.json().catch(() => null);
  if (!ev) return json({ ok: true, ignorado: true, motivo: "body_vazio" });

  const tipo = tipoDoEvento(ev);

  // Confirmação de entrega/leitura: só nos interessa quando dá erro — sucesso
  // já foi marcado 'enviada' no momento do envio.
  if (tipo === "DeliveryCallback" || tipo === "MessageStatusCallback") {
    const idExterno = idExternoDoEvento(ev);
    const falhou = Boolean(ev?.error) || ev?.status === "FAILED";
    if (idExterno && falhou) {
      await supabase
        .from("atendimento_mensagens")
        .update({ status: "falha", erro: ev?.error ?? ev?.status ?? "falha_zapi" })
        .eq("zapi_message_id", idExterno)
        .in("status", ["pendente", "enviada"]);
    }
    return json({ ok: true, tipo });
  }

  if (tipo !== "ReceivedCallback") {
    return json({ ok: true, ignorado: true, tipo });
  }

  // Eco da própria mensagem enviada pelo número (resposta manual direto do
  // celular, fora da tela) — fora de escopo por ora: só ignora.
  if (ev?.fromMe) {
    return json({ ok: true, ignorado: true, motivo: "from_me" });
  }

  const telefone = telefoneDoEvento(ev);
  if (!telefone) return json({ ok: true, ignorado: true, motivo: "sem_telefone" });

  const conteudo = conteudoDoEvento(ev);
  if (!conteudo) return json({ ok: true, ignorado: true, motivo: "tipo_sem_conteudo" });

  const { data, error } = await supabase.rpc("atendimento_registrar_entrada", {
    p_telefone_raw: telefone,
    p_texto: conteudo.texto,
    p_tipo: conteudo.tipo,
    p_midia_url: conteudo.midiaUrl,
    p_zapi_message_id: idExternoDoEvento(ev),
  });
  if (error) {
    console.error("atendimento_registrar_entrada falhou:", error.message);
    return json({ ok: false, motivo: "registrar_falhou", erro: error.message }, 500);
  }

  if (data?.ok && data?.inserida && data?.telefone) {
    // @ts-ignore — EdgeRuntime existe no runtime do Supabase, não no tipo padrão do Deno.
    EdgeRuntime.waitUntil(acionarBot(data.telefone));
  }

  return json({ ok: true, ...data });
}

async function enviar(req: Request) {
  const tokenEsperado = Deno.env.get("ATENDIMENTO_OUTBOX_TOKEN");
  if (tokenEsperado && req.headers.get("x-webhook-token") !== tokenEsperado) {
    return json({ ok: false, motivo: "token_invalido" }, 401);
  }

  const { mensagem_id, telefone, texto, tipo, midia_url } = await req.json().catch(() => ({}));
  if (!mensagem_id || !telefone || (!texto && !midia_url)) {
    return json({ ok: false, motivo: "payload_invalido" }, 400);
  }

  // 'texto' continua o caminho padrão (payload sem midia_url — é o que o
  // trigger sempre mandou antes desta mudança, e o que ele ainda manda para
  // mensagem sem anexo). Mídia só entra quando há midia_url.
  const resultado = midia_url
    ? await enviarMidia(telefone, tipo || "outro", midia_url, texto)
    : await enviarTexto(telefone, texto);

  if (resultado.ok) {
    await supabase
      .from("atendimento_mensagens")
      .update({ status: "enviada", zapi_message_id: resultado.idExterno })
      .eq("id", mensagem_id);
    return json({ ok: true, id_externo: resultado.idExterno });
  }

  await supabase
    .from("atendimento_mensagens")
    .update({ status: "falha", erro: resultado.erro })
    .eq("id", mensagem_id);
  return json({ ok: false, motivo: "envio_falhou", erro: resultado.erro }, 502);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null);

  const url = new URL(req.url);

  try {
    if (req.method === "POST" && url.pathname.endsWith("/webhook")) {
      return await webhook(req, url);
    }
    if (req.method === "POST" && url.pathname.endsWith("/enviar")) {
      return await enviar(req);
    }
    return json({ ok: false, motivo: "rota_desconhecida" }, 404);
  } catch (e) {
    console.error("atendimento-zapi excecao:", e instanceof Error ? e.message : e);
    return json({ ok: false, motivo: "excecao", erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
