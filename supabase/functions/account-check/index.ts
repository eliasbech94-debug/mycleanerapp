import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationDraft = {
  kind: "setup" | "reminder" | "cleaner_message" | "tip" | "alert" | "update";
  severity?: "info" | "warning" | "error" | "success";
  title: string;
  body?: string;
  action_label?: string;
  action_url?: string;
  related_booking_id?: string;
  dedupe_key: string;
};

const PHONE_RE = /^\+?[0-9\s\-()]{7,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function runHealthCheck(
  admin: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string | null,
): Promise<NotificationDraft[]> {
  const drafts: NotificationDraft[] = [];

  // 1. Profile completeness
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, phone")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.full_name || profile.full_name.trim().length < 2) {
    drafts.push({
      kind: "setup",
      severity: "warning",
      title: "Manglende navn",
      body: "Vi har ikke dit fulde navn endnu. Cleanere bruger det til at finde dig på adressen.",
      action_label: "Tilføj navn",
      action_url: "/profil?tab=info",
      dedupe_key: "setup:name",
    });
  }

  if (!profile?.phone || !PHONE_RE.test(profile.phone)) {
    drafts.push({
      kind: "setup",
      severity: "warning",
      title: profile?.phone ? "Telefonnummer ser forkert ud" : "Tilføj telefonnummer",
      body: profile?.phone
        ? `Dit nummer "${profile.phone}" ser ikke gyldigt ud — cleaneren kan ikke ringe hvis der opstår problemer.`
        : "Cleaneren har brug for et telefonnummer til at kontakte dig på dagen.",
      action_label: "Ret telefonnummer",
      action_url: "/profil?tab=info",
      dedupe_key: "setup:phone",
    });
  }

  if (!userEmail || !EMAIL_RE.test(userEmail)) {
    drafts.push({
      kind: "setup",
      severity: "error",
      title: "Email mangler eller er ugyldig",
      body: "Vi kan ikke sende kvitteringer og opdateringer til dig uden en gyldig email.",
      action_label: "Opdater email",
      action_url: "/profil?tab=info",
      dedupe_key: "setup:email",
    });
  }

  // 2. Addresses — primary address with access method
  const { data: addresses } = await admin
    .from("customer_addresses")
    .select("id, is_primary, access_method, access_instructions")
    .eq("user_id", userId);

  if (!addresses || addresses.length === 0) {
    drafts.push({
      kind: "setup",
      severity: "info",
      title: "Tilføj din første adresse",
      body: "Gem dine adresser med adgangskode, kæledyr og parkering, så booking går hurtigere.",
      action_label: "Tilføj adresse",
      action_url: "/profil?tab=addresses",
      dedupe_key: "setup:address",
    });
  } else {
    const noPrimary = !addresses.some((a: any) => a.is_primary);
    if (noPrimary) {
      drafts.push({
        kind: "setup",
        severity: "info",
        title: "Vælg en primær adresse",
        body: "Når du har flere adresser, hjælper en primær med at booking går hurtigere.",
        action_label: "Vælg primær",
        action_url: "/profil?tab=addresses",
        dedupe_key: "setup:primary-address",
      });
    }
    const missingAccess = addresses.filter(
      (a: any) => !a.access_method && !a.access_instructions,
    );
    if (missingAccess.length > 0) {
      drafts.push({
        kind: "setup",
        severity: "info",
        title: `${missingAccess.length} adresse(r) uden adgangs-info`,
        body: "Tilføj hvordan cleaneren får adgang (kode, nøglegemt, hjemme), så I undgår misforståelser.",
        action_label: "Udfyld adgangs-info",
        action_url: "/profil?tab=addresses",
        dedupe_key: "setup:access-info",
      });
    }
  }

  // 3. Upcoming bookings reminders (24 timer før)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const { data: upcoming } = await admin
    .from("bookings")
    .select("id, provider_name, booking_date, slot, status")
    .eq("customer_user_id", userId)
    .eq("booking_date", tomorrow.toISOString().slice(0, 10))
    .in("status", ["confirmed", "pending"]);
  for (const b of upcoming ?? []) {
    drafts.push({
      kind: "reminder",
      severity: "info",
      title: `Booking i morgen kl. ${(b as any).slot}`,
      body: `Husk din aftale med ${(b as any).provider_name} i morgen. Tjek at adgangsinfo er korrekt.`,
      action_label: "Se booking",
      action_url: "/profil?tab=bookings",
      related_booking_id: (b as any).id,
      dedupe_key: `reminder:booking:${(b as any).id}:${todayKey()}`,
    });
  }

  // 4. Pending bookings older than 48h
  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: stale } = await admin
    .from("bookings")
    .select("id, provider_name, created_at")
    .eq("customer_user_id", userId)
    .eq("status", "pending")
    .lt("created_at", twoDaysAgo);
  for (const b of stale ?? []) {
    drafts.push({
      kind: "alert",
      severity: "warning",
      title: "Booking afventer stadig svar",
      body: `Din anmodning til ${(b as any).provider_name} er ikke besvaret endnu. Du kan finde en anden cleaner eller skrive til support.`,
      action_label: "Se booking",
      action_url: "/profil?tab=bookings",
      related_booking_id: (b as any).id,
      dedupe_key: `alert:pending:${(b as any).id}`,
    });
  }

  return drafts;
}

export async function upsertNotifications(
  admin: ReturnType<typeof createClient>,
  userId: string,
  drafts: NotificationDraft[],
) {
  if (drafts.length === 0) return 0;
  let inserted = 0;
  for (const d of drafts) {
    // Skip if undismissed dupe exists
    const { data: existing } = await admin
      .from("customer_notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("dedupe_key", d.dedupe_key)
      .is("dismissed_at", null)
      .maybeSingle();
    if (existing) continue;
    const { error } = await admin.from("customer_notifications").insert({
      user_id: userId,
      kind: d.kind,
      severity: d.severity ?? "info",
      title: d.title,
      body: d.body ?? "",
      action_label: d.action_label,
      action_url: d.action_url,
      related_booking_id: d.related_booking_id,
      dedupe_key: d.dedupe_key,
    });
    if (!error) inserted++;
    else console.error("notif insert", error);
  }
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const drafts = await runHealthCheck(admin, user.id, user.email ?? null);
    const inserted = await upsertNotifications(admin, user.id, drafts);
    return new Response(JSON.stringify({ checked: drafts.length, created: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("account-check", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
