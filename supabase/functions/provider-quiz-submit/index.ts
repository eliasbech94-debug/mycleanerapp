// POST /provider-quiz-submit
// Body: { answers: Record<string,string> }
// Scores the mandatory provider quiz server-side and re-runs the approval engine.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { PROVIDER_QUIZ_KEY, scoreQuiz } from "../_shared/providerQuiz.ts";
import { evaluateProviderApproval } from "../_shared/providerApproval.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => ({}));
  const answers = (body?.answers ?? null) as Record<string, string> | null;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return json({ error: "invalid_answers" }, 400);
  }
  if (Object.keys(answers).length > 50) return json({ error: "invalid_answers" }, 400);

  const { data: pp } = await ctx.admin.from("provider_profiles")
    .select("user_id").eq("user_id", ctx.user.id).maybeSingle();
  if (!pp) return json({ error: "provider_profile_missing" }, 404);

  const result = scoreQuiz(answers);
  const { error } = await ctx.admin.rpc("apply_provider_quiz_result", {
    _uid: ctx.user.id,
    _quiz_key: PROVIDER_QUIZ_KEY,
    _score: result.score,
    _max_score: result.max,
    _passed: result.passed,
    _answers: answers,
  });
  if (error) {
    console.error("quiz_persist_failed", error.message);
    return json({ error: "internal_error" }, 500);
  }

  const approval = await evaluateProviderApproval(ctx.admin, ctx.user.id, "quiz_submitted");
  return json({
    score: result.score,
    max: result.max,
    passed: result.passed,
    approval_state: approval?.state ?? null,
  });
});
