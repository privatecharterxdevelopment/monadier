# Bot-Service deployen (ohne Railway)

Der **bot-service** muss 24/7 laufen. Ohne ihn gibt es:

- kein Auto-Trading (keine neuen Trades, kein Close von `closing`)
- keine `/api/signal` Daten für die Dashboard-Analyse
- kein `bot_analysis` in Supabase (wird vom Bot geschrieben)

Frontend: setze in **Vercel** `VITE_BOT_API_URL` auf die öffentliche URL deines Bot-Servers.

---

## Option A — Render.com (empfohlen)

1. [render.com](https://render.com) → Account → **New** → **Blueprint**
2. Repo `monadier` verbinden → `render.yaml` im Root wird erkannt
3. Env-Variablen setzen (siehe `bot-service/.env.example`):

| Variable | Wert |
|----------|------|
| `BOT_PRIVATE_KEY` | Hot-Wallet des Vault-Bots (geheim) |
| `SUPABASE_URL` | `https://gbgafseabgqinnvlfslc.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service Role (geheim) |
| `TREASURY_ADDRESS` | Treasury-Wallet |
| `ARBITRUM_VAULT_ADDRESS` | `0x7dE97f35887b2623dCad2ebA68197f58F7607854` |
| `ARBITRUM_RPC_URL` | Alchemy/Infura Arb RPC (empfohlen) |
| `EXPECTED_BOT_ADDRESS` | Optional: Adresse von `BOT_PRIVATE_KEY` |

4. Deploy → URL z. B. `https://monadier-bot.onrender.com`
5. Test: `curl https://DEINE-URL/health`
6. **Vercel** → `VITE_BOT_API_URL=https://DEINE-URL` → Redeploy Frontend

**Hinweis:** Free Tier schläft nach Inaktivität — für Trading **Starter** ($7/mo) oder höher.

---

## Option B — Fly.io

```bash
cd bot-service
fly launch --no-deploy
fly secrets set BOT_PRIVATE_KEY=0x... SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
fly deploy
fly certs show  # HTTPS URL
```

`fly.toml` kann aus Dockerfile generiert werden (`internal_port = 3001`, `http_service` health `/health`).

---

## Option C — VPS (Hetzner / DigitalOcean)

```bash
# Auf dem Server
git clone https://github.com/privatecharterxdevelopment/monadier.git
cd monadier/bot-service
cp .env.example .env   # ausfüllen
npm ci && npm run build
npm install -g pm2
pm2 start dist/index.js --name monadier-bot
pm2 save && pm2 startup
```

Nginx/Caddy vor Port 3001 für HTTPS. Firewall nur 443/80.

---

## Lokal testen

```bash
cd bot-service
cp .env.example .env
npm run dev
curl http://localhost:3001/health
curl "http://localhost:3001/api/signal?symbol=ETHUSDT&timeframes=1m,5m,15m,1h"
```

---

## Checkliste nach Deploy

- [ ] `/health` → `status: healthy`
- [ ] `/api/signal?...` → JSON mit `success: true`
- [ ] Vercel `VITE_BOT_API_URL` gesetzt
- [ ] Bot-Wallet hat ETH auf Arbitrum (Gas)
- [ ] `EXPECTED_BOT_ADDRESS` = on-chain `bot` im Vault (falls gesetzt)
