# Supabase auth URLs — HyperGain (safe cutover)

**Site URL stays `https://monadier.vercel.app` until hypergain.io DNS is live.**  
Redirect URLs are **additive** — old hosts keep working so you can keep testing.

## Already pushed to Supabase (project `gbgafseabgqinnvlfslc`)

**Site URL:** `https://monadier.vercel.app` (unchanged)

**Redirect URLs (all allowed):**

```
https://monadier.vercel.app/auth/callback
https://monadier.vercel.app/reset-password
https://hypergain.io/auth/callback
https://hypergain.io/reset-password
https://www.hypergain.io/auth/callback
https://www.hypergain.io/reset-password
https://app.hypergain.io/auth/callback
https://app.hypergain.io/reset-password
https://app.monadier.io/auth/callback
https://app.monadier.io/reset-password
https://www.monadier.io/auth/callback
https://www.monadier.io/reset-password
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
```

Google provider Client ID/Secret were **not** touched by config push.

## App behavior (keeps testing intact)

OAuth `redirectTo` = **current browser origin** + `/auth/callback`  
→ Works on `monadier.vercel.app`, `localhost`, and later `hypergain.io` without changing Vercel env.

## Still you (Google Cloud only)

[Google Cloud Console](https://console.cloud.google.com/) → OAuth Web client → **Authorized JavaScript origins** — **add** (do not remove existing):

```
https://hypergain.io
https://www.hypergain.io
https://app.hypergain.io
```

Keep existing:

```
https://monadier.vercel.app
http://localhost:5173
```

**Authorized redirect URI** (unchanged — Supabase only):

```
https://gbgafseabgqinnvlfslc.supabase.co/auth/v1/callback
```

## When hypergain.io DNS is live

1. Vercel: set `VITE_SITE_URL=https://hypergain.io`, `VITE_APP_URL=https://app.hypergain.io`, optional `VITE_SPLIT_DOMAINS=true`
2. Supabase Site URL → `https://hypergain.io` (redirect list already has it)
3. Redeploy

Until then: keep testing on **https://monadier.vercel.app/login** → Continue with Google.
