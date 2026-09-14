import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runMetaSync, type MetaSyncType } from "@/services/metaSyncService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Última falha ainda "ativa" (sem sync bem-sucedida da mesma função depois dela). */
export function useMetaLastFailure() {
  return useQuery({
    queryKey: ["meta", "last-failure"],
    queryFn: async () => {
      const { data: lastFail, error: failError } = await supabase
        .from("meta_execution_log")
        .select("function_name, started_at, finished_at, ok, error_text")
        .eq("ok", false)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (failError) throw failError;
      if (!lastFail) return null;

      // Já rodou com sucesso essa mesma função depois dessa falha? Problema resolvido, não mostra mais.
      const { data: laterSuccess, error: successError } = await supabase
        .from("meta_execution_log")
        .select("id")
        .eq("function_name", lastFail.function_name)
        .eq("ok", true)
        .gt("started_at", lastFail.started_at)
        .limit(1)
        .maybeSingle();
      if (successError) throw successError;

      return laterSuccess ? null : lastFail;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Última execução bem-sucedida (any function) */
export function useMetaLastSync() {
  return useQuery({
    queryKey: ["meta", "last-sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_execution_log")
        .select("function_name, started_at, finished_at, ok, rows_affected")
        .eq("ok", true)
        .order("finished_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMetaSyncMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: MetaSyncType = "both") => runMetaSync(type),
    onSuccess: (results) => {
      const okAll = results.every((r) => r.ok);
      const total = results.reduce((s, r) => s + (r.rows_affected ?? 0), 0);
      if (okAll) {
        toast.success("Sync concluído", {
          description: `${total} registros atualizados (${results.map((r) => r.function_name.replace("meta-sync-", "")).join(", ")})`,
        });
      } else {
        const failed = results.filter((r) => !r.ok).map((r) => r.function_name).join(", ");
        toast.error("Sync com erro", { description: `Falha em: ${failed}` });
      }
      qc.invalidateQueries({ queryKey: ["meta"] });
    },
    onError: (err) => {
      toast.error("Erro ao sincronizar", { description: String(err) });
    },
  });
}
