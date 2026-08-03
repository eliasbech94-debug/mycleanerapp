/**
 * Presentation-only mapping of auth errors to calm, human Danish copy.
 *
 * No auth logic lives here — callers still perform the exact same Supabase
 * calls; this only decides what the *user* reads instead of a raw technical
 * provider message.
 */
export type AuthMode = "signin" | "signup" | "forgot";

const PATTERNS: Array<{ test: RegExp; message: string }> = [
  { test: /invalid login credentials|invalid_credentials/i, message: "Forkert e-mail eller adgangskode. Prøv igen." },
  { test: /email not confirmed|email_not_confirmed/i, message: "Bekræft din e-mail først — vi har sendt dig et link." },
  { test: /user already registered|already registered|user_already_exists/i, message: "Der findes allerede en konto med denne e-mail. Log ind i stedet." },
  { test: /password.*(6|at least|short)|weak.?password/i, message: "Adgangskoden skal være mindst 6 tegn." },
  { test: /invalid email|email.*invalid/i, message: "Indtast en gyldig e-mailadresse." },
  { test: /rate limit|too many requests|over_email_send_rate_limit/i, message: "Der er sendt for mange forsøg. Vent et øjeblik og prøv igen." },
  { test: /captcha/i, message: "Vi kunne ikke bekræfte captcha. Prøv igen." },
  { test: /network|fetch failed|failed to fetch/i, message: "Ingen forbindelse. Tjek dit netværk og prøv igen." },
];

const FALLBACK: Record<AuthMode, string> = {
  signin: "Vi kunne ikke logge dig ind. Tjek din e-mail og adgangskode.",
  signup: "Vi kunne ikke oprette din konto lige nu. Prøv igen om et øjeblik.",
  forgot: "Vi kunne ikke sende linket lige nu. Prøv igen om et øjeblik.",
};

/** Returns friendly Danish copy for any auth failure. Never leaks raw text. */
export function friendlyAuthError(err: unknown, mode: AuthMode = "signin"): string {
  const raw =
    typeof err === "string"
      ? err
      : typeof (err as { message?: unknown })?.message === "string"
        ? ((err as { message: string }).message)
        : "";
  const hit = PATTERNS.find((p) => p.test.test(raw));
  return hit ? hit.message : FALLBACK[mode];
}

/** Which field (if any) the error should be anchored to. */
export function authErrorField(err: unknown): "email" | "password" | null {
  const raw = typeof err === "string" ? err : String((err as { message?: unknown })?.message ?? "");
  if (/invalid email|email.*invalid|already registered|email not confirmed/i.test(raw)) return "email";
  if (/password|invalid login credentials|invalid_credentials/i.test(raw)) return "password";
  return null;
}
