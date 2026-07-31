ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_video_seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.mark_welcome_video_seen()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_seen TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Idempotent + race-safe: only the first writer sets the value, later calls
  -- (including concurrent ones on other devices) return the existing value.
  INSERT INTO public.profiles (id, welcome_video_seen_at)
  VALUES (v_uid, now())
  ON CONFLICT (id) DO UPDATE
    SET welcome_video_seen_at = COALESCE(public.profiles.welcome_video_seen_at, now())
  RETURNING welcome_video_seen_at INTO v_seen;

  RETURN v_seen;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_welcome_video_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_welcome_video_seen() TO authenticated;