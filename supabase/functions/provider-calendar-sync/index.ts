import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import ICAL from "npm:ical.js@2.1.0";
import { authenticate } from "../_shared/auth.ts";
import { requireActiveProvider } from "../_shared/providerGate.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const MAX_FEED_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MAX_BLOCKS = 5_000;
const HORIZON_MS = 84 * 24 * 60 * 60 * 1_000;
const LOOKBACK_MS = 24 * 60 * 60 * 1_000;

type BusyBlock = {
  event_hash: string;
  starts_at: string;
  ends_at: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224;
}

function isBlockedIpv6(ip: string): boolean {
  const value = ip.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") ||
    value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") ||
    value.startsWith("fea") || value.startsWith("feb") ||
    value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.") || value.startsWith("2001:db8:");
}

async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid_url");
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("invalid_url");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("blocked_host");
  }

  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(literal) && isBlockedIpv4(literal)) {
    throw new Error("blocked_host");
  }
  if (literal.includes(":") && isBlockedIpv6(literal)) {
    throw new Error("blocked_host");
  }

  const addresses = [
    ...await Deno.resolveDns(url.hostname, "A").catch(() => []),
    ...await Deno.resolveDns(url.hostname, "AAAA").catch(() => []),
  ];
  if (!addresses.length ||
      addresses.some((ip) => ip.includes(":") ? isBlockedIpv6(ip) : isBlockedIpv4(ip))) {
    throw new Error("blocked_host");
  }
  return url;
}

async function fetchCalendar(rawUrl: string): Promise<string> {
  let url = await assertPublicHttpsUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/calendar, application/ics;q=0.9, text/plain;q=0.5" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("redirect_refused");
      url = await assertPublicHttpsUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`feed_http_${response.status}`);
    const declared = Number(response.headers.get("content-length") || "0");
    if (declared > MAX_FEED_BYTES) throw new Error("feed_too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_FEED_BYTES) throw new Error("feed_too_large");
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  throw new Error("redirect_refused");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toDate(time: any): Date {
  return time.toJSDate();
}

async function parseBusyBlocks(ics: string): Promise<BusyBlock[]> {
  let root: any;
  try {
    root = new ICAL.Component(ICAL.parse(ics));
  } catch {
    throw new Error("invalid_ical");
  }

  const now = Date.now();
  const windowStart = now - LOOKBACK_MS;
  const windowEnd = now + HORIZON_MS;
  const blocks: BusyBlock[] = [];
  const events = root.getAllSubcomponents("vevent");

  for (const component of events) {
    const event = new ICAL.Event(component);
    if (event.component.getFirstPropertyValue("status") === "CANCELLED" ||
        event.component.getFirstPropertyValue("transp") === "TRANSPARENT") continue;

    const uid = String(event.uid || "anonymous");
    const add = async (start: Date, end: Date, recurrenceId = "") => {
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
          start >= end || end.getTime() <= windowStart || start.getTime() >= windowEnd) return;
      blocks.push({
        event_hash: await sha256(`${uid}|${recurrenceId}|${start.toISOString()}|${end.toISOString()}`),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      });
    };

    if (!event.isRecurring()) {
      await add(toDate(event.startDate), toDate(event.endDate));
      continue;
    }

    const iterator = event.iterator();
    for (let occurrence = iterator.next(); occurrence && blocks.length < MAX_BLOCKS; occurrence = iterator.next()) {
      const start = toDate(occurrence);
      if (start.getTime() >= windowEnd) break;
      const details = event.getOccurrenceDetails(occurrence);
      await add(toDate(details.startDate), toDate(details.endDate), occurrence.toString());
    }
  }

  if (blocks.length >= MAX_BLOCKS) throw new Error("too_many_events");
  return blocks;
}

