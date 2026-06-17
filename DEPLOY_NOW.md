# Deploy Monadier (you only do steps marked **YOU**)

Code fixes are in this repo. Two things only you can do in browsers: **Google OAuth** and **Vercel env**.

---

## YOU — Vercel (5 min)

Project → Settings → Environment Variables → Production:

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | `https://gbgafseabgqinnvlfslc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` `public` |
| `VITE_SITE_URL` | `https://monadier.vercel.app` |
| `VITE_WALLETCONNECT_PROJECT_ID` | your Reown project id |

Deployments → **Redeploy** latest `main`.

---

## YOU — Supabase Auth URLs (5 min)

Dashboard → Authentication → URL configuration:

- **Site URL:** `https://monadier.vercel.app` (not `http://localhost:3000`)
- **Redirect URLs** (add every host you use):

```
https://monadier.vercel.app/auth/callback
https://monadier.vercel.app/**
https://*.vercel.app/auth/callback
http://localhost:5173/auth/callback
```

If Google login sends you to `localhost:3000/?code=...`, Site URL or Redirect URLs are wrong — fix here, then try again.

---

## YOU — Google login (10 min)

1. [Google Cloud](https://console.cloud.google.com/) → Credentials → OAuth Web client  
2. Redirect URI: `https://gbgafseabgqinnvlfslc.supabase.co/auth/v1/callback`  
3. Origin: `https://monadier.vercel.app`  
4. Paste Client ID + Secret into Supabase → Authentication → Google → Enable  

---

## Already done via CLI (migrations on remote)

- `gmx_execution_requests`
- `trade_history` (deploy migration)
- `positions` RLS (users see only their wallets)

---

## Test after redeploy

1. https://monadier.vercel.app/login → Google → **/dashboard2** (not legacy glass UI)  
2. Profile: `/dashboard2/profile` → save name/avatar → back to trade → greeting updates  
3. History dock: open position → **Close** → status `closing` → bot settles  
4. Forgot password → email → reset works  
5. https://monadier.vercel.app/your-funds — vault explanation  

---

## Bot service (required — Railway or Render)

Without a running bot: no auto-trading, no live signals in dashboard.

1. Deploy `bot-service` — see **[docs/BOT_DEPLOY.md](docs/BOT_DEPLOY.md)** (Render / Fly / VPS).
2. Railway: `docs/RAILWAY.md` — root dir `bot-service`, redeploy, `./scripts/verify-bot-api.sh <url>`
3. Vercel: optional `VITE_BOT_API_URL` — production uses `/bot-service` proxy in `vercel.json` → Railway. Redeploy after pull.
3. Redeploy frontend after bot is up (`curl YOUR-BOT-URL/health`).
