# Vercel project env for HyperGain production.
# Domains: www.hypergain.io (marketing) · app.hypergain.io (terminal)

set -euo pipefail

PROJECT="${VERCEL_PROJECT_NAME:-monadier}"
SCOPE_ARGS=()
if [[ -n "${VERCEL_SCOPE:-}" ]]; then
  SCOPE_ARGS+=(--scope "$VERCEL_SCOPE")
fi

VITE_SITE_URL="${VITE_SITE_URL:-https://www.hypergain.io}"
VITE_APP_URL="${VITE_APP_URL:-https://app.hypergain.io}"

echo "Setting production env on Vercel project: $PROJECT"
echo "  VITE_SITE_URL=$VITE_SITE_URL"
echo "  VITE_APP_URL=$VITE_APP_URL"

# Caller must already have other secrets in the Vercel project (Supabase, etc.).
vercel env add VITE_SITE_URL production "${SCOPE_ARGS[@]}" <<<"$VITE_SITE_URL" || true
vercel env add VITE_APP_URL production "${SCOPE_ARGS[@]}" <<<"$VITE_APP_URL" || true

echo "Done. Redeploy so the new env is live."
