#!/usr/bin/env bash
# Deploy bot-service to Railway hypergain-bot (service rootDir = bot-service).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${RAILWAY_TOKEN:-}" ] && [ -z "${RAILWAY_API_TOKEN:-}" ]; then
  if [ -f "$HOME/.railway/config.json" ]; then
    export RAILWAY_API_TOKEN="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$HOME/.railway/config.json','utf8')).user?.token||'')")"
  fi
fi

if [ -z "${RAILWAY_TOKEN:-}" ] && [ -z "${RAILWAY_API_TOKEN:-}" ]; then
  echo "No Railway token. Project token (production): export RAILWAY_TOKEN=..."
  exit 1
fi

HL_PROJECT=38979153-d629-42f6-ae11-eb8f1418d750
HL_SERVICE=63bc77f7-21a3-4fa9-96db-7ecf7cd55802
HL_ENV=c133dcc4-8acf-4a71-b1d9-ce3967ea7971

echo "→ Build bot-service…"
npm run build --prefix "$ROOT/bot-service"

if [ -n "${RAILWAY_API_TOKEN:-}" ] && [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "→ Link Railway service…"
  npx --yes @railway/cli@latest link -p "$HL_PROJECT" -s "$HL_SERVICE" -e "$HL_ENV"
fi

# Railway rootDir=bot-service requires upload tree with bot-service/ + .git (CLI snapshot).
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -a "$ROOT/.git" "$STAGE/"
mkdir -p "$STAGE/bot-service"
tar -C "$ROOT/bot-service" --exclude=node_modules --exclude=dist -cf - . | tar -C "$STAGE/bot-service" -xf -
export GIT_COMMIT="${GIT_COMMIT:-$(git -C "$ROOT" rev-parse --short HEAD)}"
echo "→ Upload & deploy (commit ${GIT_COMMIT})…"
cd "$STAGE"
npx --yes @railway/cli@latest up --detach \
  -p "$HL_PROJECT" \
  -s "$HL_SERVICE" \
  -e production

echo "→ Wait for rollout…"
sleep 45
URL="https://hypergain-bot-production.up.railway.app"
"$ROOT/scripts/verify-bot-api.sh" "$URL"