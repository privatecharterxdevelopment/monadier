#!/usr/bin/env bash
# Deploy local bot-service (with PnL exit fixes) to Railway Monadier service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/bot-service"

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  if [ -f "$HOME/.railway/config.json" ]; then
    export RAILWAY_TOKEN="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$HOME/.railway/config.json','utf8')).user?.token||'')")"
  fi
fi

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "No RAILWAY_TOKEN. Create one: https://railway.com/account/tokens"
  echo "  export RAILWAY_TOKEN=..."
  echo "  $0"
  exit 1
fi

echo "→ Build bot-service…"
npm run build

echo "→ Link Railway service…"
npx --yes @railway/cli@latest link \
  -p 38979153-d629-42f6-ae11-eb8f1418d750 \
  -s b65e307a-42cd-48ce-b8bd-5e04bc6dbcc6 \
  -e c133dcc4-8acf-4a71-b1d9-ce3967ea7971

echo "→ Upload & deploy (railway up)…"
npx --yes @railway/cli@latest up --detach

echo "→ Wait for health…"
sleep 25
URL="https://monadier-production.up.railway.app"
"$ROOT/scripts/verify-bot-api.sh" "$URL"
