// Semantic versioning helpers for legal documents (major.minor.patch).
// Legacy documents stored versions like "1.0" or "1.0-draft"; parsing is
// tolerant so nothing breaks for existing rows.

export interface SemVersion {
  major: number;
  minor: number;
  patch: number;
  label?: string;
}

export type VersionBump = "major" | "minor" | "patch";

export function parseVersion(input: string | null | undefined): SemVersion {
  const raw = (input ?? "").trim();
  const m = raw.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.+))?$/);
  if (!m) return { major: 1, minor: 0, patch: 0, label: raw || undefined };
  return {
    major: Number(m[1]),
    minor: Number(m[2] ?? 0),
    patch: Number(m[3] ?? 0),
    label: m[4],
  };
}

export function formatVersion(v: SemVersion): string {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  return v.label ? `${base}-${v.label}` : base;
}

export function bumpVersion(input: string | null | undefined, bump: VersionBump): string {
  const v = parseVersion(input);
  if (bump === "major") return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
  if (bump === "minor") return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
  return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
}

/** -1 / 0 / 1 — labels (pre-release) sort before the plain version. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (const key of ["major", "minor", "patch"] as const) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1;
  }
  if (Boolean(x.label) === Boolean(y.label)) return 0;
  return x.label ? -1 : 1;
}

/**
 * Normalises any legacy version string to strict semver ("1.0" -> "1.0.0",
 * "1.0-draft" -> "1.1.0"). Matches the database migration rules so the
 * `legal_documents_semver_format` constraint can never be violated.
 */
export function normalizeVersion(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (/^\d+\.\d+\.\d+$/.test(raw)) return raw;
  const v = parseVersion(raw);
  if (v.label) return `${v.major}.${v.minor + 1}.0`;
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** Section versions are strict semver too (database constraint). */
export function bumpSectionVersion(input: string | null | undefined, bump: VersionBump = "minor"): string {
  return bumpVersion(normalizeVersion(input), bump);
}

