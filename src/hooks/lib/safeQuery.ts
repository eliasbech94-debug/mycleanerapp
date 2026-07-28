/**
 * safeQuery — wrap a Supabase PostgREST call so it never throws.
 *
 * Returns `{ data, error }` where `error` is a **user-safe** Danish string
 * (never raw SQL, tokens, JWT claims or internal messages) and the
 * developer-facing details are only logged to `console.warn` in dev.
 *
 * Use with `Promise.all([...])` so a single failed slice does not remove
 * data returned by the other parallel queries.
 */

const DEV = typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;

export type SafeQueryResult<T> = { data: T | null; error: string | null };

const FRIENDLY = "Vi kunne ikke hente disse data lige nu. Prøv igen om et øjeblik.";

export async function safeQuery<T>(
  label: string,
  builder: PromiseLike<{ data: T | null; error: { message?: string } | null }>,
): Promise<SafeQueryResult<T>> {
  try {
    const res = await builder;
    if (res.error) {
      if (DEV) console.warn(`[safeQuery] ${label} failed:`, res.error.message);
      return { data: (res.data ?? null) as T | null, error: FRIENDLY };
    }
    return { data: (res.data ?? null) as T | null, error: null };
  } catch (e) {
    if (DEV) console.warn(`[safeQuery] ${label} threw:`, (e as Error)?.message);
    return { data: null, error: FRIENDLY };
  }
}

/** Convenience: aggregate multiple slice errors into a single top-level message. */
export function aggregateError(parts: Array<string | null>): string | null {
  const failed = parts.filter(Boolean).length;
  if (failed === 0) return null;
  if (failed === parts.length) return "Vi kunne ikke hente dine data. Tjek din forbindelse og prøv igen.";
  return "Nogle sektioner kunne ikke indlæses. Prøv at genindlæse.";
}
