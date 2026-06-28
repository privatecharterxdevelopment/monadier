# Railway — Monadier bot-service

Project: `jubilant-tranquility` (`38979153-d629-42f6-ae11-eb8f1418d750`)  
Service: `b65e307a-42cd-48ce-b8bd-5e04bc6dbcc6`

## Service settings

| Setting | Value |
|---------|--------|
| **Root directory** | `bot-service` |
| **Build** | Nixpacks (`npm ci` + `npm run build`) |
| **Start** | `npm run start` (see `bot-service/railway.json`) |
| **Health check** | `/health` |
| **Public networking** | `https://monadier-production.up.railway.app` |

## Required variables (Hyperliquid-only — no Arbitrum vault)

See `bot-service/.env.example`:

- `BOT_PRIVATE_KEY`
- `HL_BUILDER_ADDRESS` — fee wallet (≥$100 USDC on **Hyperliquid perps**)
- `HL_AGENT_MASTER_SECRET` (or falls back to `BOT_PRIVATE_KEY`)
- `HL_BUILDER_FEE_PERP=30`, `HL_BUILDER_MAX_APPROVAL=0.1%`, `HL_SUCCESS_FEE_BPS=1000`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `NODE_ENV=production`, `ENABLE_DEMO_SIMULATOR=false`
- `RESEND_API_KEY`, `RESEND_FROM`, `APP_PUBLIC_URL`
- Optional: `ARBITRUM_RPC_URL` + `ENABLE_ARBITRUM_PAYMENT_MONITOR=true` (subscription USDC → same builder wallet)

**Do not use** `TREASURY_ADDRESS` or `ARBITRUM_VAULT_ADDRESS` — vault contracts removed.

## Verify deploy (CLI)

```bash
cd bot-service
npx @railway/cli login
npx @railway/cli link -p 38979153-d629-42f6-ae11-eb8f1418d750 -s b65e307a-42cd-48ce-b8bd-5e04bc6dbcc6
npx @railway/cli variables set HL_BUILDER_ADDRESS=0x... HL_BUILDER_FEE_PERP=30 HL_BUILDER_MAX_APPROVAL=0.1%
cd .. && ./scripts/verify-bot-api.sh "$(cd bot-service && npx @railway/cli domain)"
curl -s "$(cd bot-service && npx @railway/cli domain)/api/hl-builder/status" | jq
```

## Vercel (production dashboard)

- `VITE_BOT_API_URL` = Railway public URL
- `VITE_SITE_URL=https://www.monadier.io`
- `VITE_APP_URL=https://app.monadier.io`
- `VITE_HL_BUILDER_ADDRESS` = same as Railway `HL_BUILDER_ADDRESS`

Redeploy production after env changes.
