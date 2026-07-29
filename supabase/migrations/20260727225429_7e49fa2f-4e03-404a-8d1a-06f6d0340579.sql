
ALTER FUNCTION public._knowledge_in_workflow() SET search_path = public;
ALTER FUNCTION public.knowledge_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.knowledge_articles_workflow_guard() SET search_path = public;
ALTER FUNCTION public.country_emergency_workflow_guard() SET search_path = public;
ALTER FUNCTION public.knowledge_risk_rank(public.knowledge_risk_level) SET search_path = public;

DROP VIEW IF EXISTS public.knowledge_articles_public;
CREATE VIEW public.knowledge_articles_public
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  a.id, a.slug, a.category_id, a.title, a.summary, a.body_md,
  a.risk_level, public.knowledge_risk_rank(a.risk_level) AS risk_rank,
  a.safety_critical, a.published_at, a.updated_at
FROM public.knowledge_articles a
WHERE a.status = 'published'
  AND (a.verification_required = false OR a.verified_at IS NOT NULL);
GRANT SELECT ON public.knowledge_articles_public TO authenticated, anon;
