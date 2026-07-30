-- MyCleaner legal acceptance P0 audit
-- READ-ONLY. Safe to run against staging or production.
-- This script does not mutate data.

-- 1) Published legal documents and hash verification.
-- Requires pgcrypto for digest().
select
  id,
  kind,
  country_code,
  language,
  version,
  status,
  required,
  effective_at,
  body_hash,
  encode(digest(convert_to(body_md, 'UTF8'), 'sha256'), 'hex') as computed_sha256,
  body_hash = encode(digest(convert_to(body_md, 'UTF8'), 'sha256'), 'hex') as hash_matches
from public.legal_documents
where status = 'published'
order by kind, country_code, language, version;

-- 2) Required document kinds that are missing from published documents.
with required_kinds(kind) as (
  values ('terms'::text), ('privacy'::text), ('provider_agreement'::text)
)
select rk.kind as missing_required_kind
from required_kinds rk
where not exists (
  select 1
  from public.legal_documents d
  where d.kind = rk.kind
    and d.status = 'published'
    and d.required = true
    and d.effective_at <= now()
);

-- 3) Acceptance rows whose captured hash no longer matches the referenced document.
select
  a.user_id,
  a.document_id,
  a.version as accepted_version,
  d.version as document_version,
  a.document_hash as accepted_hash,
  d.body_hash as document_hash,
  a.accepted_at,
  a.source
from public.user_legal_acceptances a
join public.legal_documents d on d.id = a.document_id
where a.document_hash is distinct from d.body_hash
   or a.version is distinct from d.version
order by a.accepted_at desc;

-- 4) Users with accounts but no legal acceptance evidence.
-- Review age threshold before using operationally; five minutes avoids flagging in-flight signups.
select
  u.id as user_id,
  u.created_at,
  u.email
from auth.users u
where u.created_at < now() - interval '5 minutes'
  and not exists (
    select 1
    from public.user_legal_acceptances a
    where a.user_id = u.id
  )
order by u.created_at desc;

-- 5) Providers without a versioned provider agreement acceptance.
select
  p.user_id,
  p.created_at,
  p.terms_accepted_at
from public.provider_profiles p
where not exists (
  select 1
  from public.user_legal_acceptances a
  join public.legal_documents d on d.id = a.document_id
  where a.user_id = p.user_id
    and d.kind = 'provider_agreement'
)
order by p.created_at desc;

-- 6) Duplicate/parallel consent evidence overview.
select
  'user_legal_acceptances' as source,
  count(*)::bigint as row_count,
  count(distinct user_id)::bigint as users
from public.user_legal_acceptances
union all
select
  'consent_ledger' as source,
  count(*)::bigint as row_count,
  count(distinct user_id)::bigint as users
from public.consent_ledger;
