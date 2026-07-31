// Shared validation + shaping for private support notes (staff-only).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const NOTE_BODY_MAX = 5000;
export const SUBJECT_TYPES = ["customer", "provider"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isSubjectType(v: unknown): v is SubjectType {
  return typeof v === "string" && (SUBJECT_TYPES as readonly string[]).includes(v);
}

export type BodyValidation =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function validateBody(raw: unknown): BodyValidation {
  if (typeof raw !== "string") return { ok: false, error: "body must be a string" };
  const body = raw.trim();
  if (body.length === 0) return { ok: false, error: "body must not be empty" };
  if (body.length > NOTE_BODY_MAX) {
    return { ok: false, error: `body must be at most ${NOTE_BODY_MAX} characters` };
  }
  return { ok: true, body };
}

/** Only the fields the support UI needs — never the raw row. */
export function shapeNote(row: Record<string, unknown>) {
  return {
    id: row.id,
    subject_type: row.subject_type,
    subject_user_id: row.subject_user_id,
    body: row.body,
    author_user_id: row.author_user_id,
    pinned: row.pinned,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * The subject must exist and match the claimed role. Uses the service-role
 * client; never trusts the client's claim about who the subject is.
 */
export async function subjectExists(
  admin: SupabaseClient,
  subjectType: SubjectType,
  subjectUserId: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", subjectUserId)
    .maybeSingle();
  if (!profile) return false;

  if (subjectType === "provider") {
    const { data: provider } = await admin
      .from("provider_profiles")
      .select("id")
      .eq("user_id", subjectUserId)
      .maybeSingle();
    return Boolean(provider);
  }
  return true;
}
