
-- Stage A: support-safe RPCs and shared conversation-visibility helper.

-- Reusable ordered id list for a caller's visible conversations (single source of truth).
CREATE OR REPLACE FUNCTION public.visible_conversation_ids(_user uuid)
RETURNS TABLE(conversation_id uuid, last_message_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.last_message_at
  FROM public.conversations c
  WHERE public.is_conversation_visible_to(c.id, _user);
$$;

REVOKE ALL ON FUNCTION public.visible_conversation_ids(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.visible_conversation_ids(uuid) TO authenticated, service_role;

-- Counters for the support sidebar. Support/admin only.
CREATE OR REPLACE FUNCTION public.support_counters(_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_support_agent(_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH scope AS (
    SELECT c.id, c.status, c.priority, c.assigned_support_id, c.last_message_at
    FROM public.conversations c
    WHERE c.status <> 'closed'
  ),
  unread AS (
    SELECT COUNT(*) AS n
    FROM scope s
    LEFT JOIN public.conversation_reads r
      ON r.conversation_id = s.id AND r.user_id = _user
    WHERE s.last_message_at IS NOT NULL
      AND (r.last_read_at IS NULL OR r.last_read_at < s.last_message_at)
      AND (s.assigned_support_id = _user OR s.assigned_support_id IS NULL)
  )
  SELECT jsonb_build_object(
    'mine_open',   (SELECT COUNT(*) FROM scope WHERE assigned_support_id = _user AND status IN ('open','pending_customer','pending_provider','pending_support')),
    'unassigned',  (SELECT COUNT(*) FROM scope WHERE assigned_support_id IS NULL AND status <> 'resolved'),
    'urgent',      (SELECT COUNT(*) FROM scope WHERE priority = 'urgent'),
    'escalated',   (SELECT COUNT(*) FROM scope WHERE status = 'escalated'),
    'unread',      (SELECT n FROM unread)
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.support_counters(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.support_counters(uuid) TO authenticated, service_role;

-- Safe customer summary (no tax/bank/encrypted). Support/admin only.
CREATE OR REPLACE FUNCTION public.support_customer_summary(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; p record;
BEGIN
  IF NOT public.is_support_agent(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id, full_name, phone, country_code, deactivated_at, created_at
    INTO p FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'phone', p.phone,
    'country_code', p.country_code,
    'deactivated_at', p.deactivated_at,
    'created_at', p.created_at,
    'recent_bookings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'status', b.status, 'booking_date', b.booking_date, 'country_code', b.country_code
      ) ORDER BY b.booking_date DESC)
      FROM (
        SELECT id, status, booking_date, country_code
        FROM public.bookings WHERE customer_user_id = _user_id
        ORDER BY booking_date DESC NULLS LAST LIMIT 5
      ) b
    ), '[]'::jsonb),
    'open_case_count', (
      SELECT COUNT(*) FROM public.conversations c
      WHERE c.customer_user_id = _user_id AND c.status <> 'closed'
    )
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.support_customer_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.support_customer_summary(uuid) TO authenticated, service_role;

-- Safe provider search list. Support/admin only.
CREATE OR REPLACE FUNCTION public.support_search_providers(_q text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, provider_id text, full_name text, country_code text, deactivated_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.provider_id, p.full_name, p.country_code, p.deactivated_at, p.created_at
  FROM public.profiles p
  WHERE public.is_support_agent(auth.uid())
    AND p.provider_id IS NOT NULL
    AND (_q IS NULL OR _q = ''
         OR p.full_name ILIKE '%'||_q||'%'
         OR p.provider_id ILIKE '%'||_q||'%'
         OR p.phone ILIKE '%'||_q||'%')
  ORDER BY p.created_at DESC
  LIMIT LEAST(COALESCE(_limit,50), 200);
$$;

REVOKE ALL ON FUNCTION public.support_search_providers(text,int) FROM public;
GRANT EXECUTE ON FUNCTION public.support_search_providers(text,int) TO authenticated, service_role;

-- Safe provider summary. Support/admin only.
CREATE OR REPLACE FUNCTION public.support_provider_summary(_provider_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; p record;
BEGIN
  IF NOT public.is_support_agent(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id, provider_id, full_name, country_code, deactivated_at, created_at,
         COALESCE(stripe_account_id IS NOT NULL, false) AS stripe_ready
    INTO p FROM public.profiles WHERE provider_id = _provider_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'user_id', p.id,
    'provider_id', p.provider_id,
    'full_name', p.full_name,
    'country_code', p.country_code,
    'deactivated_at', p.deactivated_at,
    'created_at', p.created_at,
    'stripe_ready', p.stripe_ready,
    'recent_bookings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'status', b.status, 'booking_date', b.booking_date
      ) ORDER BY b.booking_date DESC)
      FROM (
        SELECT id, status, booking_date FROM public.bookings
        WHERE provider_id = _provider_id
        ORDER BY booking_date DESC NULLS LAST LIMIT 5
      ) b
    ), '[]'::jsonb),
    'open_case_count', (
      SELECT COUNT(*) FROM public.conversations c
      WHERE c.provider_user_id = p.id AND c.status <> 'closed'
    ),
    'dispute_count', (
      SELECT COUNT(*) FROM public.stripe_disputes d
      WHERE d.provider_user_id = p.id
    )
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.support_provider_summary(text) FROM public;
GRANT EXECUTE ON FUNCTION public.support_provider_summary(text) TO authenticated, service_role;

-- Safe booking search. Support/admin only.
CREATE OR REPLACE FUNCTION public.support_search_bookings(_q text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE(
  id uuid, status text, payment_status text, booking_date timestamptz,
  currency text, country_code text, customer_user_id uuid, provider_id text,
  customer_pays bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.status, b.payment_status, b.booking_date,
         b.currency, b.country_code, b.customer_user_id, b.provider_id, b.customer_pays
  FROM public.bookings b
  WHERE public.is_support_agent(auth.uid())
    AND (_q IS NULL OR _q = ''
         OR b.id::text ILIKE _q||'%'
         OR b.provider_id ILIKE '%'||_q||'%')
  ORDER BY b.booking_date DESC NULLS LAST
  LIMIT LEAST(COALESCE(_limit,50), 200);
$$;

REVOKE ALL ON FUNCTION public.support_search_bookings(text,int) FROM public;
GRANT EXECUTE ON FUNCTION public.support_search_bookings(text,int) TO authenticated, service_role;

-- Safe single-booking summary. Support/admin only.
CREATE OR REPLACE FUNCTION public.support_booking_summary(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; b record;
BEGIN
  IF NOT public.is_support_agent(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id, status, payment_status, booking_date, currency, country_code,
         customer_user_id, provider_id, customer_pays, provider_gets, address
    INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'id', b.id,
    'status', b.status,
    'payment_status', b.payment_status,
    'booking_date', b.booking_date,
    'currency', b.currency,
    'country_code', b.country_code,
    'customer_user_id', b.customer_user_id,
    'provider_id', b.provider_id,
    'customer_pays', b.customer_pays,
    'provider_gets', b.provider_gets,
    'address_summary', CASE WHEN b.address IS NULL THEN NULL
                            ELSE regexp_replace(b.address, '\d+', '••', 'g') END,
    'related_refund_request', (
      SELECT jsonb_build_object('id', r.id, 'status', r.status, 'amount', r.amount, 'currency', r.currency, 'created_at', r.created_at)
      FROM public.refund_requests_v2 r WHERE r.booking_id = b.id
      ORDER BY r.created_at DESC LIMIT 1
    ),
    'related_dispute', (
      SELECT jsonb_build_object('id', d.id, 'status', d.status, 'reason', d.reason, 'created_at', d.created_at)
      FROM public.stripe_disputes d WHERE d.booking_id = b.id
      ORDER BY d.created_at DESC LIMIT 1
    )
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.support_booking_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.support_booking_summary(uuid) TO authenticated, service_role;
