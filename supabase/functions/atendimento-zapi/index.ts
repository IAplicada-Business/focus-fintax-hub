import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  apagarMensagem,
  conteudoDoEvento,
  ehSufixoLid,
  enviarMidia,
  enviarTexto,
  idExternoDoEvento,
  telefoneDoEvento,
  telefoneSinteticoDoLid,
  tipoDoEvento,
  zapiTelefoneDoLid,
} from "./whatsapp.ts";

/**
 * Transporte Z-API <-> Supabase. Substitui os dois workflows n8n
 * (atendimento-receber / atendimento-enviar) por uma função só, com três rotas:
 *
 *   POST /atendimento-zapi/webhook?chave=...   mensagens/status que chegam da Z-API
 *   POST /atendimento-zapi/enviar              chamada pelo trigger-outbox do Postgres
 *   POST /atendimento-zapi/apagar              chamada pelo painel (usuário logado) p/ apagar msg
 *
 * Nenhuma regra de atendimento ou do bot SDR mora aqui — só grava/lê pelas RPCs
 * que já existem (atendimento_registrar_entrada, atendimento_registrar_mensagem,
 * bot-sdr-responder) e fala com a Z-API. Regra duplicada é regra que diverge.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// /apagar é chamada direto do browser (supabase.functions.invoke), diferente
// de /webhook e /enviar (servidor-a-servidor) — precisa de CORS.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

/**
 * Resolve o telefone de um evento da Z-API. Normalmente é só devolver o que
 * já veio (`telefoneDoEvento`). Quando vem como `<dígitos>@lid` — identificador
 * interno que a Z-API às vezes entrega no lugar do telefone —, tenta resolver
 * pro telefone real nesta ordem:
 *
 *   1. cache aprendido em atendimento_lid_map;
 *   2. pergunta direta à Z-API (zapiTelefoneDoLid);
 *   3. não resolveu: devolve um telefone sintético (`lid:<dígitos>`) pra não
 *      perder a mensagem. Fica como conversa provisória, reconciliada depois
 *      (atendimento_reconciliar_lid) quando o telefone real aparecer num
 *      evento futuro com o mesmo lid.
 */
