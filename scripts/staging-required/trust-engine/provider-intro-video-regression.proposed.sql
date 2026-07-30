-- Trust Engine Phase 1B: v6 isolated-staging schema regression proposal.
-- REVIEW ONLY. Never run against production or a project sharing production data.
--
-- This file is a self-contained SQL contract for the schema/RPCs proposed in the
-- companion v6 SQL. It is not the final endpoint/HMAC/concurrency test suite.
-- Promotion remains blocked until a later implementation PR adds and runs the
-- separate endpoint + worker + concurrent-session harness.

\set ON_ERROR_STOP on
\if :{?provider_a_uid}
\else
  \echo 'provider_a_uid is required'
  \quit 2
\endif
\if :{?provider_b_uid}
\else
  \echo 'provider_b_uid is required'
  \quit 2
\endif

begin;

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %', message; end if;
end $$;

create or replace function pg_temp.expect_sqlstate(statement text, expected text, message text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'ASSERTION FAILED: expected %: %', expected, message;
  exception when others then
    if sqlstate <> expected then
      raise exception 'ASSERTION FAILED: expected %, got %: %', expected, sqlstate, message;
    end if;
  end;
end $$;

-- Required schema objects.
select pg_temp.assert_true(to_regclass('public.provider_intro_videos') is not null,'video table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_jobs') is not null,'job table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_objects') is not null,'object registry missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_callback_nonces') is not null,'nonce table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_callback_results') is not null,'callback result table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_consent_versions') is not null,'consent version table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_videos_provider_safe') is not null,'provider safe view missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_videos_support_safe') is not null,'support safe view missing');
select pg_temp.assert_true(to_regprocedure('public.provider_intro_video_publish_proposed(uuid,uuid)') is not null,'publish function missing');
select pg_temp.assert_true(to_regprocedure('public.provider_intro_video_has_active_consent(uuid,uuid)') is not null,'active consent function missing');

-- RLS is enabled on all sensitive base tables.
select pg_temp.assert_true(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in (
      'provider_intro_videos','provider_intro_video_jobs','provider_intro_video_objects',
      'provider_intro_video_callback_nonces','provider_intro_video_callback_results',
      'provider_intro_video_consent_versions'
    ) and c.relrowsecurity=false
), 'RLS missing on sensitive table');

-- Safe views use invoker security + security barrier and exclude restricted columns.
select pg_temp.assert_true(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('provider_intro_videos_provider_safe','provider_intro_videos_support_safe')
    and not (coalesce((c.reloptions::text[] @> array['security_invoker=true']),false)
             and coalesce((c.reloptions::text[] @> array['security_barrier=true']),false))
), 'safe view security options missing');

select pg_temp.assert_true(not exists (
  select 1 from information_schema.columns
  where table_schema='public'
    and table_name in ('provider_intro_videos_provider_safe','provider_intro_videos_support_safe')
    and column_name in ('storage_path','sha256','transcript','moderation_reason','worker_job_id','lease_token')
), 'safe view exposes restricted column');

-- Valid portrait + landscape/padded landscape.
insert into public.provider_intro_videos(id,provider_user_id,moderation_status,width_pixels,height_pixels,candidate_expires_at)
values ('10000000-0000-0000-0000-000000000001',:'provider_a_uid'::uuid,'draft',1080,1920,now()+interval '30 minutes');
insert into public.provider_intro_videos(id,provider_user_id,moderation_status,width_pixels,height_pixels,candidate_expires_at)
values ('20000000-0000-0000-0000-000000000001',:'provider_b_uid'::uuid,'draft',1920,1088,now()+interval '30 minutes');

select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_videos(provider_user_id,moderation_status,width_pixels,height_pixels)
    values (%L::uuid,'draft',1920,1920)$q$,:'provider_b_uid'),
  '23514','square video exceeds pixel ceiling'
);
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_videos(provider_user_id,moderation_status,width_pixels,height_pixels)
    values (%L::uuid,'draft',240,426)$q$,:'provider_b_uid'),
  '23514','minimum short side enforced'
);

-- One candidate maximum without triggering review-state checks first.
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_videos(provider_user_id,moderation_status,candidate_expires_at)
    values (%L::uuid,'uploading',now()+interval '30 minutes')$q$,:'provider_b_uid'),
  '23505','one active candidate per provider'
);

-- Provider id is immutable.
select pg_temp.expect_sqlstate(
  format($q$update public.provider_intro_videos set provider_user_id=%L::uuid
    where id='10000000-0000-0000-0000-000000000001'$q$,:'provider_b_uid'),
  'P0001','video provider id immutable'
);

-- Job/video owner binding and lease/retry contracts.
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_jobs(video_id,provider_user_id,status)
    values ('10000000-0000-0000-0000-000000000001',%L::uuid,'queued')$q$,:'provider_b_uid'),
  'P0001','job provider must match video provider'
);
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_jobs(video_id,provider_user_id,status,next_attempt_at)
    values ('10000000-0000-0000-0000-000000000001',%L::uuid,'retry_wait',null)$q$,:'provider_a_uid'),
  '23514','retry_wait requires future next_attempt_at'
);
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_jobs(video_id,provider_user_id,status,locked_by,lease_token,lease_expires_at,heartbeat_at)
    values ('10000000-0000-0000-0000-000000000001',%L::uuid,'queued','worker',gen_random_uuid(),now()+interval '1 minute',now())$q$,:'provider_a_uid'),
  '23514','non-leased job cannot retain lease fields'
);
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_jobs(video_id,provider_user_id,status,attempt_count,max_attempts,last_error_code,dead_lettered_at)
    values ('10000000-0000-0000-0000-000000000001',%L::uuid,'dead_letter',4,5,'timeout',now())$q$,:'provider_a_uid'),
  '23514','dead letter requires attempts=max_attempts'
);

