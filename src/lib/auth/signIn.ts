/**
 * Shared email/password sign-in helper.
 *
 * Wraps the SAME primitives the /login page uses (captcha-verify edge
 * function + `supabase.auth.signInWithPassword`) so that the marketplace
 * `AuthDialog` and the full-page login stay on one implementation.
 * No new state, no new endpoints, no bypass of Turnstile.
 */
import { supabase } from "@/integrations/supabase/client";

export type SignInInput = {
  email: string;
  password: string;
  captchaToken: string;
};

export type SignInResult =
  | { ok: true }
  | { ok: false; kind: "captcha" | "credentials" | "unknown"; message: string };

export async function performEmailSignIn({ email, password, captchaToken }: SignInInput): Promise<SignInResult> {
  if (!captchaToken) return { ok: false, kind: "captcha", message: "Missing captcha token" };

  const { data: verify, error: verifyErr } = await supabase.functions.invoke("captcha-verify", {
    body: { token: captchaToken, action: "signin" },
  });
  if (verifyErr || !verify?.success) {
    return { ok: false, kind: "captcha", message: "Captcha verification failed" };
  }

  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return { ok: false, kind: "credentials", message: error.message };
  }
  return { ok: true };
}

/** Reproduce /login's role-based destination so redirect-after-login stays consistent. */
export async function resolvePostLoginDestination(fallback = "/"): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fallback;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const r = ((roles ?? []) as { role: string }[]).map((x) => x.role);
  if (r.includes("super_admin") || r.includes("admin")) return "/admin";
  if (r.includes("employee")) return "/employee";
  if (r.includes("provider")) return "/provider-dashboard";
  return fallback;
}
