// Resumo semanal automático por WhatsApp (Lote 3B).
//
// POST { tipo: "segunda" | "sexta" | "teste", referencia?: "YYYY-MM-DD", modelo?: "segunda" | "sexta" }
//
// Dois jeitos de autenticar:
//   • cron (pg_cron → net.http_post): header `x-cron-token` igual ao secret
//     RESUMO_SEMANAL_TOKEN (mesmo valor do segredo `resumo_semanal_token` no
//     Vault — ver migration 20261016130000_resumo_semanal.sql);
//   • UI ("Enviar teste para mim", Configurações → Resumo semanal): Bearer JWT
//     de usuário admin. O teste vai SEMPRE para o profiles.whatsapp de quem
//     clicou — a UI não manda número, então ninguém usa o botão pra disparar
//     a mensagem pra terceiros.
//
// Destinatários (segunda/sexta): linhas ativas de resumo_semanal_destinatarios.
// Linha com user_id usa nome e WhatsApp do profile NA HORA do envio (mudou o
// número em Usuários, já vale); usuário inativo ou sem WhatsApp é pulado e
// listado em `ignorados` na resposta. Linha antiga só com whatsapp continua
// valendo (migration 20261016150000).
//
// O envio sai pelo mesmo número Z-API do Atendimento (enviarTexto + ZAPI_*).
//
// Fluxo: rpc resumo_semanal_dados → (sexta) busca snapshot da segunda em
// resumo_semanal_envios → formata (mensagem.ts) → enviarTexto por destinatário
// → grava uma linha em resumo_semanal_envios por destinatário. Falha de um
// destinatário nunca derruba os demais.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { enviarTexto } from "../atendimento-zapi/whatsapp.ts";
import {
  montarMensagemResumo,
  normalizarTelefoneBR,
  validarFormatoResumo,
  type ModeloResumo,
  type ResumoSemanalDados,
} from "./mensagem.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Tipo = "segunda" | "sexta" | "teste";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante pra não vazar o token por timing. */
function tokensIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // --- autenticação: cron OU usuário admin
  let viaCron = false;
  let usuarioId: string | null = null;
  let nomeUsuario: string | null = null;
  let whatsappUsuario: string | null = null;

  const cronToken = req.headers.get("x-cron-token");
  const tokenEsperado = Deno.env.get("RESUMO_SEMANAL_TOKEN") ?? "";
  if (cronToken) {
    if (!tokenEsperado || !tokensIguais(cronToken, tokenEsperado)) {
      return json(401, { error: "Token do cron inválido" });
    }
    viaCron = true;
  } else {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await anon.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "Unauthorized" });
    usuarioId = userData.user.id;
    const { data: admin } = await service.rpc("has_role", { _user_id: usuarioId, _role: "admin" });
    if (!admin) return json(403, { error: "Só administradores podem disparar o resumo" });
    const { data: perfil } = await service
      .from("profiles")
      .select("full_name, whatsapp")
      .eq("user_id", usuarioId)
      .maybeSingle();
    nomeUsuario = (perfil?.full_name as string | null) ?? null;
    whatsappUsuario = normalizarTelefoneBR(perfil?.whatsapp as string | null);
  }

  // --- corpo
  let body: { tipo?: string; referencia?: string; modelo?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  const tipo = body.tipo as Tipo;
  if (!["segunda", "sexta", "teste"].includes(tipo)) {
    return json(400, { error: "tipo deve ser segunda, sexta ou teste" });
  }
  // O cron só manda segunda/sexta; teste é exclusivo da UI (JWT).
  if (viaCron && tipo === "teste") return json(400, { error: "Cron não dispara teste" });

  const modelo: ModeloResumo = tipo === "teste" ? (body.modelo === "sexta" ? "sexta" : "segunda") : tipo;
  const referencia = body.referencia && /^\d{4}-\d{2}-\d{2}$/.test(body.referencia) ? body.referencia : null;

  // --- destinatários
  let destinatarios: { nome: string | null; whatsapp: string }[] = [];
  const ignorados: { user_id: string; nome: string | null; motivo: "sem_whatsapp" | "inativo" }[] = [];
  if (tipo === "teste") {
    if (!whatsappUsuario) {
      return json(400, {
        error: "Seu usuário não tem WhatsApp cadastrado. Cadastre em Usuários para receber o teste.",
      });
    }
    destinatarios = [{ nome: nomeUsuario, whatsapp: whatsappUsuario }];
  } else {
    const { data: rows, error } = await service
      .from("resumo_semanal_destinatarios")
      .select("nome, whatsapp, user_id")
      .eq("ativo", true);
    if (error) return json(500, { error: error.message });

    // Um select só pros profiles de todos os usuários marcados.
    const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string | null).filter((id): id is string => !!id))];
    const perfis = new Map<string, { full_name: string | null; whatsapp: string | null; is_active: boolean | null }>();
    if (userIds.length > 0) {
      const { data: profs, error: profErr } = await service
        .from("profiles")
        .select("user_id, full_name, whatsapp, is_active")
        .in("user_id", userIds);
      if (profErr) return json(500, { error: profErr.message });
      for (const p of profs ?? []) {
        perfis.set(p.user_id as string, { full_name: p.full_name, whatsapp: p.whatsapp, is_active: p.is_active });
      }
    }

    const vistos = new Set<string>();
    for (const r of rows ?? []) {
      let nome = r.nome as string | null;
      let whatsapp: string | null;
      const userId = r.user_id as string | null;
      if (userId) {
        const perfil = perfis.get(userId);
        nome = perfil?.full_name ?? nome;
        if (!perfil || perfil.is_active === false) {
          ignorados.push({ user_id: userId, nome, motivo: "inativo" });
          continue;
        }
        whatsapp = normalizarTelefoneBR(perfil.whatsapp);
        if (!whatsapp) {
          ignorados.push({ user_id: userId, nome, motivo: "sem_whatsapp" });
          continue;
        }
      } else {
        whatsapp = normalizarTelefoneBR(r.whatsapp as string | null);
        if (!whatsapp) continue;
      }
      // Mesmo número em duas linhas (usuário + cadastro antigo) recebe uma vez só.
      if (vistos.has(whatsapp)) continue;
      vistos.add(whatsapp);
      destinatarios.push({ nome, whatsapp });
    }
    if (destinatarios.length === 0) {
      return json(200, { ok: true, tipo, enviados: 0, falhas: 0, ignorados, aviso: "Nenhum destinatário ativo com WhatsApp" });
    }
  }

  // --- dados
  const { data: dadosRaw, error: dadosErr } = await service.rpc("resumo_semanal_dados", {
    p_tipo: modelo,
    p_referencia: referencia,
  });
  if (dadosErr || !dadosRaw) return json(500, { error: dadosErr?.message ?? "Falha ao gerar os dados do resumo" });
  const dados = dadosRaw as ResumoSemanalDados;

  // Sexta compara com a última foto de segunda da MESMA semana (envio real,
  // não teste). Sem ela a mensagem avisa em vez de inventar variação.
  let segunda: ResumoSemanalDados | null = null;
  if (modelo === "sexta") {
    const { data: snap } = await service
      .from("resumo_semanal_envios")
      .select("dados")
      .eq("tipo", "segunda")
      .eq("periodo_inicio", dados.periodo_inicio)
      .not("dados", "is", null)
      .order("executado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    segunda = (snap?.dados as ResumoSemanalDados | null) ?? null;
  }

  // --- envio por destinatário
  const resultados: { destinatario: string; nome: string | null; status: "sucesso" | "falha"; erro: string | null }[] = [];
  for (const d of destinatarios) {
    const mensagem = montarMensagemResumo(modelo, dados, segunda, d.nome);
    const formato = validarFormatoResumo(mensagem);
    if (!formato.ok) console.warn("resumo-semanal: formato fora do modelo:", formato.problemas.join("; "));

    const envio = await enviarTexto(d.whatsapp, mensagem);
    const status = envio.ok ? "sucesso" : "falha";
    const erro = envio.ok ? null : envio.erro;
    resultados.push({ destinatario: d.whatsapp, nome: d.nome, status, erro });

    const { error: logErr } = await service.from("resumo_semanal_envios").insert({
      tipo,
      periodo_inicio: dados.periodo_inicio,
      periodo_fim: dados.periodo_fim,
      destinatario: d.whatsapp,
      mensagem,
      dados: { ...dados, modelo, segunda_comparada: segunda ? segunda.gerado_em ?? true : null, disparado_por: usuarioId },
      status,
      erro,
      zapi_response: envio.ok ? { idExterno: envio.idExterno } : { erro: envio.erro },
    });
    if (logErr) console.error("resumo-semanal: falha ao registrar envio:", logErr.message);
  }

  const enviados = resultados.filter((r) => r.status === "sucesso").length;
  return json(200, {
    ok: enviados > 0,
    tipo,
    modelo,
    periodo_inicio: dados.periodo_inicio,
    periodo_fim: dados.periodo_fim,
    enviados,
    falhas: resultados.length - enviados,
    comparou_com_segunda: !!segunda,
    resultados,
    ignorados,
  });
});
