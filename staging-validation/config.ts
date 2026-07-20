import "dotenv/config";
import { z } from "zod";

// Environments the harness will refuse to touch. Extend as needed.
const PROD_URL_DENYLIST = [
  "mycleaner.dk",              // production apex
  "www.mycleaner.dk",
  "mycleanerapp.lovable.app",  // production Lovable domain
];
// Known production Supabase project refs — MUST NEVER appear in staging config.
const PROD_SUPABASE_REFS = ["qfjgifubavuomwvroahy"];
// Live Stripe key prefixes — hard block.
const LIVE_STRIPE_PREFIXES = ["sk_live_", "pk_live_", "rk_live_"];
const STAGING_URL_HINT = /(staging|test|preview|dev|sandbox|rc2|localhost|127\.0\.0\.1|\.lovable\.app)/i;

function abortProd(reason: string): never {
  console.error(`\nABORTED — PRODUCTION ENVIRONMENT DETECTED\n  reason: ${reason}\n`);
  process.exit(3);
}

function assertStagingUrl(field: string, url: string) {
  const host = new URL(url).host.toLowerCase();
  for (const bad of PROD_URL_DENYLIST) {
    if (host === bad) {
      throw new Error(`${field}=${host} is on the production denylist — RC2 refuses to run against production.`);
    }
  }
  if (!STAGING_URL_HINT.test(host)) {
    throw new Error(`${field}=${host} does not look like a staging/test/preview host. Refusing to run. Override only by renaming the host.`);
  }
}

function assertStagingPg(conn: string) {
  const lower = conn.toLowerCase();
  for (const bad of PROD_URL_DENYLIST) {
    if (lower.includes(bad)) {
      throw new Error(`STAGING_PG_CONN points at a production hostname (${bad}). Refusing to run.`);
    }
  }
}

const Schema = z.object({
  STAGING_SUPABASE_URL: z.string().url(),
  STAGING_SUPABASE_ANON_KEY: z.string().min(20),
  STAGING_SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STAGING_PG_CONN: z.string().startsWith("postgresql://"),
  STAGING_APP_URL: z.string().url(),
  STRIPE_TEST_SECRET_KEY: z.string().startsWith("sk_test_", {
    message: "Live Stripe keys are refused. Use sk_test_ only.",
  }),
  STRIPE_TEST_PUBLISHABLE_KEY: z.string().startsWith("pk_test_", {
    message: "Live Stripe publishable keys are refused. Use pk_test_ only.",
  }),
  STRIPE_TEST_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_WEBHOOK_URL: z.string().url(),
  SUMSUB_APP_TOKEN: z.string().min(1),
  SUMSUB_SECRET_KEY: z.string().min(1),
  SUMSUB_WEBHOOK_SECRET: z.string().min(1),
  SUMSUB_WEBHOOK_URL: z.string().url(),
  TEST_EMAIL_DOMAIN: z.string().min(3),
  TEST_PASSWORD: z.string().min(10),
  K6_VUS: z.coerce.number().int().positive().default(50),
  K6_DURATION: z.string().default("60s"),
  RC2_ALLOW_DESTRUCTIVE_STAGING_TESTS: z.literal("true", {
    errorMap: () => ({
      message:
        "Set RC2_ALLOW_DESTRUCTIVE_STAGING_TESTS=true in .env to acknowledge this is a disposable staging environment.",
    }),
  }),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ RC2 preflight refused. Missing/invalid env:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(2);
}

// Production detection — hard abort with the exact required message.
const d = parsed.data;
for (const ref of PROD_SUPABASE_REFS) {
  if (d.STAGING_SUPABASE_URL.includes(ref) || d.STAGING_PG_CONN.includes(ref) ||
      d.STRIPE_WEBHOOK_URL.includes(ref) || d.SUMSUB_WEBHOOK_URL.includes(ref)) {
    abortProd(`Supabase project ref ${ref} is production.`);
  }
}
for (const p of LIVE_STRIPE_PREFIXES) {
  if (d.STRIPE_TEST_SECRET_KEY.startsWith(p) || d.STRIPE_TEST_PUBLISHABLE_KEY.startsWith(p)) {
    abortProd(`Live Stripe key detected (prefix ${p}).`);
  }
}
if (!/sbx[:\-_]/i.test(d.SUMSUB_APP_TOKEN)) {
  abortProd(`Sumsub app token is not a sandbox token (must contain 'sbx').`);
}
try {
  new URL(d.STAGING_APP_URL).host.toLowerCase();
} catch {}
for (const bad of PROD_URL_DENYLIST) {
  const host = new URL(d.STAGING_APP_URL).host.toLowerCase();
  if (host === bad) abortProd(`STAGING_APP_URL host ${host} is production.`);
}
if (d.RC2_ALLOW_DESTRUCTIVE_STAGING_TESTS !== "true") {
  console.error("❌ RC2_ALLOW_DESTRUCTIVE_STAGING_TESTS must be exactly 'true'."); process.exit(2);
}

// Environment protection — refuse production hosts / non-staging hosts.
try {
  assertStagingUrl("STAGING_SUPABASE_URL", d.STAGING_SUPABASE_URL);
  assertStagingUrl("STAGING_APP_URL", d.STAGING_APP_URL);
  assertStagingUrl("STRIPE_WEBHOOK_URL", d.STRIPE_WEBHOOK_URL);
  assertStagingUrl("SUMSUB_WEBHOOK_URL", d.SUMSUB_WEBHOOK_URL);
  assertStagingPg(d.STAGING_PG_CONN);
} catch (e) {
  console.error(`❌ RC2 environment guard: ${(e as Error).message}`);
  process.exit(2);
}

export const env = parsed.data;

export const RUN_ID =
  process.env.RC2_RUN_ID ??
  new Date().toISOString().replace(/[:.]/g, "-");

// Every seeded record is prefixed with this so cleanup can target them safely
// and no real user / provider / booking is ever modified.
export const RC2_TAG = `rc2-${RUN_ID}`;
export const rc2Email = (slot: string) =>
  `rc2+${RUN_ID}-${slot}@${env.TEST_EMAIL_DOMAIN}`;

export const EVIDENCE_DIR = `${process.cwd()}/evidence/${RUN_ID}`;
