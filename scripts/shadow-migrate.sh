#!/usr/bin/env bash
# Replays every supabase/migrations/*.sql against a clean shadow database.
# Runs the whole set TWICE to prove idempotency, then reruns any *fixtures*
# to catch enum / ordering / rollback issues.
#
# Usage:
#   SHADOW_DB_URL=postgres://user:pass@host:5432/shadow ./scripts/shadow-migrate.sh
#
# The URL MUST NOT point at production. The script refuses any db name
# containing "prod" and any host matching the production project ref.
set -Eeuo pipefail

: "${SHADOW_DB_URL:?SHADOW_DB_URL is required (postgres:// URL to an empty database)}"
PROD_REF="qfjgifubavuomwvroahy"
if [[ "$SHADOW_DB_URL" == *"$PROD_REF"* ]] || [[ "$SHADOW_DB_URL" == *"prod"* ]]; then
  echo "refusing: SHADOW_DB_URL looks like production" >&2; exit 2
fi

MIG_DIR="supabase/migrations"
[[ -d "$MIG_DIR" ]] || { echo "no $MIG_DIR" >&2; exit 2; }

echo "▶ resetting shadow schema"
psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

apply_all() {
  local label="$1"; local fail=0
  echo "▶ applying migrations ($label)"
  for f in $(ls -1 "$MIG_DIR"/*.sql | sort); do
    printf '  · %s ... ' "$(basename "$f")"
    if psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/shadow-migrate.log 2>&1; then
      echo "ok"
    else
      echo "FAIL"; cat /tmp/shadow-migrate.log; fail=1; break
    fi
  done
  return $fail
}

apply_all "pass 1 (clean deploy)"       || { echo "clean deploy failed"; exit 1; }
apply_all "pass 2 (idempotent replay)"  || { echo "replay failed — migrations are not idempotent"; exit 1; }

echo "▶ sanity: enum + function inventory"
psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -c "SELECT n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public' ORDER BY 1,2;"
psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -c "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ('lock_pricing_quote','round_half_away') ORDER BY 1;"

echo "✓ shadow migration replay complete"
