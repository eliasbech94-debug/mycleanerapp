
-- =========================================================================
-- MyCleaner Knowledge — Phase 1 Foundation
-- =========================================================================

-- ---- Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.knowledge_article_status AS ENUM
    ('draft','in_review','approved','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.knowledge_risk_level AS ENUM
    ('info','caution','stop','emergency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_severity AS ENUM
    ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_status AS ENUM
    ('submitted','acknowledged','in_progress','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- Helper functions ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_risk_rank(_lvl public.knowledge_risk_level)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _lvl
    WHEN 'info' THEN 1
    WHEN 'caution' THEN 2
    WHEN 'stop' THEN 3
    WHEN 'emergency' THEN 4
  END
$$;

CREATE OR REPLACE FUNCTION public.has_knowledge_editor_role(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user
      AND role IN ('employee','support','admin','super_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_knowledge_publisher_role(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user AND role IN ('admin','super_admin')
  )
$$;

-- Convenience: is the current transaction inside an approved workflow RPC?
CREATE OR REPLACE FUNCTION public._knowledge_in_workflow()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('mycleaner.knowledge_workflow', true), '') = 'rpc'
$$;

-- Shared updated_at trigger (reuse existing if present)
CREATE OR REPLACE FUNCTION public.knowledge_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- =========================================================================
-- TABLES
-- =========================================================================

-- Categories --------------------------------------------------------------
CREATE TABLE public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  parent_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  name_key text NOT NULL,
  description_key text,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.knowledge_categories TO authenticated;
GRANT ALL ON public.knowledge_categories TO service_role;
ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_categories_read_active ON public.knowledge_categories
  FOR SELECT TO authenticated USING (active OR public.has_knowledge_editor_role(auth.uid()));
CREATE POLICY knowledge_categories_editor_write ON public.knowledge_categories
  FOR ALL TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));
CREATE TRIGGER knowledge_categories_touch
  BEFORE UPDATE ON public.knowledge_categories
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_touch_updated_at();

-- Articles ----------------------------------------------------------------
CREATE TABLE public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  body_md text NOT NULL DEFAULT '',
  risk_level public.knowledge_risk_level NOT NULL DEFAULT 'info',
  safety_critical boolean NOT NULL DEFAULT false,
  status public.knowledge_article_status NOT NULL DEFAULT 'draft',
  current_version int NOT NULL DEFAULT 0,
  verification_required boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  submitted_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id),
  expected_review_date date,
  review_notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_articles_status ON public.knowledge_articles(status);
CREATE INDEX idx_knowledge_articles_category ON public.knowledge_articles(category_id);
CREATE INDEX idx_knowledge_articles_risk ON public.knowledge_articles(risk_level);
GRANT SELECT ON public.knowledge_articles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.knowledge_articles TO authenticated;
GRANT ALL ON public.knowledge_articles TO service_role;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;

-- Providers/customers: only published + not restricted
CREATE POLICY knowledge_articles_read_public ON public.knowledge_articles
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND (verification_required = false OR verified_at IS NOT NULL)
  );
-- Editors and above: full read
CREATE POLICY knowledge_articles_read_editor ON public.knowledge_articles
  FOR SELECT TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()));
-- Only editors can insert / update / delete drafts
CREATE POLICY knowledge_articles_editor_insert ON public.knowledge_articles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));
CREATE POLICY knowledge_articles_editor_update ON public.knowledge_articles
  FOR UPDATE TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));
CREATE POLICY knowledge_articles_super_delete ON public.knowledge_articles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER knowledge_articles_touch
  BEFORE UPDATE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_touch_updated_at();

-- Guard: block status changes outside of the workflow RPCs and force
-- safety-critical published articles back to draft when content changes.
CREATE OR REPLACE FUNCTION public.knowledge_articles_workflow_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public._knowledge_in_workflow() THEN
    RAISE EXCEPTION 'knowledge_articles.status may only be changed through workflow RPCs';
  END IF;

  -- Safety-critical published articles: content edits revoke publication
  IF OLD.status = 'published'
     AND OLD.safety_critical
     AND (
       NEW.body_md IS DISTINCT FROM OLD.body_md
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.summary IS DISTINCT FROM OLD.summary
       OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
     )
     AND NOT public._knowledge_in_workflow() THEN
    NEW.status := 'draft';
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.published_at := NULL;
    NEW.published_by := NULL;
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER knowledge_articles_workflow_guard
  BEFORE UPDATE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_articles_workflow_guard();

