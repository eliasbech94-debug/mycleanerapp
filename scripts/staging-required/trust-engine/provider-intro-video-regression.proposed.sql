-- Trust Engine Phase 1B: v5 isolated-staging regression contract.
-- REVIEW ONLY. Never run against production or a project sharing production data.
--
-- Execution order after promotion work exists:
--   1. apply the approved migration to an isolated staging database;
--   2. deploy approved RPCs/functions and test worker callback endpoint;
--   3. run this file with real fixture UUIDs and endpoint secrets;
--   4. rollback fixture data or destroy the isolated database.

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

-- Catalog/promotion gates: fail immediately until all required objects exist.
select pg_temp.assert_true(to_regclass('public.provider_intro_videos') is not null, 'video table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_jobs') is not null, 'job table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_objects') is not null, 'object registry missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_callback_nonces') is not null, 'nonce table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_video_callback_results') is not null, 'callback result table missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_videos_provider_safe') is not null, 'provider safe view missing');
select pg_temp.assert_true(to_regclass('public.provider_intro_videos_support_safe') is not null, 'support safe view missing');

select pg_temp.assert_true(to_regprocedure('public.provider_intro_video_claim_job(text,integer)') is not null, 'lease claim RPC missing');
select pg_temp.assert_true(to_regprocedure('public.provider_intro_video_heartbeat(uuid,uuid)') is not null, 'heartbeat RPC missing');
select pg_temp.assert_true(to_regprocedure('public.provider_intro_video_reconcile(uuid,uuid,text)') is not null, 'reconcile RPC missing');
select pg_temp.assert_true(to_regprocedure('public.provider_intro_video_publish(uuid,text)') is not null, 'publish RPC missing');
select pg_temp.assert_true(to_regprocedure('public.provider_intro_video_withdraw(uuid)') is not null, 'withdraw RPC missing');

-- SECURITY DEFINER/search_path/execute contract.
select pg_temp.assert_true(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'provider_intro_video_%'
    and p.prosecdef=false
    and p.proname in ('provider_intro_video_claim_job','provider_intro_video_heartbeat','provider_intro_video_reconcile','provider_intro_video_publish','provider_intro_video_withdraw')
), 'required RPC is not SECURITY DEFINER');

select pg_temp.assert_true(not exists (
  select 1 from information_schema.routine_privileges
  where routine_schema='public' and routine_name like 'provider_intro_video_%' and grantee='PUBLIC'
), 'PUBLIC execute remains granted');

-- Safe views must not expose paths/checksums/transcript/internal moderation.
select pg_temp.assert_true(not exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name in ('provider_intro_videos_provider_safe','provider_intro_videos_support_safe')
    and column_name in ('incoming_storage_path','final_storage_path','storage_path','sha256','final_object_checksum','transcript','moderation_reason','worker_job_id','lease_token')
), 'safe view exposes restricted column');

-- Provider A: valid portrait candidate.
insert into public.provider_intro_videos(id,provider_user_id,moderation_status,width_pixels,height_pixels,candidate_expires_at)
values ('10000000-0000-0000-0000-000000000001', :'provider_a_uid'::uuid, 'draft',1080,1920,now()+interval '30 minutes');

-- Pixel ceiling and minimum resolution.
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_videos(provider_user_id,moderation_status,width_pixels,height_pixels)
           values (%L::uuid,'draft',1920,1920)$q$, :'provider_b_uid'),
  '23514','square video must exceed pixel ceiling'
);
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_videos(provider_user_id,moderation_status,width_pixels,height_pixels)
           values (%L::uuid,'draft',240,426)$q$, :'provider_b_uid'),
  '23514','minimum short side must be enforced'
);

-- One candidate maximum.
insert into public.provider_intro_videos(id,provider_user_id,moderation_status,candidate_expires_at)
values ('20000000-0000-0000-0000-000000000001', :'provider_b_uid'::uuid,'draft',now()+interval '30 minutes');
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_videos(provider_user_id,moderation_status,candidate_expires_at)
           values (%L::uuid,'approved',now()+interval '30 minutes')$q$, :'provider_b_uid'),
  '23505','approved must be included in candidate uniqueness'
);

