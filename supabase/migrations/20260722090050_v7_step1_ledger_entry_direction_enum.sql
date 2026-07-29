-- =============================================================================
-- Funds Release v7 — Step 1 (M-01 bridge)
-- Adds public.ledger_entry_direction enum that M-02 depends on.
--
-- Context: On a clean deploy the enum is created in M-01
-- (20260722090000_v7_step1_finance_catalogues.sql). On staging, however, M-01
-- had already been recorded in supabase_migrations.schema_migrations BEFORE
-- ledger_entry_direction was added to its DO-block, so amending M-01 alone
-- would not re-run on staging. This intermediate migration guarantees the
-- enum exists on any environment before M-02 (090100) is (re)applied.
--
-- Fully idempotent, additive, and matches the production definition exactly:
--   public.ledger_entry_direction AS ENUM ('debit','credit')
-- =============================================================================
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_direction') THEN
    CREATE TYPE public.ledger_entry_direction AS ENUM ('debit','credit');
  END IF;
END $$;

COMMIT;
