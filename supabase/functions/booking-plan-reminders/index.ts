// Sends automatic reminders to customer and provider before a cleaning,
// but only when a "property"-scope cleaning plan exists for the booking's address.
// Idempotent via customer_notifications.dedupe_key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Window = { key: string; hoursAhead: number; toleranceHours: number; label: string };

const WINDOWS: Window[] = [
  { key: "24h", hoursAhead: 24, toleranceHours: 1, label: "i morgen" },
  { key: "2h", hoursAhead: 2, toleranceHours: 1, label: "om ca. 2 timer" },
];

function parseSlotStart(slot: string): { h: number; m: number } {
  // "09:00-12:00" or "09:00"
  const m = /^(\d{1,2}):(\d{2})/.exec(slot || "");
  return m ? { h: +m[1], m: +m[2] } : { h: 9, m: 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 3600 * 1000);

  // Candidate bookings: accepted, upcoming within next 48h
  const { data: bookings, error: bErr } = await admin
    .from("bookings")
    .select("id, customer_user_id, provider_id, provider_name, booking_date, slot, address, address_place_id, status")
    .eq("status", "accepted")
    .gte("booking_date", now.toISOString().slice(0, 10))
    .lte("booking_date", horizon.toISOString().slice(0, 10));

  if (bErr) {
    return new Response(JSON.stringify({ error: bErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  const results: any[] = [];

  for (const b of bookings ?? []) {
    // Compute booking start timestamp (server local UTC — treat as Europe day + local slot)
    const { h, m } = parseSlotStart(b.slot);
    const start = new Date(`${b.booking_date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    const hoursUntil = (start.getTime() - now.getTime()) / 3600_000;

    // Match a reminder window
    const win = WINDOWS.find(w => Math.abs(hoursUntil - w.hoursAhead) <= w.toleranceHours);
    if (!win) continue;

    // Property-scope plan required
    if (!b.address_place_id) continue;
    const { data: addr } = await admin
      .from("customer_addresses")
      .select("id")
      .eq("user_id", b.customer_user_id)
      .eq("address_place_id", b.address_place_id)
      .maybeSingle();
    if (!addr) continue;

    const { data: plan } = await admin
      .from("cleaning_plans")
      .select("id, focus_areas, notes")
      .eq("user_id", b.customer_user_id)
      .eq("address_id", addr.id)
      .eq("scope", "property")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!plan) continue;

    // Resolve provider user_id
    const { data: provProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("provider_id", b.provider_id)
      .maybeSingle();

    const focusPreview = (plan.focus_areas ?? []).slice(0, 3).join(", ");
    const bodySuffix = focusPreview ? ` Fokus: ${focusPreview}.` : "";
    const timeLabel = `kl. ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    const recipients: Array<{ user_id: string; role: "customer" | "provider" }> = [
      { user_id: b.customer_user_id, role: "customer" },
    ];
    if (provProfile?.id) recipients.push({ user_id: provProfile.id, role: "provider" });

    for (const r of recipients) {
      const dedupe = `plan-reminder:${b.id}:${win.key}:${r.role}`;
      const title = r.role === "customer"
        ? `Din rengøring er ${win.label}`
        : `Rengøring hos kunde ${win.label}`;
      const body = r.role === "customer"
        ? `Din faste rengøringsplan bruges automatisk til bookingen ${timeLabel}.${bodySuffix}`
        : `Kunden har en fast rengøringsplan på boligen. Se planen inden fremmøde ${timeLabel}.${bodySuffix}`;

      const { error: insErr } = await admin
        .from("customer_notifications")
        .insert({
          user_id: r.user_id,
          kind: "cleaning_plan_reminder",
          severity: win.key === "2h" ? "warning" : "info",
          title,
          body,
          action_label: "Åbn plan",
          action_url: `/booking/${b.id}/plan`,
          related_booking_id: b.id,
          dedupe_key: dedupe,
        });

      if (!insErr) sent++;
      results.push({ booking: b.id, role: r.role, window: win.key, ok: !insErr, error: insErr?.message });
    }
  }

  return new Response(JSON.stringify({ checked: bookings?.length ?? 0, sent, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
