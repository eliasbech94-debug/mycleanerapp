/**
 * Eligibility rules for the provider "First job completed" celebration popup.
 *
 * The database is the single source of truth: the server RPC
 * `get_first_completed_job_popup_state()` decides eligibility from
 * `profiles.first_completed_job_popup_seen_at` plus the provider's first
 * completed *and captured* booking. localStorage is never consulted, so the
 * popup cannot reappear after a refresh, a re-login or on another device.
 */

export type FirstJobPopupState = {
  eligible: boolean;
  seen_at?: string | null;
  booking_id?: string | null;
  completed_at?: string | null;
};

/** Defensive parser for the RPC payload — anything unexpected means "don't show". */
export function parseFirstJobPopupState(raw: unknown): FirstJobPopupState {
  if (!raw || typeof raw !== "object") return { eligible: false };
  const value = raw as Record<string, unknown>;
  return {
    eligible: value.eligible === true,
    seen_at: typeof value.seen_at === "string" ? value.seen_at : null,
    booking_id: typeof value.booking_id === "string" ? value.booking_id : null,
    completed_at: typeof value.completed_at === "string" ? value.completed_at : null,
  };
}

/** Client-side guard mirroring the server rule (defence in depth). */
export function shouldShowFirstJobPopup(state: FirstJobPopupState, isProvider: boolean): boolean {
  if (!isProvider) return false;
  if (state.seen_at) return false;
  return state.eligible === true && Boolean(state.booking_id);
}

/** Route the primary CTA points to. */
export const FIRST_JOB_DASHBOARD_ROUTE = "/provider-dashboard";
