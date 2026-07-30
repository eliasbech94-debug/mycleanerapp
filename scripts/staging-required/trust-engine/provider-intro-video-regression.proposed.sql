-- Trust Engine Phase 1B: executable-shape regression proposal.
-- REVIEW ONLY. This file is intentionally outside normal CI and must not be run
-- against production or any project sharing production data.
--
-- Promotion requirement: replace TODO fixture identifiers and wire the approved
-- migration/RPC/function names before executing on isolated staging.

\set ON_ERROR_STOP on

begin;

-- Required fixture roles/users (replace in isolated staging harness):
--   :provider_a_uid
--   :provider_b_uid
--   :admin_uid
--   :support_uid
-- Required helper: set request.jwt.claims / role exactly as existing RLS regressions do.

-- 1. Schema invariants
select 1 / case when exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and indexname = 'provider_intro_videos_one_published_per_provider'
) then 1 else 0 end;

select 1 / case when exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and indexname = 'provider_intro_videos_one_candidate_per_provider'
) then 1 else 0 end;

select 1 / case when exists (
  select 1 from pg_trigger
  where tgname = 'trg_provider_intro_video_guard'
    and not tgisinternal
) then 1 else 0 end;

-- 2. Checksum validation
-- Expect failure: malformed checksum.
do $$
begin
  begin
    insert into public.provider_intro_videos (
      provider_user_id, moderation_status, final_object_checksum
    ) values (
      :'provider_a_uid'::uuid, 'draft', 'not-sha256'
    );
    raise exception 'expected malformed checksum rejection';
  exception when check_violation then null;
  end;
end $$;

-- 3. Portrait support and pixel ceiling
-- 1080x1920 must be accepted by dimensional constraints.
insert into public.provider_intro_videos (
  id, provider_user_id, moderation_status, width_pixels, height_pixels,
  candidate_expires_at
) values (
  gen_random_uuid(), :'provider_a_uid'::uuid, 'draft', 1080, 1920,
  now() + interval '30 minutes'
);

-- Expect failure: more than 2,073,600 decoded pixels.
do $$
begin
  begin
    insert into public.provider_intro_videos (
      provider_user_id, moderation_status, width_pixels, height_pixels
    ) values (
      :'provider_b_uid'::uuid, 'draft', 1920, 1920
    );
    raise exception 'expected pixel-limit rejection';
  exception when check_violation then null;
  end;
end $$;

-- 4. One candidate maximum including approved
-- Create provider B candidate, then expect second candidate failure.
insert into public.provider_intro_videos (
  provider_user_id, moderation_status, candidate_expires_at
) values (
  :'provider_b_uid'::uuid, 'draft', now() + interval '30 minutes'
);

do $$
begin
  begin
    insert into public.provider_intro_videos (
      provider_user_id, moderation_status, candidate_expires_at
    ) values (
      :'provider_b_uid'::uuid, 'uploading', now() + interval '30 minutes'
    );
    raise exception 'expected one-candidate unique violation';
  exception when unique_violation then null;
  end;
end $$;

-- 5. Replacement integrity
-- TODO: create two providers' terminal rows and assert cross-provider predecessor fails.
-- TODO: create A->B and assert B->A cycle fails.
-- TODO: assert two successors cannot reference one predecessor.
-- TODO: assert reciprocal links are written by publish RPC in one transaction.

-- 6. Direct-client RLS
-- TODO: impersonate provider A and assert:
--   * own SELECT succeeds;
--   * provider B SELECT returns no rows;
--   * direct INSERT/UPDATE/DELETE is denied;
--   * intro-video job rows are visible only to owner/admin/super_admin;
--   * support cannot read job rows or unsafe media metadata projection.

-- 7. Consent
-- TODO: append provider_intro_video_publication granted=true ledger row.
-- TODO: assert publish RPC succeeds only for latest accepted-version grant.
-- TODO: append newer granted=false row and assert immediate unpublish.
-- TODO: assert consent for provider B cannot publish provider A video.

-- 8. Callback authentication and replay
-- TODO: invoke callback endpoint/harness with:
--   * valid HMAC/timestamp/nonce/job binding -> accepted;
--   * same nonce replay -> rejected or idempotent previous result;
--   * expired timestamp -> rejected;
--   * wrong video/provider/job binding -> rejected;
--   * repeated same idempotency key -> no duplicate transition/audit event.

-- 9. Worker timeout and dead letter
-- TODO: create processing job past deadline.
-- TODO: run reconciliation once per attempt until max_attempts.
-- TODO: assert retry_wait/backoff then dead_letter.
-- TODO: assert video leaves blocking candidate state or provider can withdraw/recover.

-- 10. Crash recovery between verification and publish
-- TODO: create job status ready_to_publish with publish_pending_at set.
-- TODO: simulate process exit before publish RPC.
-- TODO: run reconciliation and assert exactly one published row and completed job.

-- 11. Double-publish race
-- TODO: run two concurrent publish attempts for same provider.
-- TODO: assert one succeeds, one fails safely, replacement links remain reciprocal,
--       one published row remains, and audit event is not duplicated.

-- 12. Object immutability/path binding
-- TODO: assert final path ends /<sha256>.mp4 and matches checksum column.
-- TODO: attempt path/checksum mutation after set and expect guard rejection.
-- TODO: attempt overwrite with upsert=false and expect Storage denial.
-- TODO: mutate/delete final object out of band and assert verification job unpublishes.

-- 13. Retention and cleanup
-- TODO: assert deterministic handling for failed/rejected/archived/expired.
-- TODO: assert active legal hold prevents physical deletion but not required unpublish.
-- TODO: assert account deletion and consent withdrawal schedule correct cleanup.

-- 14. Audit coverage
-- TODO: assert immutable audit event for create, upload, processing result,
--       moderation, publish, replacement, unpublish, expiry, withdrawal and deletion.

rollback;
