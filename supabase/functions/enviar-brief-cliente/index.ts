// Brief de boas-vindas ao CLIENTE pós-fechamento (Lote 3C).
//
// POST { cliente_id, canais: ("whatsapp" | "email")[], texto_whatsapp?, assunto?, html? }
// Authorization: Bearer <JWT do usuário> — só quem pode editar clientes.
//
// Manda WhatsApp pela Z-API (secrets ZAPI_*, os mesmos do atendimento) e
// e-mail pela Resend (RESEND_API_KEY / RESEND_FROM, os mesmos de
// notificar-equipe-comercial). Canal sem configuração ou cliente sem
// número/e-mail é reportado no resultado, nunca vira erro 500. Textos
// opcionais no body permitem editar antes de enviar (o diálogo faz isso);
// sem eles usa o modelo padrão de mensagem.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { enviarTexto } from "../atendimento-zapi/whatsapp.ts";
import {
  emailValido,
  montarAssuntoBrief,
  montarHtmlBrief,
  montarTextoBriefWhatsapp,
  montarTextoEmailBrief,
  normalizarTelefoneBR,
  type CanalBrief,
} from "./mensagem.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function enviarEmail(para: string, assunto: string, html: string, texto: string) {
  const chave = Deno.env.get("RESEND_API_KEY");
  const de = Deno.env.get("RESEND_FROM");
  if (!chave || !de) return { ok: false as const, erro: "email_nao_configurado" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto }),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}));
      return { ok: false as const, erro: corpo?.message ?? `resend_status_${r.status}` };
    }
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, erro: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await anon.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "Unauthorized" });
  const usuarioId = userData.user.id;

  const { data: podeEditar } = await service.rpc("pode_editar_clientes", { p_user_id: usuarioId });
  if (!podeEditar) return json(403, { error: "Sem permissão para enviar o brief ao cliente" });

  let body: {
    cliente_id?: string;
    canais?: string[];
    texto_whatsapp?: string | null;
    assunto?: string | null;
    html?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  if (!body.cliente_id) return json(400, { error: "cliente_id é obrigatório" });
  const canais = (body.canais ?? []).filter((c): c is CanalBrief => c === "whatsapp" || c === "email");
  if (canais.length === 0) return json(400, { error: "Escolha pelo menos um canal" });

  const { data: cliente, error: cliErr } = await service
    .from("clientes")
    .select("id, empresa, nome_contato, whatsapp, email")
    .eq("id", body.cliente_id)
    .maybeSingle();
  if (cliErr || !cliente) return json(404, { error: "Cliente não encontrado" });

  const texto = body.texto_whatsapp?.trim() || montarTextoBriefWhatsapp(cliente);
  const assunto = body.assunto?.trim() || montarAssuntoBrief(cliente);
  const html = body.html?.trim() || montarHtmlBrief(cliente);
  const textoEmail = montarTextoEmailBrief(cliente);

  let whatsapp = "nao_selecionado";
  if (canais.includes("whatsapp")) {
    const telefone = normalizarTelefoneBR(cliente.whatsapp as string | null);
    whatsapp = telefone
      ? await enviarTexto(telefone, texto).then((r) => (r.ok ? "enviado" : r.erro))
      : "sem_numero";
  }

  let email = "nao_selecionado";
  if (canais.includes("email")) {
    email = emailValido(cliente.email as string | null)
      ? await enviarEmail(String(cliente.email).trim(), assunto, html, textoEmail).then((r) => (r.ok ? "enviado" : r.erro))
      : "sem_email";
  }

  const resultados = { whatsapp, email };
  const algumEnviado = whatsapp === "enviado" || email === "enviado";

  await service.from("cliente_historico").insert({
    cliente_id: cliente.id,
    tipo: "brief_enviado",
    descricao: algumEnviado
      ? `Brief de boas-vindas enviado ao cliente (${[whatsapp === "enviado" && "WhatsApp", email === "enviado" && "e-mail"].filter(Boolean).join(" + ")})`
      : "Tentativa de envio do brief de boas-vindas sem sucesso",
    valor_novo: { canais, resultados, assunto, texto_whatsapp: texto },
    usuario_id: usuarioId,
  });

  return json(200, { ok: algumEnviado, resultados });
});
