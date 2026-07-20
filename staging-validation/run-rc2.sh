#!/usr/bin/env bash
# One-command RC2. Exits non-zero if any scenario fails.
set -uo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "❌ .env missing. Copy .env.example and fill in real staging secrets."
  exit 2
fi

export RC2_RUN_ID="${RC2_RUN_ID:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
export EVIDENCE="evidence/${RC2_RUN_ID}"
mkdir -p "$EVIDENCE"/{http,db,webhooks,audit,provider,marketplace,concurrent,admin,payouts,score,seed,ui,load}

echo "▶ RC2 run: $RC2_RUN_ID"
echo "  evidence: $EVIDENCE"
echo

# 1. Server-side scenarios (single Node process, one report).
bunx tsx run-scenarios.ts
NODE_STATUS=$?

# 2. Playwright UI scenarios (separate runner, evidence lands under $EVIDENCE/ui).
if command -v playwright >/dev/null 2>&1 || [[ -x node_modules/.bin/playwright ]]; then
  echo
  echo "▶ Playwright UI scenarios"
  bunx playwright test --config=playwright.config.ts
  PW_STATUS=$?
else
  echo "⚠ Playwright not installed; skipping UI scenarios."
  PW_STATUS=0
fi

# 3. k6 load — marketplace (skip if k6 missing).
if command -v k6 >/dev/null 2>&1; then
  echo
  echo "▶ k6 marketplace load"
  set -a; source .env; set +a
  k6 run --summary-export="$EVIDENCE/load/marketplace-summary.json" load/k6-marketplace.js
  K6_MP=$?

  echo
  echo "▶ k6 webhook load"
  # Pre-sign one payload via Node so k6 can replay it.
  bunx tsx sign-one.ts > "$EVIDENCE/load/signed.json"
  export RC2_SIGNED_PAYLOAD="$(bunx tsx -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.EVIDENCE+"/load/signed.json","utf8")).payload)')"
  export RC2_SIGNED_HEADER="$(bunx tsx -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.EVIDENCE+"/load/signed.json","utf8")).signature)')"
  k6 run --summary-export="$EVIDENCE/load/webhook-summary.json" load/k6-webhook.js
  K6_WH=$?
else
  echo "⚠ k6 not installed; skipping load tests. Install: https://k6.io/docs/get-started/installation/"
  K6_MP=0; K6_WH=0
fi

echo
echo "▶ Report: $EVIDENCE/report.md"
if [[ $NODE_STATUS -ne 0 || $PW_STATUS -ne 0 || $K6_MP -ne 0 || $K6_WH -ne 0 ]]; then
  echo "❌ RC2 FAILED (node=$NODE_STATUS pw=$PW_STATUS k6_mp=$K6_MP k6_wh=$K6_WH)"
  exit 1
fi
echo "✅ RC2 completed. See report."
