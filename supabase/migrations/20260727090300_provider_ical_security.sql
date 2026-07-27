-- Private iCal connection management.
--
-- Privacy invariants:
--   * Raw iCal URLs are stored only in Supabase Vault.
--   * Providers can read connection status, never credentials.
--   * Imported events are reduced to busy intervals and one-way hashes.
--   * External blocks are replaced atomically per connection.

CREATE UNIQUE INDEX IF NOT EXISTS provider_calendar_connections_one_active_ical
  ON public.provider_calendar_connections(provider_user_id)
  WHERE connection_type = 'ical' AND status <> 'disconnected';

DROP POLICY IF EXISTS provider_calendar_connections_owner_all
  ON public.provider_calendar_connections;
DROP POLICY IF EXISTS provider_calendar_connections_owner_read
  ON public.provider_calendar_connections;
CREATE POLICY provider_calendar_connections_owner_read
ON public.provider_calendar_connections
FOR SELECT TO authenticated
USING (provider_user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.provider_calendar_connections FROM authenticated;
GRANT SELECT ON public.provider_calendar_connections TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_calendar_store_ical_secret_v1(
  _provider_user_id uuid,
  _ical_url text
)
RETURNS public.provider_calendar_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
DECLARE
  v_secret_id uuid;
  v_connection public.provider_calendar_connections;
BEGIN
  IF _provider_user_id IS NULL OR _ical_url IS NULL
     OR length(_ical_url) < 12 OR length(_ical_url) > 4096
     OR _ical_url !~* '^https://'
  THEN
    RAISE EXCEPTION 'invalid_ical_url' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.provider_profiles
    WHERE user_id = _provider_user_id
  ) THEN
    RAISE EXCEPTION 'provider_profile_missing' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.provider_calendar_connections
    WHERE provider_user_id = _provider_user_id
      AND connection_type = 'ical'
      AND status <> 'disconnected'
  ) THEN
    RAISE EXCEPTION 'ical_connection_already_exists' USING ERRCODE = '23505';
  END IF;

  v_secret_id := vault.create_secret(
    _ical_url,
    'provider_ical_' || gen_random_uuid()::text,
    'Private provider iCal feed. Managed by provider-calendar-sync.'
  );

  INSERT INTO public.provider_calendar_connections(
    provider_user_id,
    connection_type,
    credential_ref,
    status,
    consented_at,
    next_sync_at
  )
  VALUES (
    _provider_user_id,
    'ical',
    v_secret_id::text,
    'active',
    now(),
    now()
  )
  RETURNING * INTO v_connection;

  RETURN v_connection;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_calendar_store_ical_secret_v1(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_calendar_store_ical_secret_v1(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.provider_calendar_get_ical_secret_v1(
  _connection_id uuid
)
RETURNS TABLE(
  connection_id uuid,
  provider_user_id uuid,
  ical_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
  SELECT c.id, c.provider_user_id, s.decrypted_secret
  FROM public.provider_calendar_connections c
  JOIN vault.decrypted_secrets s
    ON s.id = c.credential_ref::uuid
  WHERE c.id = _connection_id
    AND c.connection_type = 'ical'
    AND c.status IN ('active', 'error');
$$;

REVOKE ALL ON FUNCTION public.provider_calendar_get_ical_secret_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_calendar_get_ical_secret_v1(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.provider_calendar_replace_external_blocks_v1(
  _connection_id uuid,
  _blocks jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_provider_user_id uuid;
  v_count integer;
BEGIN
  IF jsonb_typeof(_blocks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'blocks_must_be_array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_blocks) > 5000 THEN
    RAISE EXCEPTION 'too_many_calendar_blocks' USING ERRCODE = '54000';
  END IF;

  SELECT provider_user_id INTO v_provider_user_id
  FROM public.provider_calendar_connections
  WHERE id = _connection_id AND status = 'active'
  FOR UPDATE;

  IF v_provider_user_id IS NULL THEN
    RAISE EXCEPTION 'calendar_connection_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.provider_calendar_blocks
  WHERE connection_id = _connection_id
    AND source = 'external_calendar';

  INSERT INTO public.provider_calendar_blocks(
    provider_user_id,
    connection_id,
    source,
    external_event_key_hash,
    starts_at,
    ends_at,
    expires_at
  )
  SELECT
    v_provider_user_id,
    _connection_id,
    'external_calendar',
    item.event_hash,
    item.starts_at,
    item.ends_at,
    item.ends_at + interval '24 hours'
  FROM jsonb_to_recordset(_blocks) AS item(
    event_hash text,
    starts_at timestamptz,
    ends_at timestamptz
  )
  WHERE item.event_hash ~ '^[0-9a-f]{64}$'
    AND item.starts_at < item.ends_at
    AND item.ends_at > now() - interval '24 hours'
    AND item.starts_at < now() + interval '12 weeks';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.provider_calendar_connections
  SET last_synced_at = now(),
      next_sync_at = now() + interval '15 minutes',
      last_error_code = NULL,
      status = 'active',
      updated_at = now()
  WHERE id = _connection_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_calendar_replace_external_blocks_v1(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_calendar_replace_external_blocks_v1(uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.provider_calendar_mark_sync_error_v1(
  _connection_id uuid,
  _error_code text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.provider_calendar_connections
  SET status = 'error',
      last_error_code = left(coalesce(_error_code, 'sync_failed'), 80),
      next_sync_at = now() + interval '1 hour',
      updated_at = now()
  WHERE id = _connection_id;
$$;

REVOKE ALL ON FUNCTION public.provider_calendar_mark_sync_error_v1(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_calendar_mark_sync_error_v1(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.provider_calendar_disconnect_v1(
  _connection_id uuid,
  _provider_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT credential_ref::uuid INTO v_secret_id
  FROM public.provider_calendar_connections
  WHERE id = _connection_id
    AND provider_user_id = _provider_user_id
  FOR UPDATE;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'calendar_connection_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.provider_calendar_blocks
  WHERE connection_id = _connection_id;

  UPDATE public.provider_calendar_connections
  SET status = 'disconnected',
      disconnected_at = now(),
      credential_ref = gen_random_uuid()::text,
      next_sync_at = NULL,
      updated_at = now()
  WHERE id = _connection_id;

  DELETE FROM vault.secrets WHERE id = v_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_calendar_disconnect_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_calendar_disconnect_v1(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.provider_calendar_store_ical_secret_v1(uuid, text) IS
  'Service-only. Stores a private iCal URL in Vault and returns only connection metadata.';
COMMENT ON FUNCTION public.provider_calendar_replace_external_blocks_v1(uuid, jsonb) IS
  'Service-only. Atomically replaces privacy-minimised external busy intervals.';

DO $safety$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE flag_key = 'funds_release.enabled'
      AND scope = 'global'
      AND enabled IS TRUE
  ) THEN
    RAISE EXCEPTION 'iCal migration refuses to run while funds_release.enabled is true';
  END IF;
END
$safety$;
