/**
 * Eligibility rules for the post-signup welcome video popup.
 *
 * Source of truth is the database column `profiles.welcome_video_seen_at`.
 * localStorage/sessionStorage are never consulted — a user who saw the video
 * on one device must not see it again on another.
 *
 * The popup is a *signup* experience, so it additionally requires the account
 * to have been created very recently. Existing users signing in never see it,
 * even when their `welcome_video_seen_at` is still null (backfill-free).
 */

/** How long after account creation the welcome video may still appear. */
export const WELCOME_VIDEO_SIGNUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export type WelcomeVideoEligibilityInput = {
  /** Value of profiles.welcome_video_seen_at (null when never seen). */
  seenAt: string | null | undefined;
  /** auth user created_at (ISO string). */
  userCreatedAt: string | null | undefined;
  /** Current time, injectable for tests. */
  now?: number;
};

export function isWelcomeVideoEligible({
  seenAt,
  userCreatedAt,
  now = Date.now(),
}: WelcomeVideoEligibilityInput): boolean {
  if (seenAt) return false;
  if (!userCreatedAt) return false;
  const created = Date.parse(userCreatedAt);
  if (Number.isNaN(created)) return false;
  const age = now - created;
  // Guard against clock skew producing a "future" account.
  if (age < -60_000) return false;
  return age <= WELCOME_VIDEO_SIGNUP_WINDOW_MS;
}

export type WelcomeVideoAudience = "customer" | "provider";

export function resolveWelcomeVideoAudience(roles: readonly string[]): WelcomeVideoAudience {
  return roles.includes("provider") ? "provider" : "customer";
}

/** Route each audience's primary CTA points to. */
export function welcomeVideoCtaRoute(audience: WelcomeVideoAudience): string {
  // Provider onboarding resumes server-side at the first incomplete step.
  return audience === "provider" ? "/bliv-cleaner" : "/find-cleaner";
}