-- Article version snapshots ----------------------------------------------
CREATE TABLE public.knowledge_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  change_summary text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);
GRANT SELECT ON public.knowledge_article_versions TO authenticated;
GRANT ALL ON public.knowledge_article_versions TO service_role;
ALTER TABLE public.knowledge_article_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_versions_read_editor ON public.knowledge_article_versions
  FOR SELECT TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()));

-- Article ↔ country -------------------------------------------------------
CREATE TABLE public.knowledge_article_countries (
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  country_code char(2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, country_code)
);
GRANT SELECT ON public.knowledge_article_countries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.knowledge_article_countries TO authenticated;
GRANT ALL ON public.knowledge_article_countries TO service_role;
ALTER TABLE public.knowledge_article_countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_article_countries_read ON public.knowledge_article_countries
  FOR SELECT TO authenticated
  USING (
    public.has_knowledge_editor_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.knowledge_articles a
      WHERE a.id = article_id
        AND a.status = 'published'
        AND (a.verification_required = false OR a.verified_at IS NOT NULL)
    )
  );
CREATE POLICY knowledge_article_countries_write ON public.knowledge_article_countries
  FOR ALL TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));

-- Article ↔ language ------------------------------------------------------
CREATE TABLE public.knowledge_article_languages (
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  language_code char(2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, language_code)
);
GRANT SELECT ON public.knowledge_article_languages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.knowledge_article_languages TO authenticated;
GRANT ALL ON public.knowledge_article_languages TO service_role;
ALTER TABLE public.knowledge_article_languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_article_languages_read ON public.knowledge_article_languages
  FOR SELECT TO authenticated
  USING (
    public.has_knowledge_editor_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.knowledge_articles a
      WHERE a.id = article_id
        AND a.status = 'published'
        AND (a.verification_required = false OR a.verified_at IS NOT NULL)
    )
  );
CREATE POLICY knowledge_article_languages_write ON public.knowledge_article_languages
  FOR ALL TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));

-- Article sources (traceability of claims) --------------------------------
CREATE TABLE public.knowledge_article_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.knowledge_article_sources TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.knowledge_article_sources TO authenticated;
GRANT ALL ON public.knowledge_article_sources TO service_role;
ALTER TABLE public.knowledge_article_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_sources_read_editor ON public.knowledge_article_sources
  FOR SELECT TO authenticated USING (public.has_knowledge_editor_role(auth.uid()));
CREATE POLICY knowledge_sources_write_editor ON public.knowledge_article_sources
  FOR ALL TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));
CREATE TRIGGER knowledge_sources_touch
  BEFORE UPDATE ON public.knowledge_article_sources
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_touch_updated_at();

-- Feedback ----------------------------------------------------------------
CREATE TABLE public.knowledge_article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  helpful boolean,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_article_feedback TO authenticated;
GRANT ALL ON public.knowledge_article_feedback TO service_role;
ALTER TABLE public.knowledge_article_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_feedback_owner ON public.knowledge_article_feedback
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (user_id = auth.uid());

-- Favorites ---------------------------------------------------------------
CREATE TABLE public.knowledge_article_favorites (
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.knowledge_article_favorites TO authenticated;
GRANT ALL ON public.knowledge_article_favorites TO service_role;
ALTER TABLE public.knowledge_article_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_favorites_owner ON public.knowledge_article_favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Search events (analytics) -----------------------------------------------
CREATE TABLE public.knowledge_search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  query text NOT NULL,
  category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  country_code char(2),
  language_code char(2),
  results_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.knowledge_search_events TO authenticated;
GRANT SELECT ON public.knowledge_search_events TO service_role;
GRANT ALL ON public.knowledge_search_events TO service_role;
ALTER TABLE public.knowledge_search_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_search_events_insert_self ON public.knowledge_search_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY knowledge_search_events_read_editor ON public.knowledge_search_events
  FOR SELECT TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()));

