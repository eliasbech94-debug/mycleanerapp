// Booking-rule schema. This module is INPUT ONLY — algorithms live server-side.
// Client validation from here is advisory; the server re-validates every write.
import { z } from "zod";
import { CANCELLATION_TIERS } from "./cancellationPolicy";

/**
 * Customer cancellation is governed by the tiered ladder in
 * `cancellationPolicy.ts` (48h → 100%, 24h → 50%, below → 0%), NOT by a single
 * deadline. The value below is only the point at which a cancellation stops
 * producing any refund, derived from the ladder so the two cannot drift.
 */
export const CUSTOMER_NO_REFUND_THRESHOLD_HOURS =
  CANCELLATION_TIERS[CANCELLATION_TIERS.length - 2]?.minHoursBeforeStart ?? 24;

export const BookingRulesSchema = z.object({
  min_notice_minutes: z.number().int().min(0).default(120),
  same_day_enabled: z.boolean().default(true),
  same_day_surcharge_bps: z.number().int().min(0).max(10000).default(0),
  weekend_surcharge_bps: z.number().int().min(0).max(10000).default(0),
  holiday_surcharge_bps: z.number().int().min(0).max(10000).default(0),
  min_duration_minutes: z.number().int().min(15).default(60),
  max_duration_minutes: z.number().int().min(60).default(480),
  max_distance_km: z.number().int().min(1).default(50),
  provider_default_radius_km: z.number().int().min(1).default(25),
  /**
   * @deprecated Informational only. The authoritative refund outcome comes from
   * `refundPercentForHours()` in `cancellationPolicy.ts`.
   */
  customer_no_refund_below_hours: z.number().int().min(0).default(CUSTOMER_NO_REFUND_THRESHOLD_HOURS),

  provider_cancel_consequence: z.enum(["none", "warning", "fee", "suspend"]).default("fee"),
  auto_accept: z.boolean().default(false),
  request_expiry_minutes: z.number().int().min(5).default(120),
  reschedule_max: z.number().int().min(0).default(2),
  service_categories: z.array(z.string()).default(["cleaning"]),
  operating_days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  operating_hours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/).default("06:00"),
    end: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  }).default({ start: "06:00", end: "22:00" }),
});

export const PricingRulesSchema = z.object({
  // Ordered pipeline. Each stage rounds to minor units (integer cents/øre).
  // 1) base_price
  // 2) + same-day surcharge (if same day)
  // 3) + weekend surcharge (if operating_days weekend)
  // 4) + holiday surcharge (if country_holidays entry active + surcharge_eligible)
  // 5) - customer-funded discounts
  // 6) + customer-funded add-ons
  // 7) commission = round((subtotal * commission_bps) / 10000)
  // 8) VAT applied VAT-inclusive to the customer total (existing algorithm)
  // Platform-funded discounts reduce commission (not provider payout).
  // Customer-funded discounts reduce provider payout proportionally.
  stack_order: z.array(z.enum([
    "base", "same_day", "weekend", "holiday",
    "customer_discount", "customer_addon",
    "commission", "vat",
  ])).default([
    "base", "same_day", "weekend", "holiday",
    "customer_discount", "customer_addon", "commission", "vat",
  ]),
  rounding: z.enum(["banker", "half_up", "half_down"]).default("half_up"),
});

export type BookingRules = z.infer<typeof BookingRulesSchema>;
export type PricingRules = z.infer<typeof PricingRulesSchema>;
