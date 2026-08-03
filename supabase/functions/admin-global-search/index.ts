// Global admin search across bookings, people, providers and conversations.
// READ-ONLY. Admin role required; RLS bypass is intentional and scoped to
// admins only (same trust boundary as the existing admin consoles).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SearchHit {
  type: "booking" | "customer" | "provider" | "conversation";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  let body: { q?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → empty result */
  }
  const raw = typeof body.q === "string" ? body.q.trim() : "";
  if (raw.length < 2) return json({ query: raw, results: [] });
  if (raw.length > 120) return json({ error: "Query too long" }, 400);

  const admin = ctx.admin;
  // PostgREST `or` filters break on these characters — strip instead of
  // trying to escape them.
  const term = raw.replace(/[%,()*]/g, " ").trim();
  const like = `%${term}%`;
  const isUuid = UUID_RE.test(raw);

  const bookingQuery = admin
    .from("bookings")
    .select("id, service, address, booking_date, status, provider_name, currency, customer_pays")
    .order("created_at", { ascending: false })
    .limit(8);

  const [bookings, profiles, providers, conversations] = await Promise.all([
    isUuid
      ? bookingQuery.eq("id", raw)
      : bookingQuery.or(`service.ilike.${like},address.ilike.${like},provider_name.ilike.${like}`),
    admin
      .from("profiles")
      .select("id, full_name, phone, location_city, country_code")
      .or(
        isUuid
          ? `id.eq.${raw}`
          : `full_name.ilike.${like},phone.ilike.${like},sms_phone.ilike.${like},location_city.ilike.${like}`,
      )
      .limit(8),
    admin
      .from("provider_profiles")
      .select("user_id, display_name, provider_slug, status, base_country_code")
      .or(
        isUuid
          ? `user_id.eq.${raw}`
          : `display_name.ilike.${like},provider_slug.ilike.${like},headline.ilike.${like}`,
      )
      .limit(8),
    admin
      .from("conversations")
      .select("id, subject, status, kind, last_message_at")
      .or(isUuid ? `id.eq.${raw}` : `subject.ilike.${like}`)
      .order("last_message_at", { ascending: false })
      .limit(6),
  ]);

  const results: SearchHit[] = [
    ...(bookings.data ?? []).map((b) => ({
      type: "booking" as const,
      id: b.id,
      title: `${b.service ?? "Booking"} · ${b.id.slice(0, 8)}`,
      subtitle: [b.booking_date, b.status, b.provider_name].filter(Boolean).join(" · ") || null,
      href: `/support/bookings?booking=${b.id}`,
    })),
    ...(providers.data ?? []).map((p) => ({
      type: "provider" as const,
      id: p.user_id,
      title: p.display_name ?? p.provider_slug ?? p.user_id.slice(0, 8),
      subtitle: [p.status, p.base_country_code].filter(Boolean).join(" · ") || null,
      href: `/admin/providers?provider=${p.user_id}`,
    })),
    ...(profiles.data ?? []).map((p) => ({
      type: "customer" as const,
      id: p.id,
      title: p.full_name ?? p.id.slice(0, 8),
      subtitle: [p.location_city, p.country_code, p.phone].filter(Boolean).join(" · ") || null,
      href: `/support/customers?user=${p.id}`,
    })),
    ...(conversations.data ?? []).map((c) => ({
      type: "conversation" as const,
      id: c.id,
      title: c.subject ?? `Samtale ${c.id.slice(0, 8)}`,
      subtitle: [c.kind, c.status].filter(Boolean).join(" · ") || null,
      href: `/support/inbox/${c.id}`,
    })),
  ];

  return json({ query: raw, results });
});
