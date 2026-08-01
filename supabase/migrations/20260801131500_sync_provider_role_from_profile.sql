-- Ensure provider onboarding produces a provider account.
-- A profile only becomes a provider after the trusted provider flow writes provider_id.

CREATE OR REPLACE FUNCTION public.sync_provider_role_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.provider_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'provider'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_provider_role_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_provider_role_from_profile
AFTER INSERT OR UPDATE OF provider_id ON public.profiles
FOR EACH ROW
WHEN (NEW.provider_id IS NOT NULL)
EXECUTE FUNCTION public.sync_provider_role_from_profile();

-- Repair users who already completed provider onboarding but only received customer role.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'provider'::public.app_role
FROM public.profiles p
WHERE p.provider_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
