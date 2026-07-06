import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeadsTool from "./tools/list-leads";
import listClientesTool from "./tools/list-clientes";
import listIntimacoesTool from "./tools/list-intimacoes";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "focus-fintax-mcp",
  title: "Focus Fintax MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Focus Fintax CRM: list leads in the sales pipeline, list clientes (accounts), and list tax intimações. All queries run as the signed-in user under Row-Level Security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeadsTool, listClientesTool, listIntimacoesTool],
});
