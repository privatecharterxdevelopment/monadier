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

## Google login (OAuth)

1. [Google Cloud Console](https://console.cloud.google.com/) → Credentials → OAuth Web client  
2. **Authorized JavaScript origins** (add all):

```
https://hypergain.io
https://www.hypergain.io
https://app.hypergain.io
https://monadier.vercel.app
http://localhost:5173
```

3. **Authorized redirect URI** (Supabase only — do not add hypergain paths here):

```
https://gbgafseabgqinnvlfslc.supabase.co/auth/v1/callback
```

4. Paste Client ID + Secret → Supabase → Authentication → Providers → Google → Enable

## Admin panel hardening

- Path: `/28858885` (override `VITE_ADMIN_PATH`) — **not** linked in UI; `/admin` → home
- Google Authenticator (TOTP MFA) required after admin email sign-in
- IP lockout: 2 failed admin-email password attempts **or** secret-path probes → 24h block (`auth-lockout` edge function)
- `robots.txt` disallows `/admin` and `/28858885`

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
