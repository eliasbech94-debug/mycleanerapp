import { createClient } from "npm:@supabase/supabase-js@2";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { runHealthCheck, upsertNotifications } from "../_shared/notifications.ts";
import { buildMyCleanerVoicePrompt } from "../_shared/mycleaner-voice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORT_PROMPT = `Du er MyCleaner support-assistent.

Du hjælper kunder med spørgsmål om:
- Bookinger, ændringer og afbestillinger
- Betaling, fakturaer og refunderinger
- Adgang, kæledyr og andre praktiske detaljer
- Klager over rengøring eller cleaner

Retningslinjer:
- Hold svar korte (maks. 3-4 linjer), medmindre brugeren beder om detaljer.
- Brug markdown, når det gør svaret lettere at læse.
- Hvis sagen er en klage, et refunderingsspørgsmål, en tvist eller noget, du ikke kan løse, skal du bruge værktøjet "escalate_to_human" og forklare roligt, at en medarbejder tager over.
- Hvis du opdager problemer med brugerens opsætning, skal du køre "run_account_check" først.
- Brug "notify_customer" til én relevant, handlingsorienteret besked, når brugeren bør reagere.
- Spørg ikke efter personlige oplysninger ud over det, der allerede findes i samtalen.
- Sig aldrig, at du er ChatGPT eller en sprogmodel. Du er MyCleaners digitale supportassistent.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500, headers: corsHeaders });

    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const body = await req.json();
    const messages = body.messages as UIMessage[];
    const threadId = body.threadId as string;
    const topic = (body.topic as "support" | "complaint") ?? "support";

    if (!threadId || !Array.isArray(messages)) {
      return new Response("Bad request", { status: 400, headers: corsHeaders });
    }

    const { data: thread } = await supabase
      .from("support_threads")
      .select("id, user_id, status, topic, subject")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread || thread.user_id !== user.id) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const text = (lastUser.parts ?? [])
        .map((p: any) => (p.type === "text" ? p.text : ""))
        .join("");
      await supabase.from("support_messages").insert({
        thread_id: threadId,
        user_id: user.id,
        role: "user",
        content: text,
        parts: lastUser.parts ?? null,
      });
      if (thread.subject === "Ny henvendelse" && text) {
        await supabase
          .from("support_threads")
          .update({ subject: text.slice(0, 80), last_message_at: new Date().toISOString() })
          .eq("id", threadId);
      } else {
        await supabase
          .from("support_threads")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", threadId);
      }
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const system = `${buildMyCleanerVoicePrompt(topic === "complaint" ? "empathetic" : "standard")}\n\n${SUPPORT_PROMPT}\n\nKontekst: Emne = ${topic === "complaint" ? "Klage" : "Support"}. Bruger-email: ${user.email ?? "ukendt"}.`;

    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(50),
      tools: {
        escalate_to_human: tool({
          description:
            "Eskaler sagen til et menneskeligt supportteam. Brug ved klager, refunderingskrav, tvister eller problemer, du ikke kan løse sikkert.",
          inputSchema: z.object({
            reason: z.string().describe("Kort, neutral begrundelse for eskalering på dansk."),
          }),
          execute: async ({ reason }) => {
            await supabase
              .from("support_threads")
              .update({ status: "escalated" })
              .eq("id", threadId);
            return {
              ok: true,
              message: `Sagen er sendt videre til vores supportteam. Begrundelse: ${reason}. En medarbejder følger op inden for 24 timer på hverdage.`,
            };
          },
        }),
        run_account_check: tool({
          description:
            "Scan brugerens konto for opsætningsproblemer som manglende telefon, ugyldig e-mail, adgangsinfo, kommende bookinger eller glemte svar. Opretter relevante notifikationer.",
          inputSchema: z.object({}),
          execute: async () => {
            const drafts = await runHealthCheck(supabase, user.id, user.email ?? null);
            const created = await upsertNotifications(supabase, user.id, drafts);
            return {
              ok: true,
              found: drafts.length,
              created,
              issues: drafts.map((d) => ({ title: d.title, severity: d.severity })),
            };
          },
        }),
        notify_customer: tool({
          description:
            "Send en kort, relevant notifikation til brugerens indbakke, når brugeren bør handle. Brug MyCleaner-stilen og send højst én notifikation pr. emne.",
          inputSchema: z.object({
            title: z.string().describe("Kort overskrift på dansk, maks. 60 tegn."),
            body: z.string().describe("Kort og hjælpsom tekst på dansk, 1-2 sætninger."),
            kind: z.enum(["setup", "reminder", "cleaner_message", "tip", "alert"]).describe("Type."),
            severity: z.enum(["info", "warning", "error", "success"]).default("info"),
            action_label: z.string().optional().describe("Tydelig knaptekst, fx 'Ret telefonnummer'."),
            action_url: z.string().optional().describe("Intern app-sti, fx '/profil?tab=info'."),
            dedupe_key: z.string().describe("Unik nøgle, der forhindrer dubletter, fx 'ai:phone-typo'."),
          }),
          execute: async (input) => {
            const created = await upsertNotifications(supabase, user.id, [
              {
                kind: input.kind,
                severity: input.severity,
                title: input.title,
                body: input.body,
                action_label: input.action_label,
                action_url: input.action_url,
                dedupe_key: input.dedupe_key,
                related_thread_id: threadId,
              },
            ]);
            return { ok: true, created };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        try {
          const text = (responseMessage.parts ?? [])
            .map((p: any) => (p.type === "text" ? p.text : ""))
            .join("");
          await supabase.from("support_messages").insert({
            thread_id: threadId,
            user_id: user.id,
            role: "assistant",
            content: text,
            parts: responseMessage.parts ?? null,
          });
          await supabase
            .from("support_threads")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", threadId);
        } catch (e) {
          console.error("persist assistant failed", e);
        }
      },
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("support-chat error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
