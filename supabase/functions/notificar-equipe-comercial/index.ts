// "Enviar para equipe comercial" (card da Triagem, escopo AGF 14/10/2026).
//
// POST { cliente_id, destino: "todos" | "especifico", comercial_id?, observacao? }
// Authorization: Bearer <JWT do usuário> — só quem pode editar clientes.
//
// Para cada destinatário do time comercial (comercial, gestor_comercial, sdr
// ativos) manda WhatsApp pela Z-API (secrets ZAPI_*, os mesmos do
// atendimento) e e-mail pela Resend (secrets RESEND_API_KEY e
// RESEND_FROM). Canal sem configuração ou pessoa sem número/e-mail é
// reportado no resultado, nunca derruba o envio dos demais.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { enviarTexto } from "../atendimento-zapi/whatsapp.ts";
import {
  montarAssuntoAviso,
  montarHtmlAviso,
  montarTextoAviso,
  normalizarTelefoneBR,
} from "./mensagem.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAPEIS_COMERCIAIS = ["comercial", "gestor_comercial", "sdr"];

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
  if (!podeEditar) return json(403, { error: "Sem permissão para enviar clientes ao comercial" });

  let body: {
    cliente_id?: string;
    destino?: string;
    comercial_id?: string | null;
    observacao?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  const destino = body.destino === "especifico" ? "especifico" : "todos";
  if (!body.cliente_id) return json(400, { error: "cliente_id é obrigatório" });
  if (destino === "especifico" && !body.comercial_id) {
    return json(400, { error: "Escolha o comercial que vai receber" });
  }

  const { data: cliente, error: cliErr } = await service
    .from("clientes")
    .select("id, empresa, cnpj, nome_contato, whatsapp, email")
    .eq("id", body.cliente_id)
    .maybeSingle();
  if (cliErr || !cliente) return json(404, { error: "Cliente não encontrado" });

  const { data: papeis } = await service
    .from("user_roles")
    .select("user_id, role")
    .in("role", PAPEIS_COMERCIAIS);
  let ids = [...new Set((papeis ?? []).map((p) => p.user_id as string))];
  if (destino === "especifico") ids = ids.filter((id) => id === body.comercial_id);
  if (ids.length === 0) return json(400, { error: "Nenhum comercial ativo para receber" });

  const { data: pessoas } = await service
    .from("profiles")
    .select("user_id, full_name, email, whatsapp, is_active")
    .in("user_id", ids)
    .eq("is_active", true);
  if (!pessoas?.length) return json(400, { error: "Nenhum comercial ativo para receber" });

  const { data: remetente } = await service
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", usuarioId)
    .maybeSingle();
  const nomeRemetente = remetente?.full_name || remetente?.email || "operação";

  const appUrl = Deno.env.get("APP_PUBLIC_URL");
  const link = appUrl ? `${appUrl.replace(/\/$/, "")}/clientes/${cliente.id}` : null;
  const texto = montarTextoAviso({ cliente, remetente: nomeRemetente, observacao: body.observacao, link });
  const assunto = montarAssuntoAviso(cliente);
  const html = montarHtmlAviso(texto);

  const resultados = [];
  for (const p of pessoas) {
    const telefone = normalizarTelefoneBR(p.whatsapp as string | null);
    const whatsapp = telefone
      ? await enviarTexto(telefone, texto).then((r) => (r.ok ? "enviado" : r.erro))
      : "sem_numero";
    const email = p.email
      ? await enviarEmail(p.email as string, assunto, html, texto).then((r) => (r.ok ? "enviado" : r.erro))
      : "sem_email";
    resultados.push({ user_id: p.user_id, nome: p.full_name, whatsapp, email });
  }

  await service.from("cliente_historico").insert({
    cliente_id: cliente.id,
    tipo: "enviado_equipe_comercial",
    descricao:
      destino === "todos"
        ? "Cliente enviado da Triagem para toda a equipe comercial"
        : `Cliente enviado da Triagem para ${resultados[0]?.nome ?? "comercial"}`,
    valor_novo: { destino, observacao: body.observacao ?? null, resultados },
    usuario_id: usuarioId,
  });

  return json(200, { ok: true, destino, resultados });
});
