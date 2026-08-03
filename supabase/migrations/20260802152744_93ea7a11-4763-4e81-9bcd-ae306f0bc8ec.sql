CREATE OR REPLACE FUNCTION public.list_provider_bookable_slots_v1(_slug text, _from date, _to date)
 RETURNS TABLE(slot_date date, slot_hour smallint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT p.user_id INTO v_user_id
    FROM public.provider_profiles p
   WHERE p.provider_slug = _slug
     AND p.is_public = true
     AND p.status = 'active'
     AND p.visibility = 'public'
     AND coalesce(p.payout_frozen, false) = false
   LIMIT 1;

  IF v_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT s.local_date,
         split_part(s.local_time, ':', 1)::smallint
    FROM public.get_provider_available_slots_v1(
           v_user_id, GREATEST(_from, current_date),
           LEAST(_to, current_date + 90), 120, 60) s
   ORDER BY 1, 2;
END;
$function$;
