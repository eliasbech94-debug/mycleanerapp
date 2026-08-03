#!/usr/bin/env bash
# staging-bootstrap.sh
# Idempotent bootstrap for the mycleaner-staging Supabase project.
#
# Runs locally, on an operator's machine, against a project ref they pass
# explicitly. Never targets production. Never prints secret values.
#
# Usage:
#   ./scripts/staging-bootstrap.sh --project-ref <STAGING_REF> --dry-run
#   ./scripts/staging-bootstrap.sh --project-ref <STAGING_REF> --confirm
#
# Optional:
#   --secrets-file staging.secrets     (default: ./staging.secrets)
#   --skip-migrations
#   --skip-functions
#   --skip-secrets

set -Eeuo pipefail

# ── Constants ─────────────────────────────────────────────────────────────
PROD_REF="qfjgifubavuomwvroahy"
DEFAULT_SECRETS_FILE="staging.secrets"
REQUIRED_FILES=(
  "supabase/config.toml"
  "supabase/migrations"
  "supabase/functions"
  "staging.secrets.example"
)
REQUIRED_CLIS=("supabase")

# ── Colours (no colour if not a TTY) ──────────────────────────────────────
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; YEL=$'\033[0;33m'; GRN=$'\033[0;32m'
  CYA=$'\033[0;36m'; BLD=$'\033[1m'; RST=$'\033[0m'
else
  RED=""; YEL=""; GRN=""; CYA=""; BLD=""; RST=""
fi

log()   { printf '%s[bootstrap]%s %s\n' "$CYA" "$RST" "$*"; }
warn()  { printf '%s[bootstrap]%s %s\n' "$YEL" "$RST" "$*" >&2; }
err()   { printf '%s[bootstrap ERROR]%s %s\n' "$RED" "$RST" "$*" >&2; }
ok()    { printf '%s[bootstrap OK]%s %s\n' "$GRN" "$RST" "$*"; }
die()   { err "$*"; exit 1; }

# ── Arg parsing ───────────────────────────────────────────────────────────
PROJECT_REF=""
SECRETS_FILE="$DEFAULT_SECRETS_FILE"
DRY_RUN=0
CONFIRM=0
SKIP_MIGRATIONS=0
SKIP_FUNCTIONS=0
SKIP_SECRETS=0

usage() {
  cat <<EOF
Usage: $0 --project-ref <STAGING_REF> [--dry-run | --confirm] [options]

Required:
  --project-ref REF        Supabase staging project ref (must NOT be production)
  --dry-run                Print planned actions, make no changes
  --confirm                Actually execute (mutually exclusive with --dry-run)

Optional:
  --secrets-file PATH      Env-file with staging secrets (default: $DEFAULT_SECRETS_FILE)
  --skip-migrations        Skip 'supabase db push'
  --skip-functions         Skip 'supabase functions deploy'
  --skip-secrets           Skip 'supabase secrets set'
  -h | --help              Show this help

Refuses to run against production ref: $PROD_REF
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)     PROJECT_REF="${2:-}"; shift 2 ;;
    --secrets-file)    SECRETS_FILE="${2:-}"; shift 2 ;;
    --dry-run)         DRY_RUN=1; shift ;;
    --confirm)         CONFIRM=1; shift ;;
    --skip-migrations) SKIP_MIGRATIONS=1; shift ;;
    --skip-functions)  SKIP_FUNCTIONS=1; shift ;;
    --skip-secrets)    SKIP_SECRETS=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    *) die "Unknown argument: $1 (use --help)" ;;
  esac
done

# ── Preflight ─────────────────────────────────────────────────────────────
[[ -n "$PROJECT_REF" ]] || { usage; die "--project-ref is required"; }

if [[ "$DRY_RUN" -eq 0 && "$CONFIRM" -eq 0 ]]; then
  die "Refusing to run without an explicit mode. Pass --dry-run or --confirm."
fi
if [[ "$DRY_RUN" -eq 1 && "$CONFIRM" -eq 1 ]]; then
  die "--dry-run and --confirm are mutually exclusive."
fi

if [[ "$PROJECT_REF" == "$PROD_REF" ]]; then
  die "Refusing to operate on the production project ref ($PROD_REF)."