-- =========================================================================
-- Country emergency information (verify → approve/publish flow)
-- =========================================================================
CREATE TABLE public.country_emergency_info (
  country_code char(2) PRIMARY KEY,
  emergency_number text,
  police_number text,
  fire_number text,
  medical_number text,
  poison_control_number text,
  non_emergency_number text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  notes text,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.country_emergency_info TO authenticated;
GRANT INSERT, UPDATE ON public.country_emergency_info TO authenticated;
GRANT ALL ON public.country_emergency_info TO service_role;
ALTER TABLE public.country_emergency_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY country_emergency_read_published ON public.country_emergency_info
  FOR SELECT TO authenticated
  USING (published OR public.has_knowledge_editor_role(auth.uid()));
CREATE POLICY country_emergency_editor_write ON public.country_emergency_info
  FOR ALL TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));

CREATE TRIGGER country_emergency_touch
  BEFORE UPDATE ON public.country_emergency_info
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_touch_updated_at();

-- Guard: content edit clears verification/approval/publication; state
-- flags only mutate through workflow RPCs.
CREATE OR REPLACE FUNCTION public.country_emergency_workflow_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  data_changed boolean := (
    NEW.emergency_number IS DISTINCT FROM OLD.emergency_number
    OR NEW.police_number IS DISTINCT FROM OLD.police_number
    OR NEW.fire_number IS DISTINCT FROM OLD.fire_number
    OR NEW.medical_number IS DISTINCT FROM OLD.medical_number
    OR NEW.poison_control_number IS DISTINCT FROM OLD.poison_control_number
    OR NEW.non_emergency_number IS DISTINCT FROM OLD.non_emergency_number
    OR NEW.extra IS DISTINCT FROM OLD.extra
    OR NEW.source_url IS DISTINCT FROM OLD.source_url
  );
BEGIN
  IF NOT public._knowledge_in_workflow() THEN
    IF NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.published IS DISTINCT FROM OLD.published
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by THEN
      RAISE EXCEPTION 'country_emergency_info state fields require workflow RPC';
    END IF;

    IF data_changed THEN
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
      NEW.published := false;
      NEW.published_at := NULL;
      NEW.published_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER country_emergency_workflow_guard
  BEFORE UPDATE ON public.country_emergency_info
  FOR EACH ROW EXECUTE FUNCTION public.country_emergency_workflow_guard();

-- =========================================================================
-- Incident reports
-- =========================================================================
CREATE TABLE public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  category text NOT NULL,
  severity public.incident_severity NOT NULL DEFAULT 'low',
  status public.incident_status NOT NULL DEFAULT 'submitted',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  location text,
  address_snapshot jsonb,
  immediate_actions_taken text,
  follow_up_required boolean NOT NULL DEFAULT false,
  assigned_to uuid REFERENCES auth.users(id),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_reports_provider ON public.incident_reports(provider_user_id);
CREATE INDEX idx_incident_reports_status ON public.incident_reports(status);
GRANT SELECT, INSERT, UPDATE ON public.incident_reports TO authenticated;
GRANT ALL ON public.incident_reports TO service_role;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_reports_provider_read_own ON public.incident_reports
  FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid());
CREATE POLICY incident_reports_staff_read_all ON public.incident_reports
  FOR SELECT TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()));
CREATE POLICY incident_reports_provider_insert ON public.incident_reports
  FOR INSERT TO authenticated
  WITH CHECK (provider_user_id = auth.uid());
CREATE POLICY incident_reports_staff_update ON public.incident_reports
  FOR UPDATE TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()))
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()));

CREATE TRIGGER incident_reports_touch
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_touch_updated_at();

-- Incident evidence -------------------------------------------------------
CREATE TABLE public.incident_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text,
  file_size int,
  caption text,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET DEFAULT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_evidence_incident ON public.incident_evidence(incident_id);
GRANT SELECT, INSERT, DELETE ON public.incident_evidence TO authenticated;
GRANT ALL ON public.incident_evidence TO service_role;
ALTER TABLE public.incident_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY incident_evidence_read ON public.incident_evidence
  FOR SELECT TO authenticated
  USING (
    public.has_knowledge_editor_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id = incident_id AND r.provider_user_id = auth.uid()
    )
  );
CREATE POLICY incident_evidence_insert_owner ON public.incident_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id = incident_id AND r.provider_user_id = auth.uid()
    )
  );
CREATE POLICY incident_evidence_delete_staff ON public.incident_evidence
  FOR DELETE TO authenticated
  USING (public.has_knowledge_editor_role(auth.uid()));

