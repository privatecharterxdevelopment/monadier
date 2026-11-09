# HyperGain (monadier)

Trading dashboard + Hyperliquid multi-user bot.

## Apps

| Piece | Path | Run |
|-------|------|-----|
| Dashboard (Vite) | repo root | `npm ci && npm run dev -- --host 0.0.0.0 --port 43127` |
| Bot API | `bot-service/` | `cd bot-service && npm ci && npm run build && npm start` |

## Production

- **Web:** `https://www.hypergain.io` (Vercel)
- **Bot:** `https://hypergain-bot-production.up.railway.app` (`GET /health`)
- **Supabase:** project `hathjgtvmgyxahqfhjka` (schema + 16 Edge Functions)

## Local env

```bash
cp .env.example .env.local
# Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (see docs/SUPABASE_SETUP.md)
npm ci
npm run dev -- --host 0.0.0.0 --port 43127
```

Optional emails need `RESEND_API_KEY` on Railway + Supabase function secrets.

After every bot close the engine waits **at least 10 minutes** (wallet-wide, even if other slots are still open) and re-analyzes 15m/1h structure before the next open. Same-coin re-entry and anti-flip use the same 10-minute floor.

See `docs/SUPABASE_RESTORE_INVENTORY.md`, `docs/RAILWAY.md`, `DEPLOY_NOW.md`.
