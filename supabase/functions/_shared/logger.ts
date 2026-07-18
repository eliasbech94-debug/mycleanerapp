// Structured logger + PII scrubber + correlation ID + error_events writer.
// All privacy-critical edge functions should import { getLogger } here.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const RELEASE = Deno.env.get("APP_RELEASE") ?? "unknown";
const ENVIRONMENT = Deno.env.get("APP_ENVIRONMENT") ?? "production";

const REDACT_KEYS = new Set([
  "password","password_hash","token","access_token","refresh_token",
  "authorization","cookie","set-cookie","otp","code","sms_code",
  "cpr","cvr","vat","tax_id","tax_id_enc","tax_id_encrypted",
  "iban","bic","account_number","card_number","cvc","cvv",
  "stripe_secret_key","webhook_secret","api_key","service_role_key",
  "signed_url","download_url",
]);

function isSensitiveKey(k: string) {
  const lower = k.toLowerCase();
  if (REDACT_KEYS.has(lower)) return true;
  return /(password|token|secret|otp|cpr|cvr|iban|card|cvv|cvc|signed[_-]?url)/.test(lower);
}

/** Deep-clone with sensitive keys replaced by "[redacted]". */
export function scrubForLog<T>(input: T, depth = 0): T {
  if (input == null || depth > 6) return input;
  if (typeof input === "string") {
    // Strip anything that looks like a bearer token or long secret
    return input.replace(/(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,})/g, "[redacted-jwt]") as unknown as T;
  }
  if (Array.isArray(input)) return input.map((v) => scrubForLog(v, depth + 1)) as unknown as T;
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? "[redacted]" : scrubForLog(v, depth + 1);
    }
    return out as unknown as T;
  }
  return input;
}

/** Correlation ID extracted from headers or freshly minted. */
export function correlationId(req: Request): string {
  return (
    req.headers.get("x-correlation-id") ??
    req.headers.get("x-request-id") ??
    crypto.randomUUID()
  );
}

let sharedAdmin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (sharedAdmin) return sharedAdmin;
  sharedAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return sharedAdmin;
}

export interface LogContext {
  function_name: string;
  correlation_id: string;
  user_id?: string | null;
  booking_id?: string | null;
  payment_id?: string | null;
  dispute_id?: string | null;
  job_id?: string | null;
  request_id?: string | null;
}

export function getLogger(fn: string, req?: Request) {
  const corr = req ? correlationId(req) : crypto.randomUUID();
  const started = performance.now();
  const ctx: LogContext = { function_name: fn, correlation_id: corr };

  function line(level: string, message: string, meta?: Record<string, unknown>) {
    const record = {
      ts: new Date().toISOString(), level, release: RELEASE, environment: ENVIRONMENT,
      ...ctx, message, ...(meta ? scrubForLog(meta) : {}),
    };
    console.log(JSON.stringify(record));
  }

  return {
    correlationId: corr,
    setContext(patch: Partial<LogContext>) { Object.assign(ctx, patch); },
    info(msg: string, meta?: Record<string, unknown>) { line("info", msg, meta); },
    warn(msg: string, meta?: Record<string, unknown>) { line("warning", msg, meta); },
    debug(msg: string, meta?: Record<string, unknown>) { line("debug", msg, meta); },
    /** Records a fatal/error and persists to error_events. Never throws. */
    async error(err: unknown, meta?: Record<string, unknown>) {
      const e = err instanceof Error ? err : new Error(String(err));
      line("error", e.message, { ...meta, stack: e.stack });
      try {
        await getAdmin().from("error_events").insert({
          source: "edge_function",
          level: "error",
          environment: ENVIRONMENT,
          release: RELEASE,
          function_name: ctx.function_name,
          message: e.message.slice(0, 2000),
          stack: (e.stack ?? "").slice(0, 8000),
          correlation_id: ctx.correlation_id,
          user_id: ctx.user_id ?? null,
          booking_id: ctx.booking_id ?? null,
          payment_id: ctx.payment_id ?? null,
          dispute_id: ctx.dispute_id ?? null,
          job_id: ctx.job_id ?? null,
          error_category: (meta?.category as string | undefined) ?? "unhandled",
          duration_ms: Math.round(performance.now() - started),
          metadata: scrubForLog(meta ?? {}),
        });
      } catch (persistErr) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(), level: "error",
          message: "error_events_write_failed",
          detail: String(persistErr),
        }));
      }
    },
    /** Attach headers to outgoing Response so trace propagates. */
    injectHeaders(h: Record<string, string> = {}) {
      return { ...h, "x-correlation-id": corr, "x-release": RELEASE };
    },
    /** Duration ms since logger created. */
    durationMs() { return Math.round(performance.now() - started); },
  };
}

/** Wrap Deno.serve handler with a top-level try/catch that logs failures. */
export function monitored(name: string, handler: (req: Request, log: ReturnType<typeof getLogger>) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const log = getLogger(name, req);
    try {
      const res = await handler(req, log);
      // Ensure correlation header is present on every response
      const h = new Headers(res.headers);
      h.set("x-correlation-id", log.correlationId);
      h.set("x-release", RELEASE);
      return new Response(res.body, { status: res.status, headers: h });
    } catch (err) {
      await log.error(err, { category: "top_level_uncaught" });
      return new Response(
        JSON.stringify({ error: "internal_error", correlation_id: log.correlationId }),
        { status: 500, headers: { "Content-Type": "application/json", "x-correlation-id": log.correlationId } },
      );
    }
  };
}
