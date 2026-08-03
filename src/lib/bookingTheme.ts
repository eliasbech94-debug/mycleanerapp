/**
 * Shared MyCleaner booking palette.
 *
 * SINGLE SOURCE OF TRUTH for every surface in the booking funnel
 * (entry, flow, plan, confirmation, my bookings, early-access gate).
 * Aligned with the premium navy/blue system used by the marketplace,
 * provider profiles and dashboards — no legacy cream/orange values.
 *
 *   ink    = primary text / dark surfaces (navy)
 *   brand  = primary action + accent (MyCleaner blue)
 *   canvas = page background
 *   paper  = card surface
 *   teal   = success / validated
 *   mint   = soft success surface
 *   line   = hairline borders
 */
export const BOOKING_COLORS = {
  ink: "#0d1b3e",
  brand: "hsl(222 88% 42%)",
  canvas: "#f4f7fc",
  paper: "#ffffff",
  teal: "#0f7a5a",
  mint: "#dff1e7",
  line: "#d8e1f2",
} as const;

/**
 * Back-compat alias so existing booking screens can keep their `C.orange`
 * / `C.cream` key names while rendering the new premium palette.
 */
export const C = {
  ink: BOOKING_COLORS.ink,
  orange: BOOKING_COLORS.brand,
  cream: BOOKING_COLORS.canvas,
  paper: BOOKING_COLORS.paper,
  teal: BOOKING_COLORS.teal,
  mint: BOOKING_COLORS.mint,
  line: BOOKING_COLORS.line,
} as const;

/** Shared focus ring for every interactive element in the booking funnel. */
export const BOOKING_FOCUS =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 focus-visible:ring-offset-white";
