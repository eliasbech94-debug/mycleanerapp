import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are MyCleaner Assist, a conservative cleaning-safety decision assistant for professional cleaners.
Return JSON only. Never claim certainty from an image. Never recommend mixing chemicals. Never recommend chlorine/bleach together with acids, descalers, ammonia or unknown products.
Classify risk as green, yellow or red. Red means stop work and contact support. Use red for unknown chemicals, hazardous symbols that cannot be read, bodily fluids, needles, suspected asbestos, significant mould, electrical risk, valuable/delicate unknown surfaces, fumes, burns, eye exposure, or any condition where harm may increase.
For yellow, require a hidden-spot test and ask clarifying questions. For green, still include a hidden-spot test when surface damage is possible.
Do not diagnose mould/asbestos or identify substances as fact. Use 'possible' or 'appears consistent with'.
Output schema: {
  risk_level: 'green'|'yellow'|'red',
  confidence: number 0..1,
  detected_surface: string,
  detected_issue: string,
  summary: string,
  steps: string[],
  avoid: string[],
  safety: string[],
  follow_up_questions: string[],
  escalation_reason: string|null
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Unauthorized");

    const body = await req.json();
    const { session_id, booking_id, area, notes, images } = body ?? {};
    if (!session_id || !booking_id || !area || !Array.isArray(images) || images.length < 1) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: session, error: sessionError } = await userClient
      .from("provider_assist_sessions")
      .select("id, booking_id, created_by")
      .eq("id", session_id)
      .eq("booking_id", booking_id)
      .single();
    if (sessionError || !session || session.created_by !== userData.user.id) throw new Error("Forbidden");

    await userClient.from("provider_assist_sessions").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", session_id);

    const imageParts = images.slice(0, 4).map((image: { data_url: string; kind?: string }) => ({
      type: "image_url",
      image_url: { url: image.data_url, detail: "high" },
    }));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("PROVIDER_ASSIST_MODEL") || "gpt-4.1-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Area: ${area}\nProvider notes: ${notes || "None"}\nAnalyze conservatively and answer in Danish.` },
              ...imageParts,
            ],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const aiPayload = await response.json();
    const parsed = JSON.parse(aiPayload.choices?.[0]?.message?.content || "{}");

    const risk = ["green", "yellow", "red"].includes(parsed.risk_level) ? parsed.risk_level : "red";
    const guidance = {
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      safety: Array.isArray(parsed.safety) ? parsed.safety : [],
      follow_up_questions: Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions : [],
    };

    const update = {
      status: risk === "red" ? "escalated" : "completed",
      risk_level: risk,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      detected_surface: String(parsed.detected_surface || "Ukendt overflade"),
      detected_issue: String(parsed.detected_issue || "Ukendt problem"),
      summary: String(parsed.summary || "Analysen kunne ikke afgøre situationen sikkert."),
      guidance,
      warnings: guidance.avoid,
      escalation_reason: parsed.escalation_reason ? String(parsed.escalation_reason) : null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin.from("provider_assist_sessions").update(update).eq("id", session_id);
    if (updateError) throw updateError;

    await admin.from("provider_assist_events").insert({
      session_id,
      actor_user_id: userData.user.id,
      event_type: risk === "red" ? "analysis_escalated" : "analysis_completed",
      metadata: { risk_level: risk, confidence: update.confidence },
    });

    return new Response(JSON.stringify({ session_id, ...update }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
