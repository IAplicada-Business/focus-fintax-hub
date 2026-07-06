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
  name: "list_clientes",
  title: "List clientes",
  description: "List clientes (accounts) with optional name/CNPJ search. Returns up to 50 rows.",
  inputSchema: {
    search: z.string().optional().describe("Substring to match against razão social or CNPJ."),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("clientes")
      .select("id, razao_social, cnpj, segmento, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (search) q = q.or(`razao_social.ilike.%${search}%,cnpj.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { clientes: data ?? [] },
    };
  },
});
