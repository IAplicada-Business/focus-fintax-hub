import { supabase } from "@/integrations/supabase/client";

export type InboxConversa = {
  telefone: string;
  bot_ativo: boolean;
  atualizado_em: string;
  ultima_texto: string | null;
  ultima_em: string | null;
  ultima_origem: "humano" | "bot" | null;
  ultima_direcao: "entrada" | "saida" | null;
  /** Conceito de "responsável" do schema: quem assumiu esta conversa (atendimento_conversas.assumido_por). */
  assumido_por: string | null;
  assumido_por_nome: string | null;
  assumido_em: string | null;
};

export async function listConversasInbox(): Promise<InboxConversa[]> {
  const { data: conversas, error } = await supabase
    .from("atendimento_conversas")
    .select("telefone, bot_ativo, atualizado_em, assumido_por, assumido_em")
    .order("atualizado_em", { ascending: false });

  if (error) throw error;

  const { data: mensagens, error: msgErr } = await supabase
    .from("atendimento_mensagens")
    .select("telefone, texto, origem, direcao, criado_em")
    .order("criado_em", { ascending: false })
    .limit(800);

  if (msgErr) throw msgErr;

  const responsavelIds = [...new Set((conversas ?? []).map((c) => c.assumido_por).filter(Boolean))] as string[];
  const nomePorId = new Map<string, string>();
  if (responsavelIds.length > 0) {
    const { data: perfis } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", responsavelIds);
    for (const p of perfis ?? []) nomePorId.set(p.user_id, p.full_name);
  }

  const ultimaPorTel = new Map<
    string,
    { texto: string | null; criado_em: string; origem: "humano" | "bot" | null; direcao: "entrada" | "saida" | null }
  >();
  for (const m of mensagens ?? []) {
    if (!ultimaPorTel.has(m.telefone)) {
      ultimaPorTel.set(m.telefone, {
        texto: m.texto,
        criado_em: m.criado_em,
        origem: (m.origem as "humano" | "bot") ?? null,
        direcao: m.direcao as "entrada" | "saida",
      });
    }
  }

  return (conversas ?? []).map((c) => {
    const ultima = ultimaPorTel.get(c.telefone);
    return {
      telefone: c.telefone,
      bot_ativo: c.bot_ativo,
      atualizado_em: c.atualizado_em,
      ultima_texto: ultima?.texto ?? null,
      ultima_em: ultima?.criado_em ?? c.atualizado_em,
      ultima_origem: ultima?.origem ?? null,
      ultima_direcao: ultima?.direcao ?? null,
      assumido_por: c.assumido_por,
      assumido_por_nome: c.assumido_por ? nomePorId.get(c.assumido_por) ?? null : null,
      assumido_em: c.assumido_em,
    };
  });
}

/** Marca o usuário atual como responsável pela conversa deste telefone. */
export async function assumirAtendimento(telefone: string, userId: string) {
  const { error } = await supabase
    .from("atendimento_conversas")
    .update({ assumido_por: userId, assumido_em: new Date().toISOString() })
    .eq("telefone", telefone);
  if (error) throw error;
}

/** Libera a conversa (sem responsável atribuído). */
export async function liberarAtendimento(telefone: string) {
  const { error } = await supabase
    .from("atendimento_conversas")
    .update({ assumido_por: null, assumido_em: null })
    .eq("telefone", telefone);
  if (error) throw error;
}
