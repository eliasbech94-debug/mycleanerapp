-- Column-level tamper protection for public.bookings.
-- RLS cannot restrict which columns an UPDATE touches, so we enforce it in a
-- BEFORE UPDATE trigger that is aware of who is performing the update.

CREATE OR REPLACE FUNCTION public.enforce_booking_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_customer boolean;
  is_provider boolean;
BEGIN
  -- Privileged paths bypass the guard entirely:
  --   * service_role / postgres (edge functions, workers, migrations)
  --   * SECURITY DEFINER RPCs running as the table owner
  --   * admins
  IF uid IS NULL
     OR current_setting('role', true) IN ('service_role', 'postgres')
     OR public.has_role(uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  is_customer := (uid = OLD.customer_user_id);
  is_provider := public.user_owns_provider(OLD.provider_id);

  -- ── Customer path: cancellation only ───────────────────────────────────
  IF is_customer AND NOT is_provider THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status = 'cancelled'::booking_status THEN
      -- Allow the cancellation itself plus its directly related bookkeeping,
      -- but freeze every other column to its previous value.
      NEW.customer_user_id       := OLD.customer_user_id;
      NEW.provider_id            := OLD.provider_id;
      NEW.assigned_provider_id   := OLD.assigned_provider_id;
      NEW.requested_provider_id  := OLD.requested_provider_id;
      NEW.provider_name          := OLD.provider_name;
      NEW.service                := OLD.service;
      NEW.hours                  := OLD.hours;
      NEW.booking_date           := OLD.booking_date;
      NEW.slot                   := OLD.slot;
      NEW.address                := OLD.address;
      NEW.notes                  := OLD.notes;
      NEW.customer_pays          := OLD.customer_pays;
      NEW.provider_gets          := OLD.provider_gets;
      NEW.currency               := OLD.currency;
      NEW.country_code           := OLD.country_code;
      NEW.timezone               := OLD.timezone;
      NEW.assignment_mode        := OLD.assignment_mode;
      NEW.dispatch_status        := OLD.dispatch_status;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'booking_update_forbidden: customers may only cancel a pending booking'
      USING ERRCODE = '42501';
  END IF;

  -- ── Provider path: no financial or payment mutations ───────────────────
  IF is_provider THEN
    NEW.customer_pays        := OLD.customer_pays;
    NEW.provider_gets        := OLD.provider_gets;
    NEW.currency             := OLD.currency;
    NEW.customer_user_id     := OLD.customer_user_id;
    NEW.provider_id          := OLD.provider_id;
    NEW.assigned_provider_id := OLD.assigned_provider_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Freeze any additional financial / payment columns that exist on this
-- deployment, without hard-coding columns that may not be present.
CREATE OR REPLACE FUNCTION public.enforce_booking_financial_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  col text;
  guarded text[] := ARRAY[
    'payment_status', 'payout_status', 'refund_amount', 'refund_status',
    'platform_fee_amount', 'platform_fee_bps', 'vat_amount', 'vat_rate_bps',
    'price_snapshot', 'pricing_snapshot', 'quote_snapshot', 'quote_id',
    'stripe_payment_intent_id', 'stripe_charge_id', 'stripe_transfer_id',
    'payout_id', 'funds_released_at', 'paid_at', 'captured_at'
  ];
  rec jsonb;
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
BEGIN
  IF uid IS NULL
     OR current_setting('role', true) IN ('service_role', 'postgres')
     OR public.has_role(uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  rec := new_j;
  FOREACH col IN ARRAY guarded LOOP
    IF old_j ? col AND (new_j -> col) IS DISTINCT FROM (old_j -> col) THEN
      rec := jsonb_set(rec, ARRAY[col], old_j -> col);
    END IF;
  END LOOP;

  IF rec IS DISTINCT FROM new_j THEN
    NEW := jsonb_populate_record(NEW, rec);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_column_guard ON public.bookings;
CREATE TRIGGER trg_bookings_column_guard
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_column_guard();

DROP TRIGGER IF EXISTS trg_bookings_financial_freeze ON public.bookings;
CREATE TRIGGER trg_bookings_financial_freeze
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_financial_freeze();