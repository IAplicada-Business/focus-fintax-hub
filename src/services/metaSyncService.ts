import { supabase } from "@/integrations/supabase/client";

export type MetaSyncType = "structure" | "insights" | "both";

interface SyncResult {
  function_name: string;
  ok: boolean;
  rows_affected: number | null;
  error_text: string | null;
}

async function invokeSync(name: "meta-sync-structure" | "meta-sync-insights"): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke(name, { body: {} });
  if (error) {
    return { function_name: name, ok: false, rows_affected: null, error_text: error.message };
  }
  const ok = data?.ok ?? true;
  const rows = data?.inserted ?? (data ? Object.values(data as Record<string, unknown>).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0) : 0);
  return { function_name: name, ok, rows_affected: rows, error_text: ok ? null : JSON.stringify(data) };
}

export async function runMetaSync(type: MetaSyncType = "both"): Promise<SyncResult[]> {
  const tasks: Promise<SyncResult>[] = [];
  if (type === "structure" || type === "both") tasks.push(invokeSync("meta-sync-structure"));
  if (type === "insights"  || type === "both") tasks.push(invokeSync("meta-sync-insights"));
  return Promise.all(tasks);
}
