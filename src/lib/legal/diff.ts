// Pure diff utilities for the legal document publishing flow.
// Line-level LCS diff for the side-by-side viewer + section-level change
// detection used to build the automatic changelog.

export type DiffType = "added" | "removed" | "unchanged";

export interface DiffLine {
  type: DiffType;
  text: string;
}

const MAX_LINES = 4000;

/** Line-level diff (LCS). Falls back to a coarse replace for huge inputs. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = (oldText ?? "").split("\n");
  const b = (newText ?? "").split("\n");
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    if (oldText === newText) return a.map((text) => ({ type: "unchanged" as const, text }));
    return [
      ...a.map((text) => ({ type: "removed" as const, text })),
      ...b.map((text) => ({ type: "added" as const, text })),
    ];
  }

  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "unchanged", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: "removed", text: a[i] });
      i++;
    } else {
      out.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "removed", text: a[i++] });
  while (j < m) out.push({ type: "added", text: b[j++] });
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce<DiffStats>(
    (acc, l) => {
      acc[l.type] += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}

export interface ComparableSection {
  section_key: string;
  title: string;
  hash: string;
  version?: string;
  section_order?: number;
}

export type ChangeKind = "added" | "removed" | "modified" | "reordered";

export interface SectionChange {
  kind: ChangeKind;
  section_key: string;
  title: string;
  from_version?: string | null;
  to_version?: string | null;
}

/** Compares two section sets by key + hash and produces changelog entries. */
export function detectSectionChanges(
  previous: ComparableSection[],
  next: ComparableSection[],
): SectionChange[] {
  const prev = new Map(previous.map((s) => [s.section_key, s]));
  const changes: SectionChange[] = [];

  for (const s of next) {
    const before = prev.get(s.section_key);
    if (!before) {
      changes.push({ kind: "added", section_key: s.section_key, title: s.title, to_version: s.version ?? null });
      continue;
    }
    if (before.hash !== s.hash) {
      changes.push({
        kind: "modified",
        section_key: s.section_key,
        title: s.title,
        from_version: before.version ?? null,
        to_version: s.version ?? null,
      });
    } else if (
      before.section_order !== undefined &&
      s.section_order !== undefined &&
      before.section_order !== s.section_order
    ) {
      changes.push({ kind: "reordered", section_key: s.section_key, title: s.title });
    }
  }

  const nextKeys = new Set(next.map((s) => s.section_key));
  for (const s of previous) {
    if (!nextKeys.has(s.section_key)) {
      changes.push({ kind: "removed", section_key: s.section_key, title: s.title, from_version: s.version ?? null });
    }
  }

  return changes;
}

/** Suggests the version bump implied by a change set. */
export function suggestBump(changes: SectionChange[]): "major" | "minor" | "patch" {
  if (changes.some((c) => c.kind === "removed")) return "major";
  if (changes.some((c) => c.kind === "added" || c.kind === "modified")) return "minor";
  return "patch";
}

export function summarizeChanges(changes: SectionChange[]): string {
  if (!changes.length) return "Ingen indholdsændringer";
  const label: Record<ChangeKind, string> = {
    added: "Tilføjet",
    removed: "Fjernet",
    modified: "Opdateret",
    reordered: "Omrokeret",
  };
  return changes.map((c) => `${label[c.kind]}: ${c.title}`).join(" · ");
}
