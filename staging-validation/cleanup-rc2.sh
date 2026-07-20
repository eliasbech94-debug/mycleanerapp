#!/usr/bin/env bash
# Cleanup disposable RC2 test data. Preserves audit evidence.
#   ./cleanup-rc2.sh <run-id>
#   ./cleanup-rc2.sh --all-rc2
set -uo pipefail
cd "$(dirname "$0")"
if [[ ! -f .env ]]; then echo "❌ .env missing"; exit 2; fi
if [[ $# -lt 1 ]]; then echo "usage: $0 <run-id|--all-rc2>"; exit 2; fi
bunx tsx cleanup.ts "$1"
