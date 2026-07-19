import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_cleaners",
  title: "Search cleaners",
  description: "Search MyCleaner providers by country code (ISO-2). Returns active providers only.",
  inputSchema: {
    country_code: z.string().length(2).describe("ISO-2 country code, e.g. DK, GB, SE, ES."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows. Default 20."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ country_code, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("profiles")
      .select("provider_id, full_name, country_code, address, tax_type")
      .not("provider_id", "is", null)
      .is("deactivated_at", null)
      .eq("country_code", country_code.toUpperCase())
      .limit(limit ?? 20);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { providers: data ?? [] },
    };
  },
});
