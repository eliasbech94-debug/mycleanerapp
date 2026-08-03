/**
 * Crisp integration — MyCleaner's single live-chat platform.
 *
 * Design rules (product decision, do not change without approval):
 * - The default floating Crisp bubble is NEVER shown anywhere. The SDK is
 *   loaded in a fully hidden mode so we can identify the user and push
 *   session metadata, while the *visible* chat lives exclusively inside the
 *   MyCleaner Support Center (an embedded chatbox, never a popup).
 * - Every "need help" entry point in the app funnels into that same session.
 */

/** Public Crisp website id (safe to ship in the bundle). */
export const CRISP_WEBSITE_ID = "d4985742-38fc-490b-828c-a0e682a45990";

type CrispCommand = unknown[];

declare global {
  interface Window {
    $crisp?: CrispCommand[] & { push: (cmd: CrispCommand) => void };
    CRISP_WEBSITE_ID?: string;
    CRISP_TOKEN_ID?: string;
    CRISP_RUNTIME_CONFIG?: Record<string, unknown>;
  }
}

/** Stable per-user Crisp session token so SDK + embedded chatbox share one thread. */
export function crispTokenId(userId?: string | null): string | undefined {
  return userId ? `mc_${userId}` : undefined;
}

let loading = false;

/**
 * Loads the Crisp SDK once, with the bubble hidden from the first frame.
 * Safe to call repeatedly and during SSR-less client renders.
 */
export function loadCrisp(opts: { locale?: string; tokenId?: string } = {}): void {
  if (typeof window === "undefined") return;

  if (!window.$crisp) {
    window.$crisp = [] as unknown as Window["$crisp"];
    window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
    window.CRISP_RUNTIME_CONFIG = {
      locale: opts.locale ?? "da",
    };
    if (opts.tokenId) window.CRISP_TOKEN_ID = opts.tokenId;
    // Hide before the client paints — no floating bubble, ever.
    crispPush(["safe", true]);
    crispPush(["do", "chat:hide"]);
    crispPush(["on", "chat:closed", () => crispPush(["do", "chat:hide"])]);
  }

  if (loading) return;
  if (document.getElementById("crisp-sdk")) return;
  loading = true;
  const s = document.createElement("script");
  s.id = "crisp-sdk";
  s.src = "https://client.crisp.chat/l.js";
  s.async = true;
  s.onerror = () => {
    loading = false;
  };
  document.head.appendChild(s);
}

export function crispPush(cmd: CrispCommand): void {
  if (typeof window === "undefined") return;
  try {
    window.$crisp?.push(cmd);
  } catch {
    /* Crisp must never break the app. */
  }
}

export interface CrispIdentity {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  role?: string | null;
  country?: string | null;
  language?: string | null;
  customerId?: string | null;
  providerId?: string | null;
}

/** Sends who the user is + platform context so agents see everything instantly. */
export function identifyCrispUser(identity: CrispIdentity): void {
  if (identity.email) crispPush(["set", "user:email", [identity.email]]);
  if (identity.name) crispPush(["set", "user:nickname", [identity.name]]);
  if (identity.phone) crispPush(["set", "user:phone", [identity.phone]]);

  const data: Array<[string, string]> = [];
  const add = (k: string, v?: string | null) => {
    if (v) data.push([k, String(v)]);
  };
  add("user_id", identity.userId);
  add("role", identity.role);
  add("customer_id", identity.customerId);
  add("provider_id", identity.providerId);
  add("country", identity.country);
  add("language", identity.language);
  add("platform", typeof navigator !== "undefined" ? navigator.platform : null);
  add("browser", typeof navigator !== "undefined" ? navigator.userAgent : null);
  if (data.length) crispPush(["set", "session:data", [data]]);

  const segments = ["mycleaner"];
  if (identity.role) segments.push(identity.role);
  if (identity.country) segments.push(identity.country.toLowerCase());
  crispPush(["set", "session:segments", [segments]]);
}

/** Keeps the agent view in sync with where the user currently is. */
export function setCrispPage(path: string): void {
  crispPush(["set", "session:data", [[["current_page", path]]]]);
}

export interface BookingSupportContext {
  bookingId: string;
  status?: string | null;
  providerName?: string | null;
  providerId?: string | null;
  customerName?: string | null;
  date?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  market?: string | null;
}

/** Attaches booking metadata when support is opened from a booking. */
export function setCrispBookingContext(ctx: BookingSupportContext): void {
  const data: Array<[string, string]> = [["booking_id", ctx.bookingId]];
  const add = (k: string, v?: string | number | null) => {
    if (v !== null && v !== undefined && v !== "") data.push([k, String(v)]);
  };
  add("booking_status", ctx.status);
  add("booking_provider", ctx.providerName);
  add("booking_provider_id", ctx.providerId);
  add("booking_customer", ctx.customerName);
  add("booking_date", ctx.date);
  add(
    "booking_price",
    ctx.priceMinor != null && ctx.currency
      ? `${(ctx.priceMinor / 100).toFixed(2)} ${ctx.currency}`
      : null,
  );
  add("booking_market", ctx.market);
  crispPush(["set", "session:data", [data]]);
}

/** Tags the conversation with the support topic the user picked. */
export function setCrispTopic(topic: string): void {
  crispPush(["set", "session:data", [[["support_topic", topic]]]]);
  crispPush(["set", "session:event", [[[`support:${topic}`, {}, "blue"]]]]);
}

/** Pre-fills the composer inside the embedded chatbox. */
export function setCrispComposerText(text: string): void {
  crispPush(["do", "message:text", [text]]);
}

export function resetCrispSession(): void {
  crispPush(["do", "session:reset"]);
  crispPush(["do", "chat:hide"]);
}

/**
 * URL for the *embedded* Crisp chatbox (iframe). This is the official
 * standalone chatbox endpoint — it renders inline, never as a popup.
 */
export function crispEmbedUrl(params: {
  tokenId?: string;
  email?: string | null;
  nickname?: string | null;
  locale?: string;
}): string {
  const q = new URLSearchParams({ website_id: CRISP_WEBSITE_ID });
  if (params.tokenId) q.set("token_id", params.tokenId);
  if (params.email) q.set("user_email", params.email);
  if (params.nickname) q.set("user_nickname", params.nickname);
  if (params.locale) q.set("locale", params.locale);
  return `https://go.crisp.chat/chat/embed/?${q.toString()}`;
}