-- Job/video owner binding.
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_jobs(video_id,provider_user_id,status)
           values ('10000000-0000-0000-0000-000000000001',%L::uuid,'queued')$q$, :'provider_b_uid'),
  'P0001','job provider must match video provider'
);

-- Retry/dead-letter constraints.
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_jobs(video_id,provider_user_id,status,next_attempt_at)
           values ('10000000-0000-0000-0000-000000000001',%L::uuid,'retry_wait',null)$q$, :'provider_a_uid'),
  '23514','retry_wait requires next_attempt_at'
);
select pg_temp.expect_sqlstate(
  format($q$insert into public.provider_intro_video_jobs(video_id,provider_user_id,status,dead_lettered_at)
           values ('10000000-0000-0000-0000-000000000001',%L::uuid,'dead_letter',now())$q$, :'provider_a_uid'),
  '23514','dead_letter requires error code'
);

-- Consent owner mismatch.
insert into public.consent_ledger(id,user_id,consent_type,policy_version,granted)
values ('30000000-0000-0000-0000-000000000001', :'provider_b_uid'::uuid,
        'provider_intro_video_publication','v1',true);
select pg_temp.expect_sqlstate(
  format($q$update public.provider_intro_videos
           set consent_ledger_id='30000000-0000-0000-0000-000000000001'
           where id='10000000-0000-0000-0000-000000000001'$q$),
  'P0001','consent must belong to video provider'
);

-- Callback nonce/result persistence and replay uniqueness.
insert into public.provider_intro_video_jobs(id,video_id,provider_user_id,status)
values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',:'provider_a_uid'::uuid,'queued');
insert into public.provider_intro_video_callback_nonces(key_id,nonce_digest,job_id,callback_timestamp,expires_at)
values ('k1',repeat('a',64),'40000000-0000-0000-0000-000000000001',now(),now()+interval '15 minutes');
select pg_temp.expect_sqlstate(
  $q$insert into public.provider_intro_video_callback_nonces(key_id,nonce_digest,job_id,callback_timestamp,expires_at)
     values ('k1',$$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$$,
       '40000000-0000-0000-0000-000000000001',now(),now()+interval '15 minutes')$q$,
  '23505','nonce replay must be rejected'
);
insert into public.provider_intro_video_callback_results(idempotency_key,job_id,request_body_sha256,response_status,response_body)
values ('idem-1','40000000-0000-0000-0000-000000000001',repeat('b',64),200,'{"ok":true}'::jsonb);
select pg_temp.expect_sqlstate(
  $q$insert into public.provider_intro_video_callback_results(idempotency_key,job_id,request_body_sha256,response_status,response_body)
     values ('idem-1','40000000-0000-0000-0000-000000000001',repeat('c',64),200,'{}'::jsonb)$q$,
  '23505','idempotency key must be unique'
);

-- Object path/checksum/provider binding.
insert into public.provider_intro_video_objects(
  id,provider_user_id,video_id,kind,storage_path,sha256,byte_length,storage_version,verified_at,immutable
) values (
  '50000000-0000-0000-0000-000000000001', :'provider_a_uid'::uuid,
  '10000000-0000-0000-0000-000000000001','final_video',
  :'provider_a_uid' || '/10000000-0000-0000-0000-000000000001/final/' || repeat('d',64) || '.mp4',
  repeat('d',64),100000,'etag-1',now(),true
);

-- Persistent orphan handling: deleting provider/video must be restricted while object registry exists.
select pg_temp.expect_sqlstate(
  format('delete from public.provider_profiles where user_id=%L::uuid', :'provider_a_uid'),
  '23503','provider deletion must not erase object registry'
);

-- Active consent predicate, revoke-trigger, RLS role impersonation, worker callback HMAC,
-- lease concurrency, crash recovery, double-publish race, replacement cycle/reciprocity,
-- object-swap detection, legal-hold cleanup and audit assertions are executed by the
-- companion integration/concurrency harness. Promotion must fail unless that harness is
-- present and green; catalog check below makes its registration mandatory.
select pg_temp.assert_true(exists (
  select 1 from public.test_harness_registry
  where harness_key='provider_intro_video_v5_integration' and enabled=true
), 'integration/concurrency harness is not registered');

rollback;
