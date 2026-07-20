// Central redactor. Every artifact written to evidence goes through here so
// no secret value (Authorization / apikey headers, service-role keys, DB
// connection strings, Stripe secret keys, webhook secrets, Sumsub credentials,
// session tokens, signed URLs, payment client secrets) can leak into logs,
// reports, manifests, screenshots metadata or webhook payload copies.

const SECRET_ENV_KEYS = [
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
  "STAGING_SUPABASE_ANON_KEY",
  "STAGING_PG_CONN",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_PUBLISHABLE_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
  "SUMSUB_APP_TOKEN",
  "SUMSUB_SECRET_KEY",
  "SUMSUB_WEBHOOK_SECRET",
  "TEST_PASSWORD",
];

const SECRET_HEADER_RE =
  /^(authorization|apikey|api[-_]?key|cookie|set-cookie|x-payload-digest|stripe-signature|x-sumsub-.*|x-.*-signature|x-.*-token|x-.*-secret)$/i;

const SECRET_FIELD_RE =
  /(password|secret|token|api[-_]?key|service[-_]?role|client[-_]?secret|signature|signed[-_]?url|access[-_]?token|refresh[-_]?token|session|cookie)/i;

// Value shapes we always mask, even when the key name looks innocent.
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk_(live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bpk_(live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bwhsec_[A-Za-z0-9]{10,}\b/g,
  /\brk_(live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bpi_[A-Za-z0-9]{10,}_secret_[A-Za-z0-9]+\b/g,
  /\bseti_[A-Za-z0-9]{10,}_secret_[A-Za-z0-9]+\b/g,
  /\bcs_(live|test)_[A-Za-z0-9]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWTs
  /postgresql:\/\/[^\s"']+/gi,
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
];

function redactString(s: string): string {
  let out = s;
  // Mask known env values verbatim.
  for (const k of SECRET_ENV_KEYS) {
    const v = process.env[k];
    if (v && v.length >= 8 && out.includes(v)) {
      out = out.split(v).join(`***redacted:${k}***`);
    }
  }
  for (const re of SECRET_VALUE_PATTERNS) out = out.replace(re, "***redacted***");
  return out;
}

export function redactHeaders(h?: Record<string, string> | Headers): Record<string, string> {
  if (!h) return {};
  const entries: [string, string][] =
    h instanceof Headers ? Array.from(h.entries()) : Object.entries(h);
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (SECRET_HEADER_RE.test(k)) out[k] = "***redacted***";
    else out[k] = redactString(String(v));
  }
  return out;
}

export function redactValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") return redactString(v);
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(redactValue);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (SECRET_FIELD_RE.test(k) && typeof val === "string") {
      out[k] = "***redacted***";
    } else {
      out[k] = redactValue(val);
    }
  }
  return out;
}
