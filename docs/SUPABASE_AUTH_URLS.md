# Supabase auth URLs — HyperGain

**Site URL (canonical):** `https://hypergain.io`

Redirect URLs are **additive** — old hosts keep working for testing.

## Production (project `gbgafseabgqinnvlfslc`)

**Site URL:** `https://hypergain.io`

**Redirect URLs (all allowed):**

```
https://hypergain.io/auth/callback
https://hypergain.io/reset-password
https://www.hypergain.io/auth/callback
https://www.hypergain.io/reset-password
https://app.hypergain.io/auth/callback
https://app.hypergain.io/reset-password
https://monadier.vercel.app/auth/callback
https://monadier.vercel.app/reset-password
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
```

Google provider Client ID/Secret live only in the Supabase Dashboard (do not push via `config.toml`).

## App behavior

OAuth `redirectTo` = **current browser origin** + `/auth/callback`  
→ Works on `www.hypergain.io`, `hypergain.io`, `app.hypergain.io`, `monadier.vercel.app`, and `localhost`.

## Google Cloud — Authorized JavaScript origins

[Google Cloud Console](https://console.cloud.google.com/) → OAuth Web client → **add** (do not remove existing):

```
https://hypergain.io
https://www.hypergain.io
https://app.hypergain.io
https://monadier.vercel.app
http://localhost:5173
```

**Authorized redirect URI** (unchanged — Supabase only):

```
https://gbgafseabgqinnvlfslc.supabase.co/auth/v1/callback
```

## Vercel env (production)

| Name | Value |
|------|--------|
| `VITE_SITE_URL` | `https://hypergain.io` |
| `VITE_APP_URL` | `https://app.hypergain.io` |
| `VITE_SPLIT_DOMAINS` | `false` until `app.hypergain.io` DNS is live, then `true` |

## Cloudflare DNS for `app.hypergain.io`

One CNAME (DNS only / grey cloud — proxy off):

| Type | Name | Target |
|------|------|--------|
| CNAME | `app` | `df5efc46150c433d.vercel-dns-016.com` |

Then: `vercel domains verify app.hypergain.io` → set `VITE_SPLIT_DOMAINS=true` → redeploy.
