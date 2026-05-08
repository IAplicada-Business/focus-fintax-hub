import { supabase } from "@/integrations/supabase/client";
import type { ScreenPermission } from "@/lib/screen-permissions";

export interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  cargo: string;
  is_active: boolean;
  role: string;
}

export async function listUsers(): Promise<UserRow[]> {
  const [{ data: profiles, error }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, email, cargo, is_active"),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (error) throw error;

  const roleMap = new Map<string, string>();
  roles?.forEach((r) => roleMap.set(r.user_id, r.role));

  return (profiles ?? []).map((p) => ({
    ...p,
    role: roleMap.get(p.user_id) ?? "visualizador",
  }));
}

export async function loadUserPermissions(userId: string): Promise<ScreenPermission[]> {
  const { data } = await supabase
    .from("user_permissions")
    .select("screen_key, can_access, read_only")
    .eq("user_id", userId);
  return (data as ScreenPermission[]) ?? [];
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const { error } = await supabase.from("profiles").update({ is_active: !isActive }).eq("user_id", userId);
  if (error) throw error;
}

export async function manageUser(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-users", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
