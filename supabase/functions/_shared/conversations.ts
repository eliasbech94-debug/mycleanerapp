// Shared helpers for the unified conversation engine.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AuthContext } from "./auth.ts";

export const MAX_BODY = 8000;

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Returns true when caller is support or admin. */
export function isStaff(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin
    || ctx.roles.includes("admin" as any)
    || ctx.roles.includes("support" as any);
}

export function isAdmin(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin || ctx.roles.includes("admin" as any);
}

export async function assertVisible(admin: SupabaseClient, convId: string, userId: string) {
  const { data, error } = await admin.rpc("is_conversation_visible_to", {
    _conversation_id: convId,
    _user_id: userId,
  });
  if (error) throw new Error("visibility_check_failed: " + error.message);
  if (!data) throw new Error("forbidden");
}

export async function assertParticipant(admin: SupabaseClient, convId: string, userId: string) {
  const { data, error } = await admin.rpc("is_conversation_participant", {
    _conversation_id: convId,
    _user_id: userId,
  });
  if (error) throw new Error("participant_check_failed: " + error.message);
  if (!data) throw new Error("not_participant");
}

/** Sanitize a filename for storage: keep alnum, dot, dash, underscore. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

/** Simple in-memory rate limiter per (user, bucket). Not distributed. */
const rateBuckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

export async function writeEvent(
  admin: SupabaseClient,
  conversationId: string,
  actor: string | null,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  try {
    await admin.from("conversation_events").insert({
      conversation_id: conversationId,
      actor_user_id: actor,
      event_type: eventType,
      payload,
    });
  } catch (e) {
    console.error("conversation_event_write_failed", (e as Error).message);
  }
}