-- Global nonce replay protection, including key rotation.
insert into public.provider_intro_video_jobs(id,video_id,provider_user_id,status)
values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',:'provider_a_uid'::uuid,'queued');
insert into public.provider_intro_video_callback_nonces(nonce_digest,key_id,job_id,callback_timestamp,expires_at)
values (repeat('a',64),'k1','40000000-0000-0000-0000-000000000001',now(),now()+interval '10 minutes');
select pg_temp.expect_sqlstate(
  $q$insert into public.provider_intro_video_callback_nonces(nonce_digest,key_id,job_id,callback_timestamp,expires_at)
     values (repeat('a',64),'k2','40000000-0000-0000-0000-000000000001',now(),now()+interval '10 minutes')$q$,
  '23505','nonce replay rejected across key ids'
);
select pg_temp.expect_sqlstate(
  $q$insert into public.provider_intro_video_callback_nonces(nonce_digest,key_id,job_id,callback_timestamp,expires_at)
     values (repeat('b',64),'k1','40000000-0000-0000-0000-000000000001',now()-interval '10 minutes',now()+interval '5 minutes')$q$,
  '23514','stale callback timestamp rejected'
);

-- Callback result binds idempotency key to key/job/body.
insert into public.provider_intro_video_callback_results(
  idempotency_key,key_id,job_id,request_body_sha256,response_status,response_body
) values ('idem-1','k1','40000000-0000-0000-0000-000000000001',repeat('b',64),200,'{"ok":true}'::jsonb);
select pg_temp.expect_sqlstate(
  $q$insert into public.provider_intro_video_callback_results(
    idempotency_key,key_id,job_id,request_body_sha256,response_status,response_body
  ) values ('idem-1','k1','40000000-0000-0000-0000-000000000001',repeat('c',64),200,'{}'::jsonb)$q$,
  '23505','idempotency key cannot be reused with another body'
);

-- Strict object paths and persistent registry ownership.
insert into public.provider_intro_video_objects(
  id,provider_user_id,original_video_id,video_id,kind,storage_path,sha256,
  byte_length,storage_version,verified_at,immutable
) values (
  '50000000-0000-0000-0000-000000000001',:'provider_a_uid'::uuid,
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  'final_video',:'provider_a_uid'||'/10000000-0000-0000-0000-000000000001/final/'||repeat('d',64)||'.mp4',
  repeat('d',64),100000,'etag-1',now(),true
);
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_objects(
    provider_user_id,original_video_id,video_id,kind,storage_path
  ) values (%L::uuid,'10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','incoming',
    %L||'/10000000-0000-0000-0000-000000000001/incoming/../bad.exe')$q$,
    :'provider_a_uid',:'provider_a_uid'),
  '23514','incoming path filename and extension constrained'
);

-- Active consent must be latest, correct type/version, granted and same owner.
insert into public.provider_intro_video_consent_versions(policy_version,active,effective_at)
values ('intro-v1',true,now()-interval '1 day');
insert into public.consent_ledger(id,user_id,consent_type,policy_version,granted)
values ('30000000-0000-0000-0000-000000000001',:'provider_a_uid'::uuid,
  'provider_intro_video_publication','intro-v1',true);
select pg_temp.assert_true(public.provider_intro_video_has_active_consent(
  :'provider_a_uid'::uuid,'30000000-0000-0000-0000-000000000001'
),'latest granted consent should be active');
insert into public.consent_ledger(id,user_id,consent_type,policy_version,granted)
values ('30000000-0000-0000-0000-000000000002',:'provider_a_uid'::uuid,
  'provider_intro_video_publication','intro-v1',false);
select pg_temp.assert_true(not public.provider_intro_video_has_active_consent(
  :'provider_a_uid'::uuid,'30000000-0000-0000-0000-000000000001'
),'newer revoke invalidates prior grant');

-- Retention seeds and cleanup hot-path index exist.
select pg_temp.assert_true((select count(*) from public.data_retention_policies
  where record_type like 'provider_intro_video_%')=4,'retention seeds missing');
select pg_temp.assert_true(exists (
  select 1 from pg_indexes where schemaname='public'
    and indexname='provider_intro_video_objects_cleanup_queue'
),'cleanup queue index missing');

rollback;

-- Mandatory later implementation gates, intentionally not faked in this architecture PR:
-- 1. two-session SKIP LOCKED lease claim and heartbeat ownership;
-- 2. real HTTP HMAC canonical-byte validation and key rotation;
-- 3. crash between object verification and publish, then reconciliation;
-- 4. concurrent double-publish/replacement race;
-- 5. signed-upload object overwrite denial and out-of-band object swap;
-- 6. role-impersonated provider/support/admin safe-view isolation;
-- 7. legal-hold cleanup worker behavior and immutable audit coverage.
