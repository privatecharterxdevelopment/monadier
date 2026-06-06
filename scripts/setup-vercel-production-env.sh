#!/usr/bin/env bash
# Sync required Vite env vars to the linked Vercel project (production).
# Run from repo root after: npx vercel link --project <production-project>
#
# monadier.vercel.app is deployed from GitHub → Lorenzo's Vercel team.
# Ensure `vercel whoami` and `vercel link` target that team/project before running.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v vercel >/dev/null 2>&1; then
  VERCEL=(npx vercel@latest)
else
  VERCEL=(vercel)
fi

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local — copy .env.example and fill Supabase + Reown values."
  exit 1
fi

# shellcheck disable=SC1091
source <(grep -E '^VITE_' .env.local | sed 's/^/export /')

: "${VITE_SUPABASE_URL:?Set VITE_SUPABASE_URL in .env.local}"
: "${VITE_SUPABASE_ANON_KEY:?Set VITE_SUPABASE_ANON_KEY in .env.local}"

VITE_SITE_URL="${VITE_SITE_URL:-https://monadier.vercel.app}"
VITE_APP_URL="${VITE_APP_URL:-https://app.monadier.com}"
VITE_BOT_API_URL="${VITE_BOT_API_URL:-https://monadier-production.up.railway.app}"

add_env() {
  local name="$1"
  local value="$2"
  if "${VERCEL[@]}" env ls production 2>/dev/null | grep -q " ${name} "; then
    printf '%s' "$value" | "${VERCEL[@]}" env update "$name" production --yes
  else
    printf '%s' "$value" | "${VERCEL[@]}" env add "$name" production --yes
  fi
  echo "✓ $name"
}

echo "Project: $("${VERCEL[@]}" project ls 2>/dev/null | head -5 || true)"
echo "Syncing production env..."

add_env VITE_SUPABASE_URL "$VITE_SUPABASE_URL"
add_env VITE_SUPABASE_ANON_KEY "$VITE_SUPABASE_ANON_KEY"
add_env VITE_SITE_URL "$VITE_SITE_URL"
add_env VITE_APP_URL "$VITE_APP_URL"
add_env VITE_BOT_API_URL "$VITE_BOT_API_URL"

if [[ -n "${VITE_WALLETCONNECT_PROJECT_ID:-}" && "$VITE_WALLETCONNECT_PROJECT_ID" != *your-* ]]; then
  add_env VITE_WALLETCONNECT_PROJECT_ID "$VITE_WALLETCONNECT_PROJECT_ID"
elif [[ -n "${VITE_REOWN_PROJECT_ID:-}" ]]; then
  add_env VITE_REOWN_PROJECT_ID "$VITE_REOWN_PROJECT_ID"
else
  echo "⚠ Skip wallet project id — add VITE_WALLETCONNECT_PROJECT_ID to .env.local (https://cloud.reown.com)"
fi

if [[ -n "${VITE_ADMIN_EMAILS:-}" ]]; then
  add_env VITE_ADMIN_EMAILS "$VITE_ADMIN_EMAILS"
fi

echo ""
echo "Done. Redeploy production:"
echo "  ${VERCEL[*]} deploy --prod --yes"