-- Incident event log ------------------------------------------------------
CREATE TABLE public.incident_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_events_incident ON public.incident_report_events(incident_id);
GRANT SELECT, INSERT ON public.incident_report_events TO authenticated;
GRANT ALL ON public.incident_report_events TO service_role;
ALTER TABLE public.incident_report_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY incident_events_read ON public.incident_report_events
  FOR SELECT TO authenticated
  USING (
    public.has_knowledge_editor_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id = incident_id AND r.provider_user_id = auth.uid()
    )
  );
CREATE POLICY incident_events_insert_staff ON public.incident_report_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_knowledge_editor_role(auth.uid()) OR actor_id = auth.uid());

-- =========================================================================
-- WORKFLOW RPCs
-- =========================================================================

CREATE OR REPLACE FUNCTION public.knowledge_article_save_draft(
  _article_id uuid,
  _patch jsonb,
  _change_summary text DEFAULT NULL
) RETURNS public.knowledge_articles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.knowledge_articles;
  next_version int;
BEGIN
  IF NOT public.has_knowledge_editor_role(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);

  SELECT * INTO a FROM public.knowledge_articles WHERE id = _article_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'article % not found', _article_id; END IF;
  IF a.status NOT IN ('draft','in_review') THEN
    UPDATE public.knowledge_articles SET status = 'draft' WHERE id = _article_id;
  END IF;

  next_version := a.current_version + 1;
  INSERT INTO public.knowledge_article_versions(article_id, version, snapshot, change_summary, created_by)
  VALUES (_article_id, next_version, to_jsonb(a), _change_summary, auth.uid());

  UPDATE public.knowledge_articles
    SET title            = coalesce(_patch->>'title', title),
        summary          = coalesce(_patch->>'summary', summary),
        body_md          = coalesce(_patch->>'body_md', body_md),
        risk_level       = coalesce((_patch->>'risk_level')::public.knowledge_risk_level, risk_level),
        safety_critical  = coalesce((_patch->>'safety_critical')::boolean, safety_critical),
        category_id      = coalesce((_patch->>'category_id')::uuid, category_id),
        expected_review_date = coalesce((_patch->>'expected_review_date')::date, expected_review_date),
        current_version  = next_version,
        updated_by       = auth.uid()
    WHERE id = _article_id
    RETURNING * INTO a;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_article_save_draft(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_article_save_draft(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.knowledge_article_submit_for_review(_article_id uuid)
RETURNS public.knowledge_articles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.knowledge_articles;
BEGIN
  IF NOT public.has_knowledge_editor_role(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);
  UPDATE public.knowledge_articles
    SET status='in_review', submitted_at=now(), submitted_by=auth.uid(), updated_by=auth.uid()
    WHERE id=_article_id AND status='draft'
    RETURNING * INTO a;
  IF NOT FOUND THEN RAISE EXCEPTION 'article % not in draft', _article_id; END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_article_submit_for_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_article_submit_for_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.knowledge_article_return_to_draft(_article_id uuid, _reason text DEFAULT NULL)
RETURNS public.knowledge_articles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.knowledge_articles;
BEGIN
  IF NOT public.has_knowledge_publisher_role(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);
  UPDATE public.knowledge_articles
    SET status='draft', review_notes=_reason, updated_by=auth.uid()
    WHERE id=_article_id AND status IN ('in_review','approved')
    RETURNING * INTO a;
  IF NOT FOUND THEN RAISE EXCEPTION 'article % not in reviewable state', _article_id; END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_article_return_to_draft(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_article_return_to_draft(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.knowledge_article_approve(_article_id uuid)
RETURNS public.knowledge_articles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.knowledge_articles;
BEGIN
  IF NOT public.has_knowledge_publisher_role(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);
  UPDATE public.knowledge_articles
    SET status='approved', approved_at=now(), approved_by=auth.uid(), updated_by=auth.uid()
    WHERE id=_article_id AND status='in_review'
    RETURNING * INTO a;
  IF NOT FOUND THEN RAISE EXCEPTION 'article % not in review', _article_id; END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_article_approve(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_article_approve(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.knowledge_article_publish(_article_id uuid)
RETURNS public.knowledge_articles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.knowledge_articles;
BEGIN
  IF NOT public.has_knowledge_publisher_role(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);
  SELECT * INTO a FROM public.knowledge_articles WHERE id=_article_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'article % not found', _article_id; END IF;
  IF a.status <> 'approved' THEN RAISE EXCEPTION 'article % must be approved before publish', _article_id; END IF;
  IF a.verification_required AND a.verified_at IS NULL THEN
    RAISE EXCEPTION 'article % requires verification before publish', _article_id;
  END IF;
  UPDATE public.knowledge_articles
    SET status='published', published_at=now(), published_by=auth.uid(), updated_by=auth.uid()
    WHERE id=_article_id
    RETURNING * INTO a;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_article_publish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_article_publish(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.knowledge_article_archive(_article_id uuid, _reason text DEFAULT NULL)
RETURNS public.knowledge_articles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.knowledge_articles;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);
  UPDATE public.knowledge_articles
    SET status='archived', archived_at=now(), archived_by=auth.uid(), review_notes=_reason, updated_by=auth.uid()
    WHERE id=_article_id
    RETURNING * INTO a;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_article_archive(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_article_archive(uuid, text) TO authenticated;

-- Country emergency info workflow
CREATE OR REPLACE FUNCTION public.country_emergency_info_verify(_country_code char(2))
RETURNS public.country_emergency_info
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.country_emergency_info;
BEGIN
  IF NOT public.has_knowledge_editor_role(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);
  UPDATE public.country_emergency_info
    SET verified_at=now(), verified_by=auth.uid(), updated_by=auth.uid()
    WHERE country_code=_country_code
    RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'country_emergency_info % not found', _country_code; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.country_emergency_info_verify(char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.country_emergency_info_verify(char) TO authenticated;

CREATE OR REPLACE FUNCTION public.country_emergency_info_publish(_country_code char(2))
RETURNS public.country_emergency_info
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.country_emergency_info;
BEGIN
  IF NOT public.has_knowledge_publisher_role(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM set_config('mycleaner.knowledge_workflow','rpc',true);
  SELECT * INTO r FROM public.country_emergency_info WHERE country_code=_country_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'country_emergency_info % not found', _country_code; END IF;
  IF r.verified_at IS NULL THEN
    RAISE EXCEPTION 'country_emergency_info % must be verified before publish', _country_code;
  END IF;
  UPDATE public.country_emergency_info
    SET approved_at=now(), approved_by=auth.uid(),
        published=true, published_at=now(), published_by=auth.uid(),
        updated_by=auth.uid()
    WHERE country_code=_country_code
    RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.country_emergency_info_publish(char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.country_emergency_info_publish(char) TO authenticated;

-- Incident report lifecycle RPCs
CREATE OR REPLACE FUNCTION public.incident_report_update_status(
  _incident_id uuid, _new_status public.incident_status, _notes text DEFAULT NULL
) RETURNS public.incident_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.incident_reports;
BEGIN
  IF NOT public.has_knowledge_editor_role(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.incident_reports
    SET status=_new_status,
        resolved_at=CASE WHEN _new_status IN ('resolved','dismissed') THEN now() ELSE resolved_at END,
        resolution_notes=coalesce(_notes, resolution_notes),
        assigned_to=coalesce(assigned_to, auth.uid())
    WHERE id=_incident_id
    RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident % not found', _incident_id; END IF;
  INSERT INTO public.incident_report_events(incident_id, actor_id, event_type, notes)
  VALUES (_incident_id, auth.uid(), 'status_changed:'||_new_status::text, _notes);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.incident_report_update_status(uuid, public.incident_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_report_update_status(uuid, public.incident_status, text) TO authenticated;

-- =========================================================================
-- Provider-safe view (security_invoker enforces caller RLS)
-- =========================================================================
CREATE OR REPLACE VIEW public.knowledge_articles_public
WITH (security_invoker = true) AS
SELECT
  a.id, a.slug, a.category_id, a.title, a.summary, a.body_md,
  a.risk_level, public.knowledge_risk_rank(a.risk_level) AS risk_rank,
  a.safety_critical, a.published_at, a.updated_at
FROM public.knowledge_articles a
WHERE a.status = 'published'
  AND (a.verification_required = false OR a.verified_at IS NOT NULL);

GRANT SELECT ON public.knowledge_articles_public TO authenticated, anon;
