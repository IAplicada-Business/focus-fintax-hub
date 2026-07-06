import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_leads",
  title: "List leads",
  description:
    "List leads from the CRM pipeline, optionally filtered by funnel status. Returns the 50 most recent.",
  inputSchema: {
    status_funil: z
      .string()
      .optional()
      .describe("Optional funnel status filter (e.g. 'novo', 'qualificado', 'contrato_emitido')."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status_funil, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("leads")
      .select("id, nome, email, telefone, cnpj, razao_social, segmento, status_funil, faturamento_mensal_estimado, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status_funil) q = q.eq("status_funil", status_funil);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});
