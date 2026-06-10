CREATE TABLE public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  payment_intent_id text,
  charge_id text,
  refund_id text,
  transfer_id text,
  payout_id text,
  booking_id uuid,
  amount integer,
  currency text,
  status text,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stripe_webhook_events TO authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read; admin check is enforced by edge functions / app layer.
-- For now we keep it broad-authenticated; tighten when an admin role system is added.
CREATE POLICY "Authenticated can read webhook events"
  ON public.stripe_webhook_events FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_stripe_webhook_events_type ON public.stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_pi ON public.stripe_webhook_events(payment_intent_id);
CREATE INDEX idx_stripe_webhook_events_booking ON public.stripe_webhook_events(booking_id);
CREATE INDEX idx_stripe_webhook_events_created ON public.stripe_webhook_events(created_at DESC);