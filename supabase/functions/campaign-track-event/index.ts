// Public endpoint. Ingests analytics events for a campaign.
//
// Hardened surface:
// - Strict allowlist of event_type (see PUBLIC_EVENT_TYPES). Server-only
//   events (application_approved, etc.) are refused here.
// - Payload size cap (2 KB JSON).
// - Per-IP soft rate limit (60 events / 10 min / campaign).
// - Feature-flag gated on `campaigns.enabled`.
// - Append-only guarantee is enforced by the DB trigger
//   `campaign_events_append_only` — this function only inserts.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  campaignsEnabled,
  corsHeaders,
  emitEvent,
  fp,
  json,
  MAX_EVENT_PAYLOAD_BYTES,
  PUBLIC_EVENT_TYPES,
} from "../_shared/campaign.ts";

const EVENT_RATE_WINDOW_MS = 10 * 60_000;
const EVENT_RATE_MAX = 60;

interface Body {
  campaign_slug?: string;
  event_type?: string;
  country_code?: string | null;
  session_id?: string | null;
  payload?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (!(await campaignsEnabled(admin))) return json(503, { error: "campaigns_disabled" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const slug = (body.campaign_slug ?? "").trim().toLowerCase();
  const eventType = body.event_type ?? "";
  if (!slug) return json(400, { error: "missing_campaign_slug" });
  if (!PUBLIC_EVENT_TYPES.has(eventType)) {
    return json(400, { error: "event_type_not_allowed", event_type: eventType });
  }

  const payload = body.payload ?? {};
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (payloadBytes > MAX_EVENT_PAYLOAD_BYTES) {
    return json(413, { error: "payload_too_large", max_bytes: MAX_EVENT_PAYLOAD_BYTES });
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, deleted_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!campaign || campaign.deleted_at) return json(404, { error: "campaign_not_found" });

  const clientIp = fp(req).ip;
  if (clientIp) {
    const since = new Date(Date.now() - EVENT_RATE_WINDOW_MS).toISOString();
    const { count } = await admin
      .from("campaign_events")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("ip", clientIp)
      .gte("created_at", since);
    if ((count ?? 0) >= EVENT_RATE_MAX) {
      return json(429, { error: "rate_limited" });
    }
  }

  const country =
    typeof body.country_code === "string" && /^[A-Z]{2}$/.test(body.country_code.toUpperCase())
      ? body.country_code.toUpperCase()
      : null;

  await emitEvent(admin, req, {
    campaign_id: campaign.id,
    event_type: eventType,
    country_code: country,
    session_id: body.session_id ?? null,
    payload,
  });

  return json(202, { status: "recorded" });
});
