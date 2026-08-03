import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCountryPath } from "@/lib/countryPath";
import { setCrispBookingContext, setCrispTopic, type BookingSupportContext } from "@/lib/crisp";

export type SupportTopic =
  | "booking"
  | "payment"
  | "refund"
  | "provider_issue"
  | "account"
  | "verification"
  | "other";

export interface OpenSupportOptions {
  topic?: SupportTopic;
  booking?: BookingSupportContext;
  /** Pre-filled first message shown to the user in the composer. */
  message?: string;
}

/**
 * Single entry point for every "need help" action in MyCleaner.
 * Attaches context to the Crisp session, then routes the user to the
 * in-app Support Center where the embedded chat lives.
 */
export function useSupportCenter() {
  const nav = useNavigate();
  const cp = useCountryPath();

  const openSupport = useCallback(
    (opts: OpenSupportOptions = {}) => {
      if (opts.topic) setCrispTopic(opts.topic);
      if (opts.booking) setCrispBookingContext(opts.booking);

      const q = new URLSearchParams();
      if (opts.topic) q.set("topic", opts.topic);
      if (opts.booking?.bookingId) q.set("booking", opts.booking.bookingId);
      if (opts.message) q.set("m", opts.message);
      const qs = q.toString();
      nav(cp(`/help${qs ? `?${qs}` : ""}`));
    },
    [nav, cp],
  );

  return { openSupport };
}
