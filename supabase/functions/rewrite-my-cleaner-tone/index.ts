import { createClient } from "npm:@supabase/supabase-js@2";
import { generateText } from "npm:ai";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { buildMyCleanerVoicePrompt, type MyCleanerTone } from "../_shared/mycleaner-voice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedTones = new Set<MyCleanerTone>([
  "standard",
  "friendly",
  "empathetic",
  "professional",
  "enthusiastic",
  "legal",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
    );

    const { data: userResult } = await userClient.auth.getUser();
    const user = userResult?.user;
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: staffRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["super_admin", "admin", "support"])
      .limit(1);

    if (!staffRoles?.length) return new Response("Forbidden", { status: 403, headers: corsHeaders });

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const requestedTone = body.tone as MyCleanerTone | undefined;
    const tone: MyCleanerTone = requestedTone && allowedTones.has(requestedTone) ? requestedTone : "standard";
    const language = typeof body.language === "string" && body.language.trim() ? body.language.trim() : "samme sprog som originalen";

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 5000) {
      return new Response(JSON.stringify({ error: "Text is too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500, headers: corsHeaders });

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");
    const { text: rewritten } = await generateText({
      model,
      system: `${buildMyCleanerVoicePrompt(tone)}\n\nDu omskriver et medarbejderudkast. Returnér kun den færdige besked, uden forklaring, citationstegn eller overskrift. Målsprog: ${language}.`,
      prompt: text,
    });

    return new Response(JSON.stringify({ text: rewritten.trim(), tone }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("rewrite-my-cleaner-tone error", error);
    return new Response(JSON.stringify({ error: "Kunne ikke forbedre teksten" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
