#!/usr/bin/env bash
# Deploy local bot-service (with PnL exit fixes) to Railway Monadier service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/bot-service"

if [ -z "${RAILWAY_TOKEN:-}" ] && [ -z "${RAILWAY_API_TOKEN:-}" ]; then
  if [ -f "$HOME/.railway/config.json" ]; then
    export RAILWAY_API_TOKEN="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$HOME/.railway/config.json','utf8')).user?.token||'')")"
  fi
fi

if [ -z "${RAILWAY_TOKEN:-}" ] && [ -z "${RAILWAY_API_TOKEN:-}" ]; then
  echo "No Railway token. Use ONE of:"
  echo "  Project token (recommended for deploy): Project → Settings → Tokens → production"
  echo "    export RAILWAY_TOKEN=..."
  echo "  Account token: https://railway.com/account/tokens (Workspace = No workspace)"
  echo "    export RAILWAY_API_TOKEN=..."
  echo "  $0"
  exit 1
fi

echo "→ Build bot-service…"
npm run build

echo "→ Link Railway service…"
HL_PROJECT=38979153-d629-42f6-ae11-eb8f1418d750
HL_SERVICE=63bc77f7-21a3-4fa9-96db-7ecf7cd55802
HL_ENV=c133dcc4-8acf-4a71-b1d9-ce3967ea7971

if [ -n "${RAILWAY_API_TOKEN:-}" ] && [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "→ Link Railway service (account/workspace token)…"
  npx --yes @railway/cli@latest link \
    -p "$HL_PROJECT" \
    -s "$HL_SERVICE" \
    -e "$HL_ENV"
fi

echo "→ Upload & deploy (railway up)…"
npx --yes @railway/cli@latest up --detach \
  -p "$HL_PROJECT" \
  -s "$HL_SERVICE" \
  -e production

echo "→ Wait for health…"
sleep 25
URL="https://hypergain-bot-production.up.railway.app"
"$ROOT/scripts/verify-bot-api.sh" "$URL"
