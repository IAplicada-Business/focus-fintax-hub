import { supabase } from "@/integrations/supabase/client";

export type InboxConversa = {
  telefone: string;
  bot_ativo: boolean;
  atualizado_em: string;
  ultima_texto: string | null;
  ultima_em: string | null;
  ultima_origem: "humano" | "bot" | null;
  ultima_direcao: "entrada" | "saida" | null;
};

export async function listConversasInbox(): Promise<InboxConversa[]> {
  const db = supabase as any;

  const { data: conversas, error } = await db
    .from("atendimento_conversas")
    .select("telefone, bot_ativo, atualizado_em")
    .order("atualizado_em", { ascending: false });

  if (error) throw error;

  const { data: mensagens, error: msgErr } = await db
    .from("atendimento_mensagens")
    .select("telefone, texto, origem, direcao, criado_em")
    .order("criado_em", { ascending: false })
    .limit(800);

  if (msgErr) throw msgErr;

  const ultimaPorTel = new Map<
    string,
    { texto: string | null; criado_em: string; origem: "humano" | "bot" | null; direcao: "entrada" | "saida" | null }
  >();
  for (const m of mensagens ?? []) {
    if (!ultimaPorTel.has(m.telefone)) {
      ultimaPorTel.set(m.telefone, {
        texto: m.texto,
        criado_em: m.criado_em,
        origem: m.origem ?? null,
        direcao: m.direcao,
      });
    }
  }

  return (conversas ?? []).map((c: { telefone: string; bot_ativo: boolean; atualizado_em: string }) => {
    const ultima = ultimaPorTel.get(c.telefone);
    return {
      telefone: c.telefone,
      bot_ativo: c.bot_ativo,
      atualizado_em: c.atualizado_em,
      ultima_texto: ultima?.texto ?? null,
      ultima_em: ultima?.criado_em ?? c.atualizado_em,
      ultima_origem: ultima?.origem ?? null,
      ultima_direcao: ultima?.direcao ?? null,
    };
  });
}
