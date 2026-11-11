# Railway — HyperGain bot-service

Project: `jubilant-tranquility` (`38979153-d629-42f6-ae11-eb8f1418d750`)  
Service: `hypergain-bot` (`63bc77f7-21a3-4fa9-96db-7ecf7cd55802`)  
Environment: `production` (`c133dcc4-8acf-4a71-b1d9-ce3967ea7971`)

## Service settings

| Setting | Value |
|---------|--------|
| **Root directory** | `bot-service` |
| **Build** | Dockerfile (`bot-service/Dockerfile` — not Nixpacks CLI snapshots) |
| **Start** | `npm run start` (see `bot-service/railway.json`) |
| **Health check** | `/health` |
| **Public networking** | `https://hypergain-bot-production.up.railway.app` |

## Required variables (Hyperliquid-only — no Arbitrum vault)

See `bot-service/.env.example`:

- `BOT_PRIVATE_KEY`
- `HL_BUILDER_ADDRESS` — **admin builder wallet** (`0x1fBc…`) — HL 0.1% builder fee + same wallet receives Arbitrum USDC success fees
- `PLATFORM_FEE_TREASURY_ADDRESS` — **same as builder** — users pay bot success fees (10%) here as native USDC on Arbitrum
- `HL_AGENT_MASTER_SECRET` (or falls back to `BOT_PRIVATE_KEY`)
- `HL_BUILDER_FEE_PERP=0`, `HL_BUILDER_MAX_APPROVAL=0.1%`, `HL_SUCCESS_FEE_BPS=0` (fees off by default)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `NODE_ENV=production`, `ENABLE_DEMO_SIMULATOR=false`
- `RESEND_API_KEY`, `RESEND_FROM` (must use a **verified** Resend domain — e.g. `HyperGain <hello@hypergain.io>` after DNS at [resend.com/domains](https://resend.com/domains)), `APP_PUBLIC_URL=https://hypergain.io`
- Optional: `ARBITRUM_RPC_URL` + `ENABLE_ARBITRUM_PAYMENT_MONITOR=true` (subscription USDC → same builder wallet)

**Do not use** the legacy vault treasury `0x64d79e…` for fees. **Do not use** `TREASURY_ADDRESS` or `ARBITRUM_VAULT_ADDRESS` for fee routing.

## Production readiness (do not auto-deploy)

Final audit: [`PRODUCTION_READINESS_AUDIT.md`](./PRODUCTION_READINESS_AUDIT.md). Verdict at last audit: **NO-GO** until a signed Hyperliquid fill of the capped profit stop-market is observed. Deploy/rollback checklist is in that file.

## Verify deploy (CLI)

```bash
cd bot-service
npx @railway/cli login
npx @railway/cli link -p 38979153-d629-42f6-ae11-eb8f1418d750 -s 63bc77f7-21a3-4fa9-96db-7ecf7cd55802
npx @railway/cli variables set HL_BUILDER_ADDRESS=0x... HL_BUILDER_FEE_PERP=30 HL_BUILDER_MAX_APPROVAL=0.1%
cd .. && ./scripts/verify-bot-api.sh "https://hypergain-bot-production.up.railway.app"
curl -s "https://hypergain-bot-production.up.railway.app/api/hl-builder/status" | jq
```

## Vercel (production dashboard)

- `VITE_BOT_API_URL` = `https://hypergain-bot-production.up.railway.app`
- `VITE_SITE_URL=https://www.hypergain.io` (or `https://monadier.vercel.app` until DNS is live)
- `VITE_APP_URL=https://www.hypergain.io`
- `VITE_HL_BUILDER_ADDRESS` = Railway `HL_BUILDER_ADDRESS` (HL 0.1% builder only)
- `VITE_PLATFORM_FEE_TREASURY_ADDRESS` = Railway `PLATFORM_FEE_TREASURY_ADDRESS` (your MetaMask for success fees)

Redeploy production after env changes.
