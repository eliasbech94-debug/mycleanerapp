// POST /provider-photo-moderate
// Body: { photo_path: string }
//
// Asynchronous quality/content moderation of the provider profile photo.
// This model NEVER performs identity, liveness or face matching — that is
// exclusively Sumsub's job. It only judges photo quality and content policy.
// No biometric templates or embeddings are stored: only a verdict, reason
// codes, confidence, model name/version and timestamp.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { evaluateProviderApproval } from "../_shared/providerApproval.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODEL = "google/gemini-2.5-flash";
const MODEL_VERSION = "photo-moderation-v1";

const ALLOWED_REASONS = new Set([
  "no_face", "multiple_faces", "face_not_clear", "too_dark", "blurry",
  "low_resolution", "sunglasses_or_covered", "screenshot", "avatar_or_illustration",
  "logo_or_text", "advertising", "violence", "sexual_content", "hate_symbol",
  "likely_ai_generated", "not_a_photo_of_a_person",
]);

interface Verdict {
  verdict: "approved" | "rejected" | "manual_review";
  confidence: number;
  reason_codes: string[];
  message_da: string;
}

const SYSTEM_PROMPT = `You moderate profile photos for a home-services marketplace.
Judge ONLY photo quality and content policy. You must NOT attempt identity
recognition, liveness detection or face matching, and you must not describe
who the person is.

Approve only when ALL of these hold:
- exactly one clearly visible human face
- adequate lighting, sharpness and resolution
- no violence, sexual content, discriminatory or hateful symbols
- no overlaid text, logos, watermarks or advertising
- not a group photo, screenshot, avatar, illustration, logo or an obviously
  AI-generated / fake portrait

Return STRICT JSON only:
{"verdict":"approved"|"rejected"|"manual_review","confidence":0-1,
 "reason_codes":["..."],"message_da":"kort venlig forklaring på dansk"}

Use "manual_review" whenever you are uncertain or confidence would be below 0.75.
Allowed reason_codes: no_face, multiple_faces, face_not_clear, too_dark, blurry,
low_resolution, sunglasses_or_covered, screenshot, avatar_or_illustration,
logo_or_text, advertising, violence, sexual_content, hate_symbol,
likely_ai_generated, not_a_photo_of_a_person.`;

async function moderate(imageUrl: string, apiKey: string): Promise<Verdict> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Moderate this profile photo." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ai_gateway_${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("unparseable_model_output");
  const parsed = JSON.parse(match[0]) as Partial<Verdict>;

  const confidence = Number(parsed.confidence);
  const codes = (parsed.reason_codes ?? []).filter((c) => ALLOWED_REASONS.has(c));
  let verdict: Verdict["verdict"] =
    parsed.verdict === "approved" || parsed.verdict === "rejected" ? parsed.verdict : "manual_review";
  // Low confidence or missing confidence → manual review (never auto-approve).
  if (!Number.isFinite(confidence) || confidence < 0.75) verdict = "manual_review";
  if (verdict === "approved" && codes.length > 0) verdict = "manual_review";

  return {
    verdict,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    reason_codes: codes,
    message_da: typeof parsed.message_da === "string" ? parsed.message_da.slice(0, 400) : "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => ({}));
  const photoPath = typeof body?.photo_path === "string" ? body.photo_path.trim() : "";
  if (!photoPath || photoPath.length > 2000) return json({ error: "invalid_photo_path" }, 400);

  const { data: pp } = await ctx.admin.from("provider_profiles")
    .select("user_id, photo_path").eq("user_id", ctx.user.id).maybeSingle();
  if (!pp) return json({ error: "provider_profile_missing" }, 404);
  if (pp.photo_path !== photoPath) return json({ error: "photo_path_mismatch" }, 409);

  // Mark pending immediately so the UI can show "under review".
  await ctx.admin.rpc("apply_provider_photo_moderation", {
    _uid: ctx.user.id, _photo_path: photoPath, _status: "pending",
    _reason_codes: [], _confidence: null, _model: MODEL,
    _model_version: MODEL_VERSION, _message: null,
  });
  await evaluateProviderApproval(ctx.admin, ctx.user.id, "photo_uploaded");

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("photo_moderation_unconfigured");
    return json({ status: "pending", note: "moderation_unconfigured" }, 202);
  }

  let verdict: Verdict;
  try {
    verdict = await moderate(photoPath, apiKey);
  } catch (e) {
    // Fail closed: any error keeps the photo out of public view.
    console.error("photo_moderation_failed", (e as Error).message);
    verdict = {
      verdict: "manual_review",
      confidence: 0,
      reason_codes: [],
      message_da: "Vi kunne ikke vurdere billedet automatisk. En medarbejder kigger på det.",
    };
  }

  await ctx.admin.rpc("apply_provider_photo_moderation", {
    _uid: ctx.user.id,
    _photo_path: photoPath,
    _status: verdict.verdict,
    _reason_codes: verdict.reason_codes,
    _confidence: verdict.confidence,
    _model: MODEL,
    _model_version: MODEL_VERSION,
    _message: verdict.message_da,
  });

  console.log(JSON.stringify({
    evt: "provider_photo.moderated",
    user_id: ctx.user.id,
    status: verdict.verdict,
    reason_codes: verdict.reason_codes,
    confidence: verdict.confidence,
    model: MODEL,
    at: new Date().toISOString(),
  }));

  const approval = await evaluateProviderApproval(ctx.admin, ctx.user.id, "photo_moderated");

  return json({
    status: verdict.verdict,
    reason_codes: verdict.reason_codes,
    message: verdict.message_da,
    approval_state: approval?.state ?? null,
  });
});
