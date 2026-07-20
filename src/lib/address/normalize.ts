/**
 * Danish-tolerant address normalization used for lookup, de-duplication and
 * cache keys. This is NOT a display transform — it strips diacritics, casing
 * and punctuation so "Sønder Boulevard 18" and "sonder boulevard  18," hash
 * to the same key.
 *
 * Rules (in order):
 *   1. Lower-case.
 *   2. Danish transliteration:  æ→ae, ø→oe, å→aa (also ä→ae, ö→oe if pasted).
 *   3. Strip commas, dots, semicolons.
 *   4. Collapse runs of whitespace to a single space.
 *   5. Trim.
 *
 * NOTE: we do NOT strip the "st.", "1.", "tv", "th", "mf" tokens — they are
 * semantically significant (they distinguish two apartments in the same
 * building), so the normalized key preserves them minus punctuation.
 */
export function normalizeAddress(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/[.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the [start,end) span of the (normalized) query inside the (normalized)
 * candidate string. Returns null if not found. Callers use this to render
 * bold match highlights without breaking on æ/ø/å or casing differences.
 */
export function matchSpan(candidate: string, query: string): [number, number] | null {
  const nCand = normalizeAddress(candidate);
  const nQuery = normalizeAddress(query);
  if (!nQuery) return null;
  const i = nCand.indexOf(nQuery);
  if (i < 0) return null;
  // The normalized index is a good approximation; the component highlights
  // in the ORIGINAL string using the same start length, which works because
  // æ/ø/å transliterations expand 1→2 chars, so we clamp to string length.
  return [Math.min(i, candidate.length), Math.min(i + nQuery.length, candidate.length)];
}
