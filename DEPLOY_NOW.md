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

- **Site URL:** `https://monadier.vercel.app`
- **Redirect URLs:**

```
https://monadier.vercel.app/auth/callback
https://monadier.vercel.app/reset-password
http://localhost:5173/auth/callback
```

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

1. https://monadier.vercel.app/login → Google → dashboard  
2. Forgot password → email → reset works  
3. Register → if email confirm on, “Check your email” screen  
4. https://monadier.vercel.app/your-funds — vault explanation  

---

## Bot (Railway)

Ensure `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ARBITRUM_VAULT_ADDRESS=0x7dE97f35887b2623dCad2ebA68197f58F7607854`, `BOT_PRIVATE_KEY` are set. Redeploy bot after frontend.
