
DO $$ BEGIN
  CREATE TYPE public.country_lifecycle_state AS ENUM
    ('development','beta','launch_ready','active','suspended','retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.country_configs
  ADD COLUMN IF NOT EXISTS lifecycle_state public.country_lifecycle_state
    NOT NULL DEFAULT 'development';

UPDATE public.country_configs
   SET lifecycle_state = CASE
     WHEN active AND launch_status = 'active' THEN 'active'::public.country_lifecycle_state
     WHEN launch_status = 'launch_ready' THEN 'launch_ready'::public.country_lifecycle_state
     WHEN launch_status = 'beta' THEN 'beta'::public.country_lifecycle_state
     WHEN launch_status = 'suspended' THEN 'suspended'::public.country_lifecycle_state
     WHEN launch_status = 'retired' THEN 'retired'::public.country_lifecycle_state
     ELSE 'development'::public.country_lifecycle_state
   END
 WHERE lifecycle_state = 'development';

CREATE OR REPLACE FUNCTION public.is_country_launch_ready(_iso text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.country_configs
  WHERE iso = upper(_iso) AND status='published' AND lifecycle_state='active'); $$;

CREATE OR REPLACE FUNCTION public.is_country_bookable(_iso text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.country_configs
  WHERE iso = upper(_iso) AND status='published' AND lifecycle_state='active'); $$;

CREATE OR REPLACE FUNCTION public.is_country_visible(_iso text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.country_configs
  WHERE iso = upper(_iso) AND status='published'
    AND lifecycle_state IN ('active','launch_ready')); $$;

CREATE OR REPLACE FUNCTION public.get_lifecycle_public_isos()
RETURNS TABLE(iso text, default_language text, supported_languages text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT iso, default_language, supported_languages FROM public.country_configs
  WHERE status='published' AND lifecycle_state='active'; $$;

CREATE TABLE IF NOT EXISTS public.country_readiness_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso text NOT NULL,
  config_version int NOT NULL,
  deployment_version text,
  passed boolean NOT NULL,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  actor_kind text NOT NULL DEFAULT 'system',
  ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS country_readiness_runs_iso_idx
  ON public.country_readiness_runs (iso, ran_at DESC);
GRANT SELECT ON public.country_readiness_runs TO authenticated;
GRANT ALL ON public.country_readiness_runs TO service_role;
ALTER TABLE public.country_readiness_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "readiness_admin_read" ON public.country_readiness_runs;
CREATE POLICY "readiness_admin_read" ON public.country_readiness_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.country_holidays (country_code, holiday_date, name, source)
VALUES
  ('DK','2026-01-01','Nytårsdag','official-2026'),
  ('DK','2026-04-02','Skærtorsdag','official-2026'),
  ('DK','2026-04-03','Langfredag','official-2026'),
  ('DK','2026-04-05','Påskedag','official-2026'),
  ('DK','2026-04-06','2. påskedag','official-2026'),
  ('DK','2026-05-14','Kristi himmelfart','official-2026'),
  ('DK','2026-05-24','Pinsedag','official-2026'),
  ('DK','2026-05-25','2. pinsedag','official-2026'),
  ('DK','2026-12-25','Juledag','official-2026'),
  ('DK','2026-12-26','2. juledag','official-2026'),
  ('GB','2026-01-01','New Year''s Day','gov.uk-2026'),
  ('GB','2026-04-03','Good Friday','gov.uk-2026'),
  ('GB','2026-04-06','Easter Monday','gov.uk-2026'),
  ('GB','2026-05-04','Early May bank holiday','gov.uk-2026'),
  ('GB','2026-05-25','Spring bank holiday','gov.uk-2026'),
  ('GB','2026-08-31','Summer bank holiday','gov.uk-2026'),
  ('GB','2026-12-25','Christmas Day','gov.uk-2026'),
  ('GB','2026-12-28','Boxing Day (substitute)','gov.uk-2026'),
  ('SE','2026-01-01','Nyårsdagen','riksdagen-2026'),
  ('SE','2026-01-06','Trettondedag jul','riksdagen-2026'),
  ('SE','2026-04-03','Långfredagen','riksdagen-2026'),
  ('SE','2026-04-05','Påskdagen','riksdagen-2026'),
  ('SE','2026-04-06','Annandag påsk','riksdagen-2026'),
  ('SE','2026-05-01','Första maj','riksdagen-2026'),
  ('SE','2026-05-14','Kristi himmelsfärds dag','riksdagen-2026'),
  ('SE','2026-06-06','Sveriges nationaldag','riksdagen-2026'),
  ('SE','2026-06-20','Midsommardagen','riksdagen-2026'),
  ('SE','2026-12-25','Juldagen','riksdagen-2026'),
  ('SE','2026-12-26','Annandag jul','riksdagen-2026'),
  ('ES','2026-01-01','Año Nuevo','boe-2026'),
  ('ES','2026-01-06','Epifanía del Señor','boe-2026'),
  ('ES','2026-04-03','Viernes Santo','boe-2026'),
  ('ES','2026-05-01','Fiesta del Trabajo','boe-2026'),
  ('ES','2026-08-15','Asunción de la Virgen','boe-2026'),
  ('ES','2026-10-12','Fiesta Nacional de España','boe-2026'),
  ('ES','2026-11-01','Todos los Santos','boe-2026'),
  ('ES','2026-12-06','Día de la Constitución','boe-2026'),
  ('ES','2026-12-08','Inmaculada Concepción','boe-2026'),
  ('ES','2026-12-25','Natividad del Señor','boe-2026')
ON CONFLICT DO NOTHING;
