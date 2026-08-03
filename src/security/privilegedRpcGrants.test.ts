/**
 * Regression guard: privileged SECURITY DEFINER RPCs must never be executable
 * by `anon` or `authenticated`.
 *
 * Background — these were all reachable by unauthenticated visitors in
 * production:
 *
 * - The email-queue functions let anyone inject jobs into MyCleaner's outbound
 *   email queue and read or delete pending mail (recipients, links, tokens).
 * - `campaign_email_outbox_cleanup` let anyone delete outbox rows.
 * - `generate_mycleaner_id` burned a global sequence on every call, allowing
 *   ID exhaustion and gaps in the customer-number series.
 *
 * They are service_role-only. This test probes the live PostgREST API with the
 * public anon key and fails if any of them becomes callable again.
 *
 * A locked function answers with either:
 *   - 404 / PGRST202 — not exposed in the anon schema cache at all, or
 *   - 401|403 / 42501 — "permission denied for function".
 * Anything else (notably 200) means the lock regressed.
 */
import { describe, expect, it } from "vitest";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

/** Functions that must be unreachable for anon and authenticated. */
const LOCKED_RPCS: ReadonlyArray<{ fn: string; body: Record<string, unknown> }> = [
  { fn: "enqueue_email", body: { queue_name: "transactional_emails", payload: {} } },
  { fn: "read_email_batch", body: { queue_name: "transactional_emails", batch_size: 1, vt: 5 } },
  { fn: "delete_email", body: { queue_name: "transactional_emails", message_id: 1 } },
  {
    fn: "move_to_dlq",
    body: {
      source_queue: "transactional_emails",
      dlq_name: "transactional_emails_dlq",
      message_id: 1,
      payload: {},
    },
  },
  { fn: "email_queue_dispatch", body: {} },
  { fn: "campaign_email_outbox_cleanup", body: {} },
  { fn: "generate_mycleaner_id", body: { country_code: "DK" } },
];

/** PostgREST/Postgres codes that prove the function is NOT callable. */
const LOCKED_CODES = new Set(["PGRST202", "PGRST203", "42501"]);

type ProbeResult = { status: number; code: string | null; raw: string };

async function probeAsAnon(
  fn: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ProbeResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  const raw = await res.text();
  let code: string | null = null;
  try {
    code = (JSON.parse(raw) as { code?: string }).code ?? null;
  } catch {
    code = null;
  }
  return { status: res.status, code, raw: raw.slice(0, 300) };
}

const configured = Boolean(SUPABASE_URL && ANON_KEY);

function isLocked(result: ProbeResult): boolean {
  return (
    result.status === 404 ||
    result.status === 401 ||
    result.status === 403 ||
    (result.code !== null && LOCKED_CODES.has(result.code))
  );
}

describe("privileged RPCs are not executable by anon", () => {
  it.runIf(configured)(
    "every service_role-only RPC rejects anonymous callers",
    async (ctx) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);

      let results: Array<{ fn: string; result: ProbeResult }>;
      try {
        results = await Promise.all(
          LOCKED_RPCS.map(async ({ fn, body }) => ({
            fn,
            result: await probeAsAnon(fn, body, controller.signal),
          })),
        );
      } catch {
        // No network egress in this environment — skip rather than report a
        // false failure. The check still runs wherever egress is available.
        ctx.skip();
        return;
      } finally {
        clearTimeout(timer);
      }

      const leaked = results.filter(({ result }) => !isLocked(result));

      expect(
        leaked,
        leaked.length === 0
          ? ""
          : "SECURITY REGRESSION — these functions are callable by anon:\n" +
            leaked
              .map(
                ({ fn, result }) =>
                  `  public.${fn}: HTTP ${result.status} code=${result.code} ${result.raw}\n` +
                  `    Fix: REVOKE ALL ON FUNCTION public.${fn}(...) FROM PUBLIC, anon, authenticated;`,
              )
              .join("\n"),
      ).toEqual([]);

      // A 200 is the specific catastrophic case — assert it explicitly too.
      for (const { fn, result } of results) {
        expect(result.status, `public.${fn} executed successfully for anon`).not.toBe(
          200,
        );
      }
    },
    30_000,
  );
});

