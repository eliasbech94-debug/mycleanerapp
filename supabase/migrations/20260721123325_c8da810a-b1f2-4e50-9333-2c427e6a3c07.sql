-- P0.1: Lock down authoritative pricing / quote-locked checkout.
--
-- (1) Remove direct customer INSERT into bookings. All customer bookings must
--     be created by the `payment-create-intent` edge function (service role)
--     after a valid, locked pricing quote is verified server-side. This closes
--     the client-trusted-pricing hole.
DROP POLICY IF EXISTS "Customers insert own bookings" ON public.bookings;

-- (2) Idempotency: a single locked pricing quote maps to at most one booking.
--     Retrying `payment-create-intent` with the same quote_id must reuse the
--     existing booking + PaymentIntent instead of creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_pricing_calculation_id_uniq
  ON public.bookings(pricing_calculation_id)
  WHERE pricing_calculation_id IS NOT NULL;