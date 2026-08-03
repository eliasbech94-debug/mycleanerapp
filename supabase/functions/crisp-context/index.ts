import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const [{ data: profile }, { data: roles }, { data: booking }] = await Promise.all([
      admin.from("profiles").select("full_name, phone, country_code, provider_id, created_at").eq("id", user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", user.id),
      admin.from("bookings")
        .select("id,status,booking_date,slot,customer_pays,currency,provider_id,provider_name,payment_status,created_at")
        .or(`customer_id.eq.${user.id},user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const roleValues = (roles ?? []).map((row: { role: string }) => row.role);
    const primaryRole = roleValues.includes("provider") ? "provider" : roleValues.includes("customer") ? "customer" : roleValues[0] ?? "customer";
    const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "https://mycleaner.dk").replace(/\/$/, "");

    const snapshot: Record<string, string> = {
      support_identity_version: "3",
      authenticated: "true",
      user_id: user.id,
      role: primaryRole,
      account_created_at: profile?.created_at ?? user.created_at ?? "",
      country: profile?.country_code ?? "",
      provider_id: profile?.provider_id ?? "",
      admin_user_url: `${appUrl}/admin/users/${user.id}`,
    };

    if (booking) {
      snapshot.booking_id = booking.id;
      snapshot.booking_status = booking.status ?? "";
      snapshot.booking_date = booking.booking_date ?? "";
      snapshot.booking_time = booking.slot ?? "";
      snapshot.booking_provider = booking.provider_name ?? "";
      snapshot.booking_provider_id = booking.provider_id ?? "";
      snapshot.payment_status = booking.payment_status ?? "";
      snapshot.booking_price = booking.customer_pays != null ? `${booking.customer_pays} ${booking.currency ?? ""}`.trim() : "";
      snapshot.admin_booking_url = `${appUrl}/admin/bookings/${booking.id}`;
    }

    return new Response(JSON.stringify({
      identity: {
        email: user.email ?? null,
        name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
      },
      snapshot,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("crisp-context error", error);
    return new Response(JSON.stringify({ error: "context_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
