#!/usr/bin/env bash
# One-shot: refresh Railway auth, print public URL, verify Monadier bot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/bot-service"

echo "→ Log in to Railway (browser opens)…"
npx --yes @railway/cli@latest login

echo "→ Link Monadier bot service…"
npx --yes @railway/cli@latest link \
  -p 38979153-d629-42f6-ae11-eb8f1418d750 \
  -s b65e307a-42cd-48ce-b8bd-5e04bc6dbcc6

echo "→ Public URL:"
URL="$(npx --yes @railway/cli@latest domain | tail -1 | tr -d '[:space:]')"
if [ -z "$URL" ]; then
  echo "No domain yet. In Railway: Settings → Networking → Generate Domain, then re-run."
  exit 1
fi
[[ "$URL" != http* ]] && URL="https://${URL}"

echo "$URL"
cd "$ROOT"
./scripts/verify-bot-api.sh "$URL"

echo ""
echo "Add to Vercel (monadier.vercel.app project):"
echo "  VITE_BOT_API_URL=$URL"
