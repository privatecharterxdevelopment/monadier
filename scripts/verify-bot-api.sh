#!/usr/bin/env bash
# Verify Monadier bot-service is reachable (Railway / Render / VPS).
# Usage:
#   ./scripts/verify-bot-api.sh https://your-bot.up.railway.app
#   BOT_URL=https://... ./scripts/verify-bot-api.sh

set -euo pipefail

BASE="${1:-${BOT_URL:-}}"
if [ -z "$BASE" ]; then
  echo "Usage: $0 <bot-base-url>"
  echo "  e.g. $0 https://bot-service-production.up.railway.app"
  exit 1
fi

BASE="${BASE%/}"
echo "Checking $BASE ..."

health=$(curl -fsS --max-time 15 "$BASE/health") || {
  echo "FAIL: /health unreachable"
  exit 1
}

echo "GET /health"
echo "$health" | head -c 500
echo ""

if ! echo "$health" | grep -q 'v11.0-gmx-arbitrum'; then
  echo "WARN: response does not look like Monadier bot (expected version v11.0-gmx-arbitrum)"
  echo "      You may be hitting a different Railway service."
fi

signal=$(curl -fsS --max-time 20 "$BASE/api/signal?symbol=ETHUSDT&timeframes=1m,5m,15m,1h") || {
  echo "FAIL: /api/signal unreachable"
  exit 1
}

echo ""
echo "GET /api/signal (ETHUSDT)"
echo "$signal" | head -c 600
echo ""
echo "OK — set Vercel VITE_BOT_API_URL=$BASE and redeploy frontend."
