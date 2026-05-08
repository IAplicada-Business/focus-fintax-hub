import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type MotorTese = Database["public"]["Tables"]["motor_teses_config"]["Row"];
type MotorTeseInsert = Database["public"]["Tables"]["motor_teses_config"]["Insert"];
type MotorTeseUpdate = Database["public"]["Tables"]["motor_teses_config"]["Update"];

export async function listTeses() {
  const { data, error } = await supabase
    .from("motor_teses_config")
    .select("*")
    .order("ordem_exibicao", { ascending: true });
  if (error) throw error;
  return data as MotorTese[];
}

export async function upsertTese(tese: MotorTeseInsert & { id?: string }, isUpdate: boolean) {
  if (isUpdate && tese.id) {
    const { error } = await supabase.from("motor_teses_config").update(tese as MotorTeseUpdate).eq("id", tese.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("motor_teses_config").insert(tese);
    if (error) throw error;
  }
}

export async function toggleTeseAtivo(id: string, ativo: boolean) {
  const { error } = await supabase
    .from("motor_teses_config")
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
