/**
 * Crisp AI-first support layer.
 *
 * Crisp calls this webhook on every inbound visitor message. We answer with
 * MyCleaner's own AI (Lovable AI Gateway) through the Crisp REST API, and hand
 * the conversation over to a human whenever the AI decides it should — or when
 * the visitor asks for a human.
 *
 * Security:
 * - Shared-secret token in the query string (`?token=CRISP_WEBHOOK_SECRET`).
 * - Only reacts to visitor text messages on our own website id.
 * - Idempotent: a message fingerprint is checked against conversation meta so
 *   Crisp retries never produce duplicate answers.
 */
import { generateText, tool, stepCountIs } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRISP_API = "https://api.crisp.chat/v1";

const SYSTEM_PROMPT = `Du er MyCleaner's support-assistent. MyCleaner er en europæisk markedsplads, der forbinder kunder med selvstændige rengøringspartnere (cleanere). MyCleaner er kun en platform — aldrig arbejdsgiver eller udbyder af selve rengøringen.

Svar på brugerens sprog (dansk som standard, ellers svensk, tysk, spansk eller engelsk).

Regler:
- Hold svar korte og konkrete (maks 3-4 linjer).
- Gæt aldrig på priser, gebyrer, datoer eller kontooplysninger. Kender du ikke svaret præcist, så eskalér.
- Brug altid værktøjet "escalate_to_human" ved: klager, refunderinger, tvister, betalingsfejl, skader, sikkerhed, GDPR/sletning, eller hvis brugeren beder om et menneske.
- Lov aldrig kompensation eller refusion. Det afgør et menneske.
- Bed aldrig om kortnumre, CPR/CVR eller adgangskoder.`;

function crispAuthHeader(): string {
  const id = Deno.env.get("CRISP_IDENTIFIER")!;
  const key = Deno.env.get("CRISP_KEY")!;
  return `Basic ${btoa(`${id}:${key}`)}`;
}

async function crispFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${CRISP_API}${path}`, {
    ...init,
    headers: {
      Authorization: crispAuthHeader(),
      "X-Crisp-Tier": "plugin",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function sendOperatorMessage(websiteId: string, sessionId: string, content: string) {
  const res = await crispFetch(`/website/${websiteId}/conversation/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({
      type: "text",
      from: "operator",
      origin: "chat",
      content,
      user: { nickname: "MyCleaner Assistent" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`crisp send failed [${res.status}]: ${body}`);
  }
}

async function setState(websiteId: string, sessionId: string, state: "pending" | "unresolved" | "resolved") {
  const res = await crispFetch(`/website/${websiteId}/conversation/${sessionId}/state`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
  if (!res.ok) console.error(`crisp state failed [${res.status}]: ${await res.text()}`);
}

async function getConversation(websiteId: string, sessionId: string) {
  const res = await crispFetch(`/website/${websiteId}/conversation/${sessionId}`);
  if (!res.ok) return null;
  return (await res.json())?.data ?? null;
}

async function getMessages(websiteId: string, sessionId: string) {
  const res = await crispFetch(`/website/${websiteId}/conversation/${sessionId}/messages`);
  if (!res.ok) return [];
  return ((await res.json())?.data ?? []) as Array<Record<string, unknown>>;
}

async function updateMeta(websiteId: string, sessionId: string, data: Record<string, string>) {
  const res = await crispFetch(`/website/${websiteId}/conversation/${sessionId}/meta`, {
    method: "PATCH",
    body: JSON.stringify({ data }),
  });
  if (!res.ok) console.error(`crisp meta failed [${res.status}]: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const expected = Deno.env.get("CRISP_WEBHOOK_SECRET");
    if (!expected || url.searchParams.get("token") !== expected) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    if (!Deno.env.get("CRISP_IDENTIFIER") || !Deno.env.get("CRISP_KEY")) {
      return new Response("Crisp API credentials missing", { status: 500, headers: corsHeaders });
    }

    const payload = await req.json();
    const event = payload?.event as string | undefined;
    const data = payload?.data ?? {};
    const websiteId = data.website_id as string | undefined;
    const sessionId = data.session_id as string | undefined;

    // Only answer plain-text messages written by the visitor.
    if (event !== "message:send" || data.from !== "user" || data.type !== "text" || !websiteId || !sessionId) {
      return new Response(JSON.stringify({ ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversation = await getConversation(websiteId, sessionId);
    const meta = conversation?.meta ?? {};
    const metaData = (meta.data ?? {}) as Record<string, string>;

    // A human has taken over — the AI stays quiet from then on.
    if (metaData.ai_handover === "human") {
      return new Response(JSON.stringify({ handed_over: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: Crisp retries deliver the same fingerprint.
    const fingerprint = String(data.fingerprint ?? data.timestamp ?? "");
    if (fingerprint && metaData.ai_last_fingerprint === fingerprint) {
      return new Response(JSON.stringify({ duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500, headers: corsHeaders });

    // Full history — the model is stateless, so every prior turn is resent.
    const history = await getMessages(websiteId, sessionId);
    const messages = history
      .filter((m) => m.type === "text" && typeof m.content === "string")
      .slice(-30)
      .map((m) => ({
        role: m.from === "user" ? ("user" as const) : ("assistant" as const),
        content: String(m.content),
      }));
    if (!messages.length) messages.push({ role: "user", content: String(data.content ?? "") });

    const contextLines = Object.entries(metaData)
      .filter(([k]) => !k.startsWith("ai_"))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const gateway = createLovableAiGatewayProvider(apiKey);
    let escalated = false;

    const result = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: `${SYSTEM_PROMPT}\n\nKontekst om brugeren:\n${contextLines || "(ingen kontekst)"}\nEmail: ${meta.email ?? "ukendt"}\nNavn: ${meta.nickname ?? "ukendt"}`,
      messages,
      stopWhen: stepCountIs(50),
      tools: {
        escalate_to_human: tool({
          description:
            "Eskalér samtalen til et menneskeligt supportteam. Brug ved klager, refunderinger, tvister, betalingsfejl, skader, sikkerhed, GDPR, eller når brugeren beder om et menneske.",
          inputSchema: z.object({
            reason: z.string().describe("Kort begrundelse for eskalering."),
            urgency: z.enum(["low", "normal", "high"]).default("normal"),
          }),
          execute: async ({ reason, urgency }) => {
            escalated = true;
            await setState(websiteId, sessionId, "unresolved");
            await updateMeta(websiteId, sessionId, {
              ai_handover: "human",
              ai_handover_reason: reason.slice(0, 200),
              ai_handover_urgency: urgency,
            });
            return { ok: true };
          },
        }),
      },
    });

    const reply =
      result.text?.trim() ||
      (escalated
        ? "Jeg sender dig videre til en af vores medarbejdere. Du hører fra os hurtigst muligt."
        : "Jeg er ikke helt sikker på svaret — jeg sender dig videre til en medarbejder.");

    await sendOperatorMessage(websiteId, sessionId, reply);
    await updateMeta(websiteId, sessionId, {
      ai_last_fingerprint: fingerprint,
      ai_answered_at: new Date().toISOString(),
    });
    if (!escalated) await setState(websiteId, sessionId, "pending");

    return new Response(JSON.stringify({ ok: true, escalated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crisp-webhook error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
