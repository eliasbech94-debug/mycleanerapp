import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { env } from "../config.js";

export const admin = createClient(
  env.STAGING_SUPABASE_URL,
  env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const anon = createClient(
  env.STAGING_SUPABASE_URL,
  env.STAGING_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Run a read-only SQL and return rows as JSON. Uses psql for auditable snapshots. */
export function psqlJson<T = any>(sql: string): T[] {
  const out = execSync(
    `psql "${env.STAGING_PG_CONN}" -A -t -X -c "select json_agg(t) from (${sql.replace(/"/g, '\\"')}) t;"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  if (!out || out === "") return [];
  return JSON.parse(out) as T[];
}
