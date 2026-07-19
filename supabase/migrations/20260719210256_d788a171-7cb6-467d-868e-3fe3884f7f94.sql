
-- Bookings: replace over-permissive customer UPDATE policy with a narrow one that
-- allows only a pending → cancelled transition and forbids price/payment tampering.
DROP POLICY IF EXISTS "Customers can cancel own pending" ON public.bookings;

CREATE POLICY "Customers can cancel own pending"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  auth.uid() = customer_user_id
  AND status = 'pending'
)
WITH CHECK (
  auth.uid() = customer_user_id
  AND status = 'cancelled'
);

-- Column-level guard: block customers from mutating financial / status-critical
-- columns even if a future policy widens updates.
CREATE OR REPLACE FUNCTION public.bookings_customer_update_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.customer_user_id
     AND NOT public.is_admin_only(auth.uid()) THEN
    IF NEW.customer_pays IS DISTINCT FROM OLD.customer_pays
       OR NEW.provider_gets IS DISTINCT FROM OLD.provider_gets
       OR NEW.platform_fee_amount IS DISTINCT FROM OLD.platform_fee_amount
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
       OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
      RAISE EXCEPTION 'booking_customer_update_forbidden_columns';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND (OLD.status <> 'pending' OR NEW.status <> 'cancelled') THEN
      RAISE EXCEPTION 'booking_customer_status_transition_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_customer_update_guard_trg ON public.bookings;
CREATE TRIGGER bookings_customer_update_guard_trg
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_customer_update_guard();

-- Profiles: prevent self-assignment of provider_id. Only admins can grant it.
CREATE OR REPLACE FUNCTION public.profiles_prevent_provider_id_self_assign()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id
     AND NOT public.is_admin_only(auth.uid()) THEN
    RAISE EXCEPTION 'provider_id_self_assignment_forbidden';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_prevent_provider_id_self_assign_trg ON public.profiles;
CREATE TRIGGER profiles_prevent_provider_id_self_assign_trg
BEFORE UPDATE OF provider_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_provider_id_self_assign();