async function syncConnection(admin: SupabaseClient, connectionId: string) {
  const { data: secretRows, error: secretError } = await admin.rpc(
    "provider_calendar_get_ical_secret_v1",
    { _connection_id: connectionId },
  );
  const secret = Array.isArray(secretRows) ? secretRows[0] : secretRows;
  if (secretError || !secret?.ical_url) throw new Error("calendar_secret_unavailable");

  const feed = await fetchCalendar(secret.ical_url);
  const blocks = await parseBusyBlocks(feed);
  const { data: imported, error } = await admin.rpc(
    "provider_calendar_replace_external_blocks_v1",
    { _connection_id: connectionId, _blocks: blocks },
  );
  if (error) throw new Error("database_sync_failed");
  return Number(imported || 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const isService = req.headers.get("Authorization") === `Bearer ${serviceKey}`;
  if (isService) {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
      { auth: { persistSession: false } },
    );
    const body = await req.json().catch(() => ({}));
    if (body.action !== "sync_due") return json({ error: "invalid_service_action" }, 400);

    const { data: due, error } = await admin
      .from("provider_calendar_connections")
      .select("id")
      .in("status", ["active", "error"])
      .lte("next_sync_at", new Date().toISOString())
      .order("next_sync_at")
      .limit(100);
    if (error) return json({ error: "connection_lookup_failed" }, 500);

    let synced = 0;
    let failed = 0;
    for (const connection of due ?? []) {
      try {
        await syncConnection(admin, connection.id);
        synced++;
      } catch (error) {
        failed++;
        const code = error instanceof Error ? error.message : "sync_failed";
        const safeCode = /^(invalid_|blocked_|feed_|redirect_|too_many_|database_|calendar_)/.test(code)
          ? code : "sync_failed";
        await admin.rpc("provider_calendar_mark_sync_error_v1", {
          _connection_id: connection.id,
          _error_code: safeCode,
        });
      }
    }
    return json({ ok: true, checked: due?.length ?? 0, synced, failed });
  }

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const { data: providerProfile } = await ctx.admin
    .from("provider_profiles")
    .select("user_id")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!providerProfile) return json({ error: "provider_profile_required" }, 403);
  // Availability sync feeds dispatch — non-operating providers must not be
  // able to publish availability.
  const calendarGate = await requireActiveProvider(ctx, corsHeaders, { allowPaused: true });
  if (calendarGate instanceof Response) return calendarGate;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "connect") {
    const icalUrl = typeof body.ical_url === "string" ? body.ical_url.trim() : "";
    try {
      await assertPublicHttpsUrl(icalUrl);
    } catch {
      return json({ error: "invalid_or_private_ical_url" }, 400);
    }
    const { data: connection, error } = await ctx.admin.rpc(
      "provider_calendar_store_ical_secret_v1",
      { _provider_user_id: ctx.user.id, _ical_url: icalUrl },
    );
    if (error || !connection?.id) {
      return json({ error: error?.code === "23505" ? "connection_exists" : "connect_failed" }, 409);
    }
    body.connection_id = connection.id;
  } else if (action === "disconnect") {
    const connectionId = String(body.connection_id || "");
    const { error } = await ctx.admin.rpc("provider_calendar_disconnect_v1", {
      _connection_id: connectionId,
      _provider_user_id: ctx.user.id,
    });
    return error ? json({ error: "disconnect_failed" }, 400) : json({ ok: true });
  } else if (action !== "sync") {
    return json({ error: "invalid_action" }, 400);
  }

  const connectionId = String(body.connection_id || "");
  const { data: owned } = await ctx.admin
    .from("provider_calendar_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("provider_user_id", ctx.user.id)
    .neq("status", "disconnected")
    .maybeSingle();
  if (!owned) return json({ error: "connection_not_found" }, 404);

  try {
    const imported = await syncConnection(ctx.admin, connectionId);
    return json({ ok: true, imported });
  } catch (error) {
    const code = error instanceof Error ? error.message : "sync_failed";
    const safeCode = /^(invalid_|blocked_|feed_|redirect_|too_many_|database_)/.test(code)
      ? code : "sync_failed";
    await ctx.admin.rpc("provider_calendar_mark_sync_error_v1", {
      _connection_id: connectionId,
      _error_code: safeCode,
    });
    return json({ error: safeCode }, 422);
  }
});