fi
if [[ ! "$PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  die "Project ref '$PROJECT_REF' does not look like a Supabase project ref (20 lowercase alphanumerics)."
fi

# Repo root sanity — every required path must exist relative to CWD.
for f in "${REQUIRED_FILES[@]}"; do
  [[ -e "$f" ]] || die "Required path missing (are you at the repo root?): $f"
done

# CLI dependencies.
for c in "${REQUIRED_CLIS[@]}"; do
  command -v "$c" >/dev/null 2>&1 || die "Missing required CLI: $c"
done

# supabase login state (best-effort; older CLIs lack `projects list`).
if ! supabase projects list >/dev/null 2>&1; then
  warn "Could not confirm 'supabase login' state. If commands fail, run: supabase login"
fi

# Secrets file (only required when we actually intend to push secrets).
if [[ "$SKIP_SECRETS" -eq 0 ]]; then
  if [[ ! -f "$SECRETS_FILE" ]]; then
    die "Secrets file not found: $SECRETS_FILE
     Copy staging.secrets.example → $SECRETS_FILE and fill in real values,
     or pass --skip-secrets to defer this step."
  fi
  # Refuse world-readable secrets file on POSIX systems.
  if command -v stat >/dev/null 2>&1; then
    mode="$(stat -c '%a' "$SECRETS_FILE" 2>/dev/null || stat -f '%A' "$SECRETS_FILE" 2>/dev/null || echo "")"
    if [[ -n "$mode" && "$mode" =~ ^[0-9]+$ && "${mode: -1}" != "0" ]]; then
      warn "$SECRETS_FILE is world-readable (mode $mode). Recommend: chmod 600 $SECRETS_FILE"
    fi
  fi
fi

# ── Plan summary ──────────────────────────────────────────────────────────
mode_label="DRY-RUN (no changes)"
[[ "$CONFIRM" -eq 1 ]] && mode_label="EXECUTE (will mutate staging)"

cat <<EOF
${BLD}Staging bootstrap plan${RST}
  Mode           : $mode_label
  Project ref    : $PROJECT_REF
  Prod ref guard : $PROD_REF (refused)
  Secrets file   : $SECRETS_FILE (values never printed)
  Steps          :
    1. supabase link                         $([[ 1 -eq 1 ]] && echo "(always)")
    2. supabase db push                      $([[ "$SKIP_MIGRATIONS" -eq 1 ]] && echo "SKIPPED" || echo "planned")
    3. supabase functions deploy             $([[ "$SKIP_FUNCTIONS" -eq 1 ]] && echo "SKIPPED" || echo "planned")
    4. supabase secrets set --env-file …     $([[ "$SKIP_SECRETS" -eq 1 ]] && echo "SKIPPED" || echo "planned")
EOF

run() {
  # $1 = human label, remaining args = command
  local label="$1"; shift
  log "→ $label"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '  DRY-RUN: %s\n' "$*"
    return 0
  fi
  if "$@"; then ok "$label"; else err "$label failed"; return 1; fi
}

# ── Step 1: link ──────────────────────────────────────────────────────────
run "Link Supabase project" \
  supabase link --project-ref "$PROJECT_REF"

# ── Step 2: migrations ────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATIONS" -eq 0 ]]; then
  run "Push migrations (idempotent)" \
    supabase db push --project-ref "$PROJECT_REF"
else
  warn "Skipping migrations (--skip-migrations)"
fi

# ── Step 3: edge functions ────────────────────────────────────────────────
if [[ "$SKIP_FUNCTIONS" -eq 0 ]]; then
  run "Deploy edge functions (idempotent)" \
    supabase functions deploy --project-ref "$PROJECT_REF"
else
  warn "Skipping edge functions (--skip-functions)"
fi

# ── Step 4: secrets ───────────────────────────────────────────────────────
if [[ "$SKIP_SECRETS" -eq 0 ]]; then
  # Never cat / echo the file. Hand it directly to the CLI.
  run "Upload staging secrets from $SECRETS_FILE" \
    supabase secrets set --project-ref "$PROJECT_REF" --env-file "$SECRETS_FILE"
else
  warn "Skipping secrets (--skip-secrets)"
fi

echo
if [[ "$DRY_RUN" -eq 1 ]]; then
  ok "Dry-run complete. Re-run with --confirm to execute."
else
  ok "Bootstrap complete for project $PROJECT_REF."
  echo "   Next: run  bunx tsx staging-validation/verify-phase1.ts"
fi
