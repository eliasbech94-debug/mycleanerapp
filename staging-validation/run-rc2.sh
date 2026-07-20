#!/usr/bin/env bash
# RC2 driver. One command, several modes.
#
#   ./run-rc2.sh --preflight     — validate environment, migrations, RPCs, keys, callbacks
#   ./run-rc2.sh --server-only   — seed + scenarios 01-10 (no UI, no load)
#   ./run-rc2.sh --ui-only       — Playwright UI flows only
#   ./run-rc2.sh --load-only     — k6 marketplace + webhook load only
#   ./run-rc2.sh --full          — preflight → server → UI → load  (default if no flag)
#
# Environment protection:
#   - config.ts refuses production hosts and live Stripe keys.
#   - RC2_ALLOW_DESTRUCTIVE_STAGING_TESTS must be "true" in .env.
#   - Every artifact runs through the central redactor before being written.
set -uo pipefail
cd "$(dirname "$0")"

MODE="${1:---full}"

if [[ ! -f .env ]]; then
  echo "❌ .env missing. Copy .env.example and fill in real STAGING secrets."
  exit 2
fi

export RC2_RUN_ID="${RC2_RUN_ID:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
export EVIDENCE="evidence/${RC2_RUN_ID}"
mkdir -p "$EVIDENCE"/{http,db,webhooks,audit,provider,marketplace,concurrent,admin,payouts,score,seed,ui,load}

echo "▶ RC2 mode:    $MODE"
echo "▶ RC2 run id:  $RC2_RUN_ID"
echo "▶ evidence:    $EVIDENCE"
echo

run_preflight() { bunx tsx preflight.ts; }
run_server() { bunx tsx run-scenarios.ts; }
run_ui() {
  if command -v playwright >/dev/null 2>&1 || [[ -x node_modules/.bin/playwright ]]; then
    bunx playwright test --config=playwright.config.ts
  else
    echo "⚠ Playwright not installed — UI scenarios NOT_EXECUTED."
    return 0
  fi
}
run_load() {
  if ! command -v k6 >/dev/null 2>&1; then
    echo "⚠ k6 not installed — load scenarios NOT_EXECUTED."; return 0
  fi
  set -a; source .env; set +a
  k6 run --summary-export="$EVIDENCE/load/marketplace-summary.json" load/k6-marketplace.js
  MP=$?
  bunx tsx sign-one.ts > "$EVIDENCE/load/signed.json"
  export RC2_SIGNED_PAYLOAD="$(bunx tsx -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.EVIDENCE+"/load/signed.json","utf8")).payload)')"
  export RC2_SIGNED_HEADER="$(bunx tsx -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.EVIDENCE+"/load/signed.json","utf8")).signature)')"
  k6 run --summary-export="$EVIDENCE/load/webhook-summary.json" load/k6-webhook.js
  WH=$?
  return $(( MP | WH ))
}

STATUS=0
case "$MODE" in
  --preflight)   run_preflight; STATUS=$?; ;;
  --server-only) run_server;    STATUS=$?; ;;
  --ui-only)     run_ui;        STATUS=$?; ;;
  --load-only)   run_load;      STATUS=$?; ;;
  --full)
    run_preflight || { echo "❌ preflight failed — aborting"; exit 1; }
    run_server; S1=$?
    run_ui;     S2=$?
    run_load;   S3=$?
    STATUS=$(( S1 | S2 | S3 ))
    ;;
  *) echo "unknown mode: $MODE  (use --preflight | --server-only | --ui-only | --load-only | --full)"; exit 2; ;;
esac

echo
echo "▶ Report: $EVIDENCE/report.md"
if [[ $STATUS -ne 0 ]]; then
  echo "❌ RC2 finished with failures (status=$STATUS). See report."
  exit 1
fi
echo "✅ RC2 mode $MODE completed. Review report before beta gate."
