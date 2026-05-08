import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Intimacao = Database["public"]["Tables"]["intimacoes"]["Row"];

export async function listIntimacoes() {
  const { data, error } = await supabase
    .from("intimacoes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Intimacao[];
}

export async function deleteIntimacao(id: string) {
  const { error } = await supabase.from("intimacoes").delete().eq("id", id);
  if (error) throw error;
}
