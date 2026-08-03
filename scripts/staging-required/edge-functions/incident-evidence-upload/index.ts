// STAGING_REQUIRED — Do NOT copy into supabase/functions/ before staging sign-off.
//
// Two-phase incident evidence upload:
//   init     -> reserve idempotent session, return signed upload URL bound to
//               pending/{incident}/{session}/{obj}.bin. `upsert=false`.
//   finalize -> download bytes from pending path, verify size + magic-byte
//               MIME + SHA-256, copy to final/, update DB row to 'verified'.
//               Server-generated extension. Rejects mismatches.
//
// Authorization: `can_access_incident_report(user, incident)` — CMS editor
// roles are NOT sufficient.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../../../../supabase/functions/_shared/auth.ts";
import { writeAudit } from "../../../../supabase/functions/_shared/audit.ts";
import { sniffMime, sha256Hex } from "../_shared/mime-sniff.ts";
import { checkRateLimit, recordRateEvent } from "../_shared/rate-limit.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const SESSION_TTL_SECONDS = 15 * 60; // MyCleaner session TTL, NOT Storage token TTL.

const Init = z.object({
  step: z.literal("init"),
  incident_id: z.string().uuid(),
  // Advisory only — never used for authorization or path derivation.
  declared_mime_type: z.string().max(80).optional(),
  declared_size_bytes: z.number().int().positive().max(MAX_BYTES).optional(),
  claimed_file_hash: z.string().min(16).max(128).optional(),
});
const Finalize = z.object({
  step: z.literal("finalize"),
  session_id: z.string().uuid(),
  claimed_file_hash: z.string().min(16).max(128).optional(),
  caption: z.string().max(500).optional(),
});

