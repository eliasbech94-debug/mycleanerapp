import "dotenv/config";
import { z } from "zod";

const Schema = z.object({
  STAGING_SUPABASE_URL: z.string().url(),
  STAGING_SUPABASE_ANON_KEY: z.string().min(20),
  STAGING_SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STAGING_PG_CONN: z.string().startsWith("postgresql://"),
  STAGING_APP_URL: z.string().url(),
  STRIPE_TEST_SECRET_KEY: z.string().startsWith("sk_test_"),
  STRIPE_TEST_PUBLISHABLE_KEY: z.string().startsWith("pk_test_"),
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
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Missing/invalid env vars for RC2 harness:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(2);
}
export const env = parsed.data;

export const RUN_ID =
  process.env.RC2_RUN_ID ??
  new Date().toISOString().replace(/[:.]/g, "-");
export const EVIDENCE_DIR = `${process.cwd()}/evidence/${RUN_ID}`;
