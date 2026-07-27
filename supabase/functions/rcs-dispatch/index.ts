import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const encoder = new TextEncoder();

function base64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function googleAccessToken() {
  const raw = Deno.env.get("GOOGLE_RBM_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_RBM_SERVICE_ACCOUNT_JSON is missing");
  const credentials = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/rcsbusinessmessaging",
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(credentials.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`;
  const response = await fetch(credentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token as string;
}

function renderMessage(eventType: string, payload: Record<string, unknown>, locale: string) {
  const name = String(payload.customer_name || "").trim();
  const provider = String(payload.provider_name || "din cleaner");
  const eta = payload.eta_minutes ? ` Forventet ankomst om ca. ${payload.eta_minutes} min.` : "";
  const bookingUrl = String(payload.booking_url || "");
  const prefix = name ? `Hej ${name} 👋 ` : "Hej 👋 ";

  const da: Record<string, string> = {
    booking_confirmed: `${prefix}Din booking hos MyCleaner er bekræftet.`,
    provider_travelling: `${prefix}${provider} er nu på vej.${eta}`,
    provider_arrived: `${prefix}${provider} er ankommet.`,
    work_started: `${prefix}Rengøringen er startet.`,
    work_completed: `${prefix}Opgaven er færdig ✨ Du kan nu gennemgå resultatet.`,
    booking_cancelled: `${prefix}Din booking er blevet annulleret. Se detaljerne i MyCleaner.`,
    booking_rescheduled: `${prefix}Din booking er blevet flyttet. Se den nye tid i MyCleaner.`,
    review_requested: `${prefix}Hvordan gik rengøringen? Din vurdering hjælper både dig og andre kunder.`,
    custom: String(payload.text || "Du har en ny besked fra MyCleaner."),
  };

  const text = locale.startsWith("da") ? da[eventType] || da.custom : String(payload.text || da[eventType] || da.custom);
  return { text, bookingUrl };
}

async function sendRcs(phone: string, messageId: string, text: string, bookingUrl: string) {
  const agentId = Deno.env.get("GOOGLE_RBM_AGENT_ID");
  const region = Deno.env.get("GOOGLE_RBM_REGION") || "europe-west1";
  if (!agentId) throw new Error("GOOGLE_RBM_AGENT_ID is missing");
  const token = await googleAccessToken();
  const suggestions = bookingUrl ? [{ action: { text: "Åbn booking", postbackData: "OPEN_BOOKING", openUrlAction: { url: bookingUrl } } }] : [];
  const body = {
    contentMessage: { text, suggestions },
    messageTrafficType: "TRANSACTION",
  };
  const url = `https://${region}-rcsbusinessmessaging.googleapis.com/v1/phones/${encodeURIComponent(phone)}/agentMessages?messageId=${encodeURIComponent(messageId)}&agentId=${encodeURIComponent(agentId)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  if (response.ok) return { ok: true, providerId: messageId };
  return { ok: false, status: response.status, body: responseText };
}

async function sendSms(phone: string, text: string, bookingUrl: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) throw new Error("Twilio SMS credentials are missing");
  const body = new URLSearchParams({ To: phone, From: from, Body: bookingUrl ? `${text} ${bookingUrl}` : text });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`Twilio failed: ${response.status} ${JSON.stringify(json)}`);
  return json.sid as string;
}

async function mark(id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("notification_outbox").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = Deno.env.get("RCS_DISPATCH_SECRET");
  if (expected && request.headers.get("x-dispatch-secret") !== expected) return new Response("Unauthorized", { status: 401 });

  const { data: rows, error } = await admin.rpc("claim_notification_batch_v1", { _limit: 20 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const row of rows || []) {
    const { text, bookingUrl } = renderMessage(row.event_type, row.payload || {}, row.locale || "da-DK");
    const messageId = row.rcs_message_id || `mc-${row.id}`;
    try {
      if (row.preferred_channel === "sms") {
        const smsId = await sendSms(row.recipient_phone_e164, text, bookingUrl);
        await mark(row.id, { status: "sms_sent", sms_message_id: smsId, sent_at: new Date().toISOString(), last_error: null });
        results.push({ id: row.id, channel: "sms", ok: true });
        continue;
      }

      const rcs = await sendRcs(row.recipient_phone_e164, messageId, text, bookingUrl);
      if (rcs.ok) {
        await mark(row.id, { status: "rcs_sent", rcs_message_id: messageId, sent_at: new Date().toISOString(), last_error: null });
        results.push({ id: row.id, channel: "rcs", ok: true });
        continue;
      }

      // A definite 404 means the user is not reachable through RBM. Only then fall back immediately.
      if (rcs.status === 404) {
        const smsId = await sendSms(row.recipient_phone_e164, text, bookingUrl);
        await mark(row.id, { status: "sms_sent", rcs_message_id: messageId, sms_message_id: smsId, sent_at: new Date().toISOString(), last_error: `RCS unsupported: ${rcs.body}` });
        results.push({ id: row.id, channel: "sms_fallback", ok: true });
        continue;
      }

      throw new Error(`RCS failed: ${rcs.status} ${rcs.body}`);
    } catch (err) {
      const attempts = Number(row.attempt_count || 1);
      const retryMinutes = Math.min(360, 2 ** attempts);
      await mark(row.id, {
        status: "failed",
        last_error: String(err),
        next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
      });
      results.push({ id: row.id, ok: false, error: String(err) });
    }
  }

  return Response.json({ processed: results.length, results });
});
