// Shared GatewayAPI SMS client (Mobile Messaging API).
//
// MyCleaner's ONLY SMS provider. Never logs the API token, full phone numbers,
// verification codes or message content.
//
// Endpoint: POST {GATEWAYAPI_BASE_URL}/mobile/single
// Auth:     Authorization: Token <GATEWAYAPI_API_TOKEN>

const DEFAULT_BASE_URL = "https://messaging.gatewayapi.eu";
const DEFAULT_SENDER = "MyCleaner";
const TIMEOUT_MS = 10_000;

export type SmsFailureReason =
  | "sms_provider_not_configured"
  | "invalid_recipient"
  | "invalid_sender"
  | "invalid_message"
  | "gatewayapi_bad_request"
  | "gatewayapi_unauthorized"
  | "gatewayapi_forbidden"
  | "gatewayapi_unprocessable"
  | "gatewayapi_rate_limited"
  | "gatewayapi_timeout"
  | "gatewayapi_server_error"
  | "gatewayapi_network_error"
  | "gatewayapi_unexpected_status";

export type SmsResult =
  | { ok: true; msgId: string | null; status: number }
  | { ok: false; reason: SmsFailureReason; status: number | null; transient: boolean };

/** Mask a phone number for logs: keep country-ish prefix and last 2 digits. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 5) return "***";
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

/** Returns E.164 digits WITHOUT leading "+" (GatewayAPI format), or null if invalid. */
export function toGatewayApiRecipient(raw: string): string | null {
  const cleaned = String(raw ?? "").replace(/[\s\-()]/g, "");
  if (!/^\+?[1-9][0-9]{6,14}$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
}

export function isSmsConfigured(): boolean {
  return Boolean((Deno.env.get("GATEWAYAPI_API_TOKEN") ?? "").trim());
}

function baseUrl(): string {
  const raw = (Deno.env.get("GATEWAYAPI_BASE_URL") ?? "").trim() || DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function sender(): string {
  const raw = (Deno.env.get("GATEWAYAPI_SENDER") ?? "").trim();
  return raw || DEFAULT_SENDER;
}

function classify(status: number): { reason: SmsFailureReason; transient: boolean } {
  if (status === 400) return { reason: "gatewayapi_bad_request", transient: false };
  if (status === 401) return { reason: "gatewayapi_unauthorized", transient: false };
  if (status === 403) return { reason: "gatewayapi_forbidden", transient: false };
  if (status === 408) return { reason: "gatewayapi_timeout", transient: true };
  if (status === 422) return { reason: "gatewayapi_unprocessable", transient: false };
  if (status === 429) return { reason: "gatewayapi_rate_limited", transient: true };
  if (status >= 500) return { reason: "gatewayapi_server_error", transient: true };
  return { reason: "gatewayapi_unexpected_status", transient: false };
}

/**
 * Send a single SMS through GatewayAPI's Mobile Messaging API.
 * `message` content is never logged.
 */
export async function sendSms(params: {
  to: string;
  message: string;
  reference: string;
}): Promise<SmsResult> {
  const token = (Deno.env.get("GATEWAYAPI_API_TOKEN") ?? "").trim();
  if (!token) {
    return { ok: false, reason: "sms_provider_not_configured", status: null, transient: false };
  }

  const recipient = toGatewayApiRecipient(params.to);
  if (!recipient) {
    return { ok: false, reason: "invalid_recipient", status: null, transient: false };
  }

  const from = sender();
  if (!from || from.length > 11) {
    return { ok: false, reason: "invalid_sender", status: null, transient: false };
  }

  const message = String(params.message ?? "");
  if (!message.trim()) {
    return { ok: false, reason: "invalid_message", status: null, transient: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl()}/mobile/single`, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: from,
        message,
        recipient,
        reference: params.reference,
      }),
      signal: controller.signal,
    });

    // Body is read (and discarded except msg_id) to avoid resource leaks.
    const text = await res.text().catch(() => "");

    if (res.ok) {
      let msgId: string | null = null;
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const raw = parsed?.msg_id ?? parsed?.msgId ?? parsed?.id;
        if (typeof raw === "string" || typeof raw === "number") msgId = String(raw);
      } catch { /* non-JSON success body is acceptable */ }
      console.log(JSON.stringify({
        evt: "sms.sent",
        provider: "gatewayapi",
        reference: params.reference,
        recipient_masked: maskPhone(recipient),
        msg_id: msgId,
      }));
      return { ok: true, msgId, status: res.status };
    }

    const { reason, transient } = classify(res.status);
    console.error(JSON.stringify({
      evt: "sms.failed",
      provider: "gatewayapi",
      reference: params.reference,
      recipient_masked: maskPhone(recipient),
      status: res.status,
      reason,
      transient,
    }));
    return { ok: false, reason, status: res.status, transient };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    const reason: SmsFailureReason = aborted ? "gatewayapi_timeout" : "gatewayapi_network_error";
    console.error(JSON.stringify({
      evt: "sms.failed",
      provider: "gatewayapi",
      reference: params.reference,
      status: null,
      reason,
      transient: true,
    }));
    return { ok: false, reason, status: null, transient: true };
  } finally {
    clearTimeout(timer);
  }
}
