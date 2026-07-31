// Provider recurring-discount preferences.
// Providers may opt in/out; percentages remain platform-owned and server-resolved.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const Recurrence = z.enum(["weekly", "biweekly", "monthly"]);
const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get_mine") }),
  z.object({
    action: z.literal("set"),
    recurrence: Recurrence,
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("get_provider_offers"),
    provider_user_id: z.string().uuid(),
  }),
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(
      auth.replace("Bearer ", ""),
    );
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsError || !userId) return json(401, { error: "unauthorized" });

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: "invalid_request", fields: parsed.error.flatten().fieldErrors });
    }

    const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
    const body = parsed.data;

    if (body.action === "set") {
      // Do not trust a role claim alone. A provider profile must exist.
      const { data: provider } = await admin
        .from("provider_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!provider) return json(403, { error: "provider_profile_required" });

      const { error } = await admin
        .from("provider_recurring_discount_preferences")
        .upsert({
          provider_user_id: userId,
          recurrence: body.recurrence,
          enabled: body.enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: "provider_user_id,recurrence" });
      if (error) return json(500, { error: "preference_write_failed" });

      const { data: rows, error: readError } = await admin
        .from("provider_recurring_discount_preferences")
        .select("recurrence, enabled, updated_at")
        .eq("provider_user_id", userId)
        .order("recurrence");
      if (readError) return json(500, { error: "preference_read_failed" });

      return json(200, { preferences: rows ?? [] });
    }

    const providerUserId = body.action === "get_mine"
      ? userId
      : body.provider_user_id;

    const { data: configs, error: configError } = await admin
      .from("recurring_discount_config")
      .select("recurrence, discount_bps, version, active")
      .eq("active", true);
    if (configError) return json(500, { error: "discount_config_read_failed" });

    const { data: preferences, error: preferenceError } = await admin
      .from("provider_recurring_discount_preferences")
      .select("recurrence, enabled, updated_at")
      .eq("provider_user_id", providerUserId);
    if (preferenceError) return json(500, { error: "preference_read_failed" });

    const enabledByRecurrence = new Map(
      (preferences ?? []).map((row) => [String(row.recurrence), Boolean(row.enabled)]),
    );

    const offers = (configs ?? []).map((config) => ({
      recurrence: config.recurrence,
      discount_bps: config.discount_bps,
      discount_percent: Number(config.discount_bps) / 100,
      config_version: config.version,
      enabled: enabledByRecurrence.get(String(config.recurrence)) ?? false,
    }));

    // Public provider lookup returns only enabled offers. The provider's own
    // settings view returns all platform options, including disabled ones.
    return json(200, {
      provider_user_id: providerUserId,
      offers: body.action === "get_provider_offers"
        ? offers.filter((offer) => offer.enabled)
        : offers,
    });
  } catch (error) {
    return json(500, { error: "internal_error", detail: (error as Error).message });
  }
});
