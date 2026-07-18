// Frontend monitoring — correlation IDs, redaction, error capture, edge-function
// error reporter. Sentry SDK integration (opt-in via VITE_SENTRY_DSN).
import { supabase } from "@/integrations/supabase/client";
import * as Sentry from "@sentry/react";

const RELEASE = (import.meta.env.VITE_APP_RELEASE as string | undefined) ?? "dev";
const DEPLOYMENT = (import.meta.env.VITE_APP_DEPLOYMENT as string | undefined) ?? undefined;
const ENVIRONMENT = (import.meta.env.VITE_APP_ENVIRONMENT as string | undefined)
  ?? (import.meta.env.MODE as string | undefined) ?? "production";
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const SENTRY_TRACES = Number(import.meta.env.VITE_SENTRY_TRACES ?? "0.1");

/** Initialise Sentry (safe no-op when DSN absent). Call once at bootstrap. */
export function initSentry() {
  if (!SENTRY_DSN || typeof window === "undefined") return;
  if ((Sentry as any).__initialized) return;
  (Sentry as any).__initialized = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    release: RELEASE,
    environment: ENVIRONMENT,
    dist: DEPLOYMENT,
    tracesSampleRate: Number.isFinite(SENTRY_TRACES) ? SENTRY_TRACES : 0.1,
    // Do not automatically capture PII / IP.
    sendDefaultPii: false,
    // Strip sensitive keys BEFORE transmission.
    beforeSend(event) {
      try {
        if (event.request?.cookies) delete event.request.cookies;
        if (event.request?.headers) {
          for (const h of Object.keys(event.request.headers)) {
            if (/authorization|cookie|api[-_]?key/i.test(h)) delete event.request.headers[h];
          }
        }
        event.extra = scrub(event.extra ?? {}) as any;
        event.contexts = scrub(event.contexts ?? {}) as any;
        if (event.message) event.message = String(event.message).slice(0, 4000);
      } catch { /* ignore */ }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data) as any;
      return breadcrumb;
    },
  });
  Sentry.setTag("correlation_id", correlationId());
}

const SENSITIVE = /(password|token|secret|otp|cpr|cvr|iban|card|cvv|cvc|authorization|cookie|signed[_-]?url)/i;

export function scrub<T>(input: T, depth = 0): T {
  if (input == null || depth > 6) return input;
  if (typeof input === "string") {
    return input.replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}/g, "[redacted-jwt]") as unknown as T;
  }
  if (Array.isArray(input)) return input.map((v) => scrub(v, depth + 1)) as unknown as T;
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : scrub(v, depth + 1);
    }
    return out as unknown as T;
  }
  return input;
}

/** One correlation ID per browser session — regenerated on refresh. */
let _corr: string | null = null;
export function correlationId(): string {
  if (_corr) return _corr;
  try {
    _corr = crypto.randomUUID();
  } catch {
    _corr = String(Math.random()).slice(2) + Date.now().toString(36);
  }
  return _corr!;
}

/** Fresh correlation ID for a new user action (e.g. a booking submit). */
export function newActionCorrelationId(): string {
  _corr = crypto.randomUUID();
  return _corr;
}

interface CaptureInput {
  message: string;
  category?: string;
  level?: "info" | "warning" | "error" | "fatal";
  stack?: string;
  route?: string;
  status_code?: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

export async function captureError(input: CaptureInput | Error, meta?: Record<string, unknown>) {
  const err = input instanceof Error
    ? { message: input.message, stack: input.stack, category: "js_error" }
    : input;
  const payload = {
    ...err,
    level: (err as CaptureInput).level ?? "error",
    metadata: scrub({ ...(meta ?? {}), ...((err as CaptureInput).metadata ?? {}) }),
    correlation_id: correlationId(),
    release: RELEASE,
    environment: ENVIRONMENT,
    route: (err as CaptureInput).route ?? (typeof window !== "undefined" ? window.location.pathname : null),
  };

  try {
    await supabase.functions.invoke("client-error", { body: payload });
  } catch { /* swallow */ }

  if (SENTRY_DSN && typeof (globalThis as any).Sentry?.captureException === "function") {
    try {
      (globalThis as any).Sentry.captureException(input instanceof Error ? input : new Error(payload.message), {
        tags: { category: payload.category, release: RELEASE, correlation_id: payload.correlation_id },
        extra: payload.metadata,
      });
    } catch { /* ignore */ }
  }
}

/** Install global handlers exactly once. */
let installed = false;
export function installFrontendMonitoring() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (ev) => {
    captureError({
      message: ev.message ?? "window.error",
      stack: ev.error?.stack,
      category: "window_error",
      metadata: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    captureError({
      message: err.message, stack: err.stack, category: "unhandled_promise",
    });
  });
}

/** Wrap an async action so errors are captured with a shared correlation ID. */
export async function tracked<T>(name: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
  const started = performance.now();
  const corr = newActionCorrelationId();
  try {
    const result = await fn();
    return result;
  } catch (err) {
    await captureError({
      message: `${name}_failed: ${(err as Error).message}`,
      stack: (err as Error).stack,
      category: name,
      duration_ms: performance.now() - started,
      metadata: { ...meta, correlation_id: corr },
    });
    throw err;
  }
}
