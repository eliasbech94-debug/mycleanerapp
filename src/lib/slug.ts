// Slug validation utilities — mirrors public.validate_provider_slug_format.
// Single source of truth on the client; the DB trigger is the authority.

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const SLUG_MIN = 2;
export const SLUG_MAX = 40;

export type SlugValidation =
  | { ok: true; slug: string }
  | {
      ok: false;
      reason:
        | "empty"
        | "length"
        | "format"
        | "reserved"
        | "taken"
        | "history_conflict"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export function normalizeSlug(input: string): string {
  return (input ?? "").trim().toLowerCase();
}

/** Format-only client-side validation. Availability/reservation is server-side. */
export function validateSlugFormat(input: string): SlugValidation {
  const s = normalizeSlug(input);
  if (!s) return { ok: false, reason: "empty" };
  if (s.length < SLUG_MIN || s.length > SLUG_MAX) return { ok: false, reason: "length" };
  if (s.includes("--")) return { ok: false, reason: "format" };
  if (!SLUG_RE.test(s)) return { ok: false, reason: "format" };
  return { ok: true, slug: s };
}

/** Human-readable Danish reason mapper. */
export function slugReasonLabel(reason: SlugValidation extends { ok: false; reason: infer R } ? R : never): string {
  switch (reason) {
    case "empty": return "Skriv et link-navn.";
    case "length": return `Skal være mellem ${SLUG_MIN} og ${SLUG_MAX} tegn.`;
    case "format": return "Kun små bogstaver, tal og bindestreg (ikke start/slut).";
    case "reserved": return "Dette navn er reserveret af platformen.";
    case "taken": return "Navnet er allerede taget.";
    case "history_conflict": return "Navnet blev tidligere brugt af en anden cleaner.";
    case "rate_limited": return "Du kan kun ændre link-navn én gang hver 90. dag.";
    case "unauthorized": return "Log ind for at tjekke tilgængelighed.";
    default: return "Ukendt fejl.";
  }
}
