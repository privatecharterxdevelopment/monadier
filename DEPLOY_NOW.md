# Deploy HyperGain — Google login + live domain

Code is ready. You must finish **Vercel env**, **Supabase Auth URLs**, and **Google Cloud OAuth** for `hypergain.io`.

---

## YOU — Vercel (production)

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | `https://gbgafseabgqinnvlfslc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` `public` |
| `VITE_SITE_URL` | `https://www.hypergain.io` |
| `VITE_APP_URL` | `https://app.hypergain.io` |
| `VITE_SPLIT_DOMAINS` | `true` (when marketing + app are separate hosts) |
| `VITE_WALLETCONNECT_PROJECT_ID` | Reown project id |

Add domains in Vercel: `hypergain.io`, `www.hypergain.io`, `app.hypergain.io` → then DNS at registrar. Redeploy after env + DNS.

`monadier.vercel.app` permanently redirects to `https://www.hypergain.io` (see `vercel.json`). Prefer removing that alias from the Vercel project once Search Console is clean.

---

## YOU — Supabase Auth URLs

**Authentication → URL configuration**

- **Site URL:** `https://www.hypergain.io`
- **Redirect URLs:**

```
https://www.hypergain.io/auth/callback
https://www.hypergain.io/reset-password
https://hypergain.io/auth/callback
https://hypergain.io/reset-password
https://app.hypergain.io/auth/callback
https://app.hypergain.io/reset-password
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
```

Full guide: [docs/SUPABASE_AUTH_URLS.md](docs/SUPABASE_AUTH_URLS.md)

---

## YOU — Google login

1. [Google Cloud](https://console.cloud.google.com/) → Credentials → OAuth Web client  
2. **Redirect URI:** `https://gbgafseabgqinnvlfslc.supabase.co/auth/v1/callback`  
3. **JS origins:** `https://hypergain.io`, `https://www.hypergain.io`, `https://app.hypergain.io`, `http://localhost:5173`  
4. Paste Client ID + Secret → Supabase → Authentication → Google → **Enable**

---

## Test after redeploy

1. `/login` → **Continue with Google** → `/auth/callback` → Pro Trade app  
2. `/register` → **Continue with Google** (same OAuth; profile auto-created)  
3. Sign out / sign in again  
4. Forgot password → email → `/reset-password` (not localhost)

---

## Bot service

See **[docs/RAILWAY.md](docs/RAILWAY.md)**. Frontend may use `/bot-service` proxy or `VITE_BOT_API_URL`.
