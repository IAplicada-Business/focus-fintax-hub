import { supabase } from "@/integrations/supabase/client";
import type { ModeloResumo, ResumoSemanalDados } from "@/lib/resumo-semanal";

export interface ResumoDestinatario {
  id: string;
  /** Usuário do sistema; nulo só nas linhas antigas digitadas à mão. */
  user_id: string | null;
  nome: string | null;
  whatsapp: string | null;
  ativo: boolean;
  criado_em: string;
}

/** Pessoa com acesso ao sistema que pode receber o resumo. */
export interface UsuarioResumo {
  user_id: string;
  full_name: string;
  email: string;
  whatsapp: string | null;
  role: string | null;
}

export interface ResumoEnvio {
  id: string;
  tipo: string;
  periodo_inicio: string;
  periodo_fim: string;
  destinatario: string;
  mensagem: string;
  status: string;
  erro: string | null;
  executado_em: string;
}

export interface ResultadoEnvioResumo {
  ok: boolean;
  tipo: string;
  modelo?: string;
  enviados: number;
  falhas: number;
  comparou_com_segunda?: boolean;
  aviso?: string;
  resultados?: { destinatario: string; status: string; erro: string | null }[];
  /** Usuários marcados que ficaram de fora (inativos ou sem WhatsApp no perfil). */
  ignorados?: { user_id: string; nome: string | null; motivo: string }[];
}

export async function listResumoDestinatarios(): Promise<ResumoDestinatario[]> {
  const { data, error } = await supabase
    .from("resumo_semanal_destinatarios")
    .select("*")
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ResumoDestinatario[];
}

/**
 * Usuários ativos com papel e WhatsApp do perfil. Select direto: a tela é só
 * de admin, que já lê todos os profiles e user_roles pelo RLS.
 */
export async function listUsuariosComWhatsapp(): Promise<UsuarioResumo[]> {
  const [profilesR, rolesR] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, whatsapp, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (profilesR.error) throw profilesR.error;
  // Sem os papéis a lista ainda serve; o badge só some.
  const roles = new Map<string, string>((rolesR.data ?? []).map((r) => [r.user_id, r.role as string]));
  return (profilesR.data ?? []).map((p) => ({
    user_id: p.user_id,
    full_name: p.full_name,
    email: p.email,
    whatsapp: p.whatsapp?.trim() || null,
    role: roles.get(p.user_id) ?? null,
  }));
}

/**
 * Liga/desliga o resumo para um usuário. Upsert por user_id (índice único da
 * migration 20261016150000): desligar mantém a linha com ativo=false, então
 * religar não cria duplicata. O número não é gravado — a Edge Function lê
 * profiles.whatsapp na hora do envio.
 */
export async function toggleDestinatarioUsuario(input: { userId: string; nome: string | null; ativo: boolean }) {
  const { error } = await supabase
    .from("resumo_semanal_destinatarios")
    .upsert({ user_id: input.userId, nome: input.nome, ativo: input.ativo }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Só para limpar cadastros antigos (número digitado à mão, sem usuário). */
export async function removeResumoDestinatario(id: string) {
  const { error } = await supabase.from("resumo_semanal_destinatarios").delete().eq("id", id);
  if (error) throw error;
}

export async function listResumoEnvios(limite = 10): Promise<ResumoEnvio[]> {
  const { data, error } = await supabase
    .from("resumo_semanal_envios")
    .select("id, tipo, periodo_inicio, periodo_fim, destinatario, mensagem, status, erro, executado_em")
    .order("executado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as ResumoEnvio[];
}

/** Foto consolidada que alimenta a mensagem (a RPC valida o papel). */
export async function previewResumoDados(modelo: ModeloResumo, referencia?: string | null): Promise<ResumoSemanalDados> {
  const { data, error } = await supabase.rpc("resumo_semanal_dados", {
    p_tipo: modelo,
    p_referencia: referencia ?? undefined,
  });
  if (error) throw error;
  return data as unknown as ResumoSemanalDados;
}

/** Último snapshot de segunda da mesma semana, pro preview da sexta comparar. */
export async function getSnapshotSegunda(periodoInicio: string): Promise<ResumoSemanalDados | null> {
  const { data, error } = await supabase
    .from("resumo_semanal_envios")
    .select("dados")
    .eq("tipo", "segunda")
    .eq("periodo_inicio", periodoInicio)
    .not("dados", "is", null)
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.dados as unknown as ResumoSemanalDados | null) ?? null;
}

/**
 * Teste vai para o WhatsApp do perfil de quem está logado — a função resolve
 * o número pelo JWT, a UI não manda telefone nenhum.
 */
export async function enviarResumoTeste(params: { modelo: ModeloResumo }): Promise<ResultadoEnvioResumo> {
  const { data, error } = await supabase.functions.invoke("resumo-semanal", {
    body: { tipo: "teste", modelo: params.modelo },
  });
  if (error) {
    // Erro 4xx da função chega como FunctionsHttpError; a mensagem útil está no corpo.
    const ctx = (error as { context?: Response }).context;
    const corpo = ctx && typeof ctx.json === "function" ? await ctx.json().catch((): null => null) : null;
    throw new Error(corpo?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as ResultadoEnvioResumo;
}
