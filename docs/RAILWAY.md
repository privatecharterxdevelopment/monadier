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
| **Public networking** | `https://monadier-production.up.railway.app` (generate domain if missing) |

## Required variables

See `bot-service/.env.example` and `docs/PRODUCTION.md`:

- `BOT_PRIVATE_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `TREASURY_ADDRESS`
- `ARBITRUM_VAULT_ADDRESS=0x7dE97f35887b2623dCad2ebA68197f58F7607854`
- `ARBITRUM_RPC_URL` (Alchemy/Infura recommended)
- `NODE_ENV=production`
- `ENABLE_DEMO_SIMULATOR=false`
- Optional: `EXPECTED_BOT_ADDRESS` (must match vault `bot`)

## Verify deploy (CLI)

```bash
cd bot-service
npx @railway/cli login          # refresh if "Unauthorized"
npx @railway/cli link -p 38979153-d629-42f6-ae11-eb8f1418d750 -s b65e307a-42cd-48ce-b8bd-5e04bc6dbcc6
npx @railway/cli domain         # copy public URL
cd .. && ./scripts/verify-bot-api.sh "$(cd bot-service && npx @railway/cli domain)"
```

Healthy Monadier `/health` includes `"version":"v11.0-gmx-arbitrum"`.

## Vercel (production dashboard)

On the team that hosts **monadier.vercel.app** (not a fork):

1. `VITE_BOT_API_URL` = Railway public URL (no trailing slash)
2. Redeploy production

Without this, Dashboard2 analysis shows **Bot service API: Offline** (DB fallback only).

## Logs to confirm

After deploy, **Deploy logs** should show:

- `Production vault check`
- `API server running on port …`
- Cron: trade loop, monitor, reconcile

**Supabase** `bot_analysis.updated_at` should advance within a few minutes when the bot is scanning.