async function resolverTelefone(bruto: string): Promise<{ telefone: string; provisorio: boolean }> {
  if (!ehSufixoLid(bruto)) return { telefone: bruto, provisorio: false };

  const { data: aprendido } = await supabase
    .from("atendimento_lid_map")
    .select("telefone")
    .eq("lid", bruto)
    .maybeSingle();
  if (aprendido?.telefone) {
    return { telefone: aprendido.telefone, provisorio: false };
  }

  const telefoneReal = await zapiTelefoneDoLid(bruto);
  if (telefoneReal) {
    await supabase
      .from("atendimento_lid_map")
      .upsert({ lid: bruto, telefone: telefoneReal, atualizado_em: new Date().toISOString() }, { onConflict: "lid" });

    // Se já existia conversa provisória deste mesmo lid (de uma mensagem
    // anterior que não resolveu), junta as mensagens na conversa real agora.
    const { error: reconErro } = await supabase.rpc("atendimento_reconciliar_lid", {
      p_telefone_provisorio: telefoneSinteticoDoLid(bruto),
      p_telefone_real: telefoneReal,
    });
    if (reconErro) console.error("atendimento_reconciliar_lid falhou:", reconErro.message);

    return { telefone: telefoneReal, provisorio: false };
  }

  return { telefone: telefoneSinteticoDoLid(bruto), provisorio: true };
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

  const telefoneBruto = telefoneDoEvento(ev);
  if (!telefoneBruto) return json({ ok: true, ignorado: true, motivo: "sem_telefone" });

  const conteudo = conteudoDoEvento(ev);
  if (!conteudo) return json({ ok: true, ignorado: true, motivo: "tipo_sem_conteudo" });

  const { telefone, provisorio } = await resolverTelefone(telefoneBruto);

  // Mensagem mandada direto do celular pareado (fromMe=true), fora do painel.
  // Até esta mudança o webhook descartava ("motivo: from_me") e a mensagem
  // nunca aparecia em lugar nenhum — bug real de perda de mensagem, não só um
  // detalhe de UX. É 'saida'/'humano', mas já chega 'enviada': o próprio
  // WhatsApp confirma a entrega, não passa pelo outbox de novo. O trigger
  // trg_bot_desliga_humano (migration 20260826210000) desliga o robô nessa
  // conversa do mesmo jeito que desligaria se a resposta viesse pelo painel.
  if (ev?.fromMe) {
    const { data, error } = await supabase.rpc("atendimento_registrar_mensagem", {
      p_telefone_raw: telefone,
      p_direcao: "saida",
      p_origem: "humano",
      p_status: "enviada",
      p_texto: conteudo.texto,
      p_tipo: conteudo.tipo,
      p_midia_url: conteudo.midiaUrl,
      p_zapi_message_id: idExternoDoEvento(ev),
      p_pular_normalizacao: provisorio,
    });
    if (error) {
      console.error("atendimento_registrar_mensagem (fromMe) falhou:", error.message);
      return json({ ok: false, motivo: "registrar_fromme_falhou", erro: error.message }, 500);
    }
    return json({ ok: true, ...data });
  }

  if (provisorio) {
    // Lid não resolvido: não passa por atendimento_registrar_entrada (que
    // chamaria normalizar_whatsapp e rejeitaria o telefone sintético).
    const { data, error } = await supabase.rpc("atendimento_registrar_mensagem", {
      p_telefone_raw: telefone,
      p_direcao: "entrada",
      p_origem: "humano",
      p_status: "recebida",
      p_texto: conteudo.texto,
      p_tipo: conteudo.tipo,
      p_midia_url: conteudo.midiaUrl,
      p_zapi_message_id: idExternoDoEvento(ev),
      p_pular_normalizacao: true,
    });
    if (error) {
      console.error("atendimento_registrar_mensagem (lid provisório) falhou:", error.message);
      return json({ ok: false, motivo: "registrar_lid_falhou", erro: error.message }, 500);
    }
    // Não aciona o bot numa conversa provisória: sem telefone de verdade o
    // outbox de resposta não teria pra onde mandar.
    return json({ ok: true, ...data });
  }

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

/**
 * Apagar para todos no WhatsApp, disparado pelo painel (usuário logado) — ao
 * contrário de /enviar (trigger de banco, token compartilhado), aqui quem
 * chama é o browser, então a autenticação é a sessão Supabase do usuário
 * (Bearer token), igual ao padrão usado em editar-msg-humano do bz-advocacia.
 */
async function apagar(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return json({ ok: false, motivo: "nao_autenticado" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user?.id) {
    return json({ ok: false, motivo: "nao_autenticado" }, 401);
  }

  const { mensagem_id } = await req.json().catch(() => ({}));
  if (!mensagem_id) return json({ ok: false, motivo: "payload_invalido" }, 400);

  // Lê com o cliente DO USUÁRIO: reaproveita a policy de SELECT de
  // atendimento_mensagens (os 6 papéis do time de atendimento, migration
  // 20260826170000) como a própria checagem de permissão — nenhuma regra de
  // papel duplicada aqui. Se o usuário não tiver um desses papéis, a RLS
  // devolve zero linhas e cai no "nao_encontrada" abaixo.
  const { data: msg, error: msgErro } = await userClient
    .from("atendimento_mensagens")
    .select("id, telefone, direcao, status, texto, zapi_message_id, apagada_em")
    .eq("id", mensagem_id)
    .maybeSingle();

  if (msgErro || !msg) {
    return json({ ok: false, motivo: "nao_encontrada" }, 404);
  }
  if (msg.direcao !== "saida" || msg.status !== "enviada") {
    return json({ ok: false, motivo: "mensagem_nao_elegivel" }, 400);
  }
  if (msg.apagada_em) {
    return json({ ok: false, motivo: "ja_apagada" }, 400);
  }
  if (!msg.zapi_message_id) {
    return json({ ok: false, motivo: "sem_zapi_message_id" }, 400);
  }

  const resultado = await apagarMensagem(msg.telefone, msg.zapi_message_id);
  if (!resultado.ok) {
    console.error("zapiDeleteMessage falhou:", resultado.status, JSON.stringify(resultado.raw));
    return json({ ok: false, motivo: "zapi_falhou", status: resultado.status }, 502);
  }

  // UPDATE via service role: atendimento_mensagens não tem policy de UPDATE
  // (mesmo padrão já usado em enviar()/webhook() pra status/erro).
  await supabase
    .from("atendimento_mensagens")
    .update({ apagada_em: new Date().toISOString(), texto_anterior: msg.texto })
    .eq("id", mensagem_id);

  return json({ ok: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  try {
    if (req.method === "POST" && url.pathname.endsWith("/webhook")) {
      return await webhook(req, url);
    }
    if (req.method === "POST" && url.pathname.endsWith("/enviar")) {
      return await enviar(req);
    }
    if (req.method === "POST" && url.pathname.endsWith("/apagar")) {
      return await apagar(req);
    }
    return json({ ok: false, motivo: "rota_desconhecida" }, 404);
  } catch (e) {
    console.error("atendimento-zapi excecao:", e instanceof Error ? e.message : e);
    return json({ ok: false, motivo: "excecao", erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
