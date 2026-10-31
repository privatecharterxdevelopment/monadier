# Supabase auth URLs — HyperGain

**Site URL (canonical):** `https://www.hypergain.io`

## Production (project `gbgafseabgqinnvlfslc`)

**Site URL:** `https://www.hypergain.io`

**Redirect URLs (all allowed):**

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

Google provider Client ID/Secret live only in the Supabase Dashboard (do not push via `config.toml`).

## App behavior

OAuth `redirectTo` = **current browser origin** + `/auth/callback`  
→ Works on `www.hypergain.io`, `hypergain.io`, `app.hypergain.io`, and `localhost`.

## Google login (OAuth)

1. [Google Cloud Console](https://console.cloud.google.com/) → Credentials → OAuth Web client  
2. **Authorized JavaScript origins** (add all):

```
https://hypergain.io
https://www.hypergain.io
https://app.hypergain.io
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

Remove any leftover `monadier.vercel.app` entries from Supabase Redirect URLs and Google JS origins.
