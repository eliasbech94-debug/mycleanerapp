/**
 * MyCleaner — central launch configuration.
 *
 * SINGLE SOURCE OF TRUTH for the "Early Access" launch mode (1. august).
 *
 * Early Access = signup, login, provider onboarding, profiles and
 * information pages are fully open, while every UI action that can move,
 * reserve or refund money is disabled.
 *
 * This is a FRONTEND safety layer only. It never replaces backend
 * validation, RLS or edge-function authorisation.
 */

export const EARLY_ACCESS_MODE = true as boolean;

export const EARLY_ACCESS_COPY = {
  bannerTitle: "MyCleaner Early Access",
  bannerBody:
    "Opret din profil og bliv en af de første på platformen. Bookinger åbner snart.",
  lockedTitle: "Bookinger åbner snart",
  lockedBody:
    "Du kan allerede nu oprette din profil og finde relevante providers. Vi giver besked, når booking åbner.",
  lockedCta: "Bookinger åbner snart",
} as const;

/** True when a booking / checkout / payment UI action must be blocked. */
export function isBookingLocked(): boolean {
  return EARLY_ACCESS_MODE;
}

/**
 * True when any financial action (PaymentIntent, capture, refund, payout)
 * may be initiated from the UI.
 */
export function canPerformFinancialAction(): boolean {
  return !EARLY_ACCESS_MODE;
}
