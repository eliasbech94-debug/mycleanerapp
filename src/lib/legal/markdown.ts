// Pure helpers for legal markdown rendering: heading extraction, anchor ids
// and reading time. No DOM access so they are unit-testable.

export interface LegalHeading {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "oe")
    .replace(/[å]/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Extracts H2–H4 headings, skipping fenced code blocks. */
export function extractHeadings(markdown: string): LegalHeading[] {
  const out: LegalHeading[] = [];
  let inFence = false;
  for (const line of (markdown ?? "").split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{2,4})\s+(.*)$/);
    if (!m) continue;
    const text = m[2].trim().replace(/#+\s*$/, "");
    if (!text) continue;
    out.push({ id: headingId(text), text, level: m[1].length as 2 | 3 | 4 });
  }
  return out;
}

/** Approximate reading time in whole minutes (min 1), ~200 wpm. */
export function readingTimeMinutes(markdown: string, wordsPerMinute = 200): number {
  const words = (markdown ?? "").replace(/```[\s\S]*?```/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
}
