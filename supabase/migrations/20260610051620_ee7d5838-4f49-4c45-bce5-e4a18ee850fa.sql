ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS refund_id text,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount integer,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;