const json = (s: number, b: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

async function assertAuthorized(admin: any, incident_id: string, user_id: string) {
  const { data, error } = await admin.rpc("can_access_incident_report", {
    _user_id: user_id,
    _incident_id: incident_id,
  });
  if (error) throw new Error("authz_check_failed");
  if (!data) throw new Error("forbidden");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const raw = await req.json();

    // ─── init ────────────────────────────────────────────────────────────
    if (raw.step === "init") {
      const parsed = Init.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const { incident_id, declared_mime_type, declared_size_bytes, claimed_file_hash } = parsed.data;

      await assertAuthorized(ctx.admin, incident_id, ctx.user.id);

      const rl = await checkRateLimit(ctx.admin, "upload_init", ctx.user.id, incident_id);
      if (!rl.ok) return json(429, { error: "rate_limited" }, { "Retry-After": String(rl.retryAfterSeconds ?? 60) });

      // Server-generated idempotency key + pending path. Client cannot supply.
      const idempotency_key = crypto.randomUUID();
      const session_id = crypto.randomUUID();
      const object_uuid = crypto.randomUUID();
      const pending_path = `pending/${incident_id}/${session_id}/${object_uuid}.bin`;
      const expires_at = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

      // Persist session first — required for finalize.
      const { error: sessErr } = await ctx.admin
        .from("incident_evidence_upload_sessions")
        .insert({
          id: session_id,
          incident_id,
          user_id: ctx.user.id,
          idempotency_key,
          pending_storage_path: pending_path,
          declared_mime_type: declared_mime_type ?? null,
          declared_size_bytes: declared_size_bytes ?? null,
          claimed_file_hash: claimed_file_hash ?? null,
          expires_at,
        });
      if (sessErr) return json(500, { error: "session_create_failed" });

      const { data: signed, error: signErr } = await (ctx.admin as any).storage
        .from("incident-evidence")
        .createSignedUploadUrl(pending_path); // upsert defaults false on this API
      if (signErr) return json(500, { error: signErr.message });

      await recordRateEvent(ctx.admin, "upload_init", ctx.user.id, incident_id);

      // NOTE: signed.token / signed.signedUrl are NOT logged.
      return json(200, {
        session_id,
        upload_url: signed.signedUrl,
        token: signed.token,
        pending_storage_path: pending_path,
        session_expires_at: expires_at,
        // Advisory: MyCleaner enforces the 15-min TTL server-side at finalize,
        // regardless of Storage token TTL.
      });
    }

    // ─── finalize ────────────────────────────────────────────────────────
    if (raw.step === "finalize") {
      const parsed = Finalize.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const { session_id, claimed_file_hash, caption } = parsed.data;

      // Load + lock session (best-effort via SELECT ... FOR UPDATE would need RPC).
      const { data: session, error: sErr } = await ctx.admin
        .from("incident_evidence_upload_sessions")
        .select("id, incident_id, user_id, pending_storage_path, expires_at, finalized_at, evidence_id, idempotency_key")
        .eq("id", session_id)
        .maybeSingle();
      if (sErr || !session) return json(404, { error: "session_not_found" });
      if (session.user_id !== ctx.user.id) return json(403, { error: "forbidden" });

      // Idempotent replay — return existing evidence row.
      if (session.finalized_at && session.evidence_id) {
        return json(200, { id: session.evidence_id, idempotent: true });
      }
      if (new Date(session.expires_at).getTime() < Date.now()) {
        return json(410, { error: "session_expired" });
      }

      await assertAuthorized(ctx.admin, session.incident_id, ctx.user.id);

      const rl = await checkRateLimit(ctx.admin, "finalize", ctx.user.id, session.incident_id);
      if (!rl.ok) return json(429, { error: "rate_limited" }, { "Retry-After": String(rl.retryAfterSeconds ?? 60) });

      // Download actual bytes from pending path.
      const { data: blob, error: dlErr } = await (ctx.admin as any).storage
        .from("incident-evidence")
        .download(session.pending_storage_path);
      if (dlErr || !blob) return json(400, { error: "pending_object_missing" });

      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) {
        await quarantine(ctx.admin, session, "size_out_of_range");
        return json(400, { error: "size_out_of_range" });
      }

      // Magic-byte sniff — never trust declared MIME.
      const sniff = sniffMime(bytes);
      if (!sniff.mime || !sniff.extension) {
        await quarantine(ctx.admin, session, sniff.reason ?? "mime_rejected");
        return json(415, { error: "mime_rejected" });
      }

      const verified_hash = await sha256Hex(bytes);
      const hash_status = claimed_file_hash
        ? (claimed_file_hash.toLowerCase() === verified_hash ? "verified" : "mismatch")
        : "verified"; // No claim to compare → treat server hash as authoritative.

      if (hash_status === "mismatch") {
        await quarantine(ctx.admin, session, "hash_mismatch");
        return json(409, { error: "hash_mismatch" });
      }

      // Copy to final/ path (server-chosen extension). Reject overwrite.
      const final_uuid = crypto.randomUUID();
      const final_path = `final/${session.incident_id}/${final_uuid}.${sniff.extension}`;

      const { error: copyErr } = await (ctx.admin as any).storage
        .from("incident-evidence")
        .copy(session.pending_storage_path, final_path);
      if (copyErr) {
        await quarantine(ctx.admin, session, `copy_failed:${copyErr.message}`);
        return json(500, { error: "finalize_copy_failed" });
      }

      // Insert authoritative row (service_role bypasses RLS; trigger enforces shape).
      const { data: ev, error: insErr } = await ctx.admin
        .from("incident_evidence")
        .insert({
          incident_id: session.incident_id,
          storage_path: session.pending_storage_path, // pending path as historical record
          final_storage_path: final_path,
          status: "verified",
          mime_type: sniff.mime,
          detected_mime_type: sniff.mime,
          verified_extension: sniff.extension,
          verified_size_bytes: bytes.length,
          file_size: bytes.length,
          claimed_file_hash: claimed_file_hash ?? null,
          verified_file_hash: verified_hash,
          hash_verification_status: "verified",
          verified_at: new Date().toISOString(),
          uploaded_by: ctx.user.id,
          caption: caption ?? null,
        })
        .select("id")
        .single();
      if (insErr) {
        // Attempt to remove the final object to avoid orphan on failure.
        await (ctx.admin as any).storage.from("incident-evidence").remove([final_path]);
        return json(500, { error: insErr.message });
      }

      // Mark session finalized + link evidence.
      await ctx.admin
        .from("incident_evidence_upload_sessions")
        .update({ finalized_at: new Date().toISOString(), evidence_id: ev.id })
        .eq("id", session.id);

      // Best-effort delete of pending object; worker will reconcile if it fails.
      await (ctx.admin as any).storage
        .from("incident-evidence")
        .remove([session.pending_storage_path]);

      await recordRateEvent(ctx.admin, "finalize", ctx.user.id, session.incident_id);

      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id,
        action: "incident_evidence.verified",
        target_type: "incident_evidence",
        target_id: ev.id,
        metadata: {
          incident_id: session.incident_id,
          bytes: bytes.length,
          mime: sniff.mime,
          verified_hash,
        },
      });

      return json(200, { id: ev.id });
    }

    return json(400, { error: "invalid_step" });
  } catch (e) {
    const m = (e as Error).message;
    const status = m === "forbidden" ? 403 : 500;
    return json(status, { error: m });
  }
});

async function quarantine(admin: any, session: any, reason: string) {
  await admin.from("incident_evidence")
    .insert({
      incident_id: session.incident_id,
      storage_path: session.pending_storage_path,
      status: "quarantined",
      mime_type: "application/octet-stream",
      file_size: 1,
      quarantine_reason: reason.slice(0, 200),
      uploaded_by: session.user_id,
      hash_verification_status: "rejected",
    })
    .throwOnError();
}
