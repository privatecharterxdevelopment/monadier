# Auth + vault — fix checklist (do in order)

## Part A — Why it feels chaotic

| What users think | What actually happens |
|------------------|------------------------|
| "My trades are in my wallet" | Trades are **GMX positions** held by **one vault contract**; your share is `balances[yourWallet]` inside that contract |
| "Login = my money" | Login = **Supabase account**. Money = **wallet you connect** + **vault deposit** |
| "Google should just work" | Needs **Supabase + Google Cloud + Vercel URLs** all matching — code alone is not enough |

This is **custodial pooled vault** (like a small exchange), not MetaMask self-custody per trade.

---

## Part B — Fix Google login (30–60 min)

### Step 1 — Supabase Dashboard

Project: `gbgafseabgqinnvlfslc` (Monadier)

1. **Authentication → Providers → Google** → Enable ON
2. Copy **Client ID** and **Client Secret** from Google (step 2)
3. **Authentication → URL Configuration**
   - **Site URL**: `https://monadier.vercel.app`
   - **Redirect URLs** (add all lines):

```
https://monadier.vercel.app/auth/callback
https://monadier.vercel.app/reset-password
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
```

### Step 2 — Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. OAuth 2.0 Client (Web application)
3. **Authorized JavaScript origins**:

```
https://monadier.vercel.app
http://localhost:5173
```

4. **Authorized redirect URIs** (Supabase callback, not your app):

```
https://gbgafseabgqinnvlfslc.supabase.co/auth/v1/callback
```

### Step 3 — Vercel env

```env
VITE_SUPABASE_URL=https://gbgafseabgqinnvlfslc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from Supabase → Settings → API>
VITE_SITE_URL=https://monadier.vercel.app
```

Redeploy frontend after changing env.

### Step 4 — Test

1. Open `/login` → **Continue with Google**
2. You should land on `/auth/callback` briefly, then `/dashboard`
3. If error: browser DevTools → Network → look for redirect URL mismatch

---

## Part C — Fix forgot password (20–40 min)

### Step 1 — Same Redirect URLs in Supabase

Must include:

```
https://YOUR-PRODUCTION-DOMAIN/auth/callback
http://localhost:5173/auth/callback
```

(Reset email links go to `/auth/callback` first, then app sends user to `/reset-password`.)

### Step 2 — Email delivery

**Authentication → Email Templates → Reset password**

- Confirm template is enabled
- For production: configure **custom SMTP** (Resend, SendGrid, etc.) under **Project Settings → Auth → SMTP**
- Supabase free tier email is rate-limited and often lands in spam

### Step 3 — Test flow

1. `/forgot-password` → enter email → "Check your email"
2. Click link in email → should hit `/auth/callback` → `/reset-password`
3. Set new password → redirect dashboard

### Step 4 — Email signup (if users can't log in after register)

**Authentication → Providers → Email** → check **Confirm email**

- If ON: users must click confirm link before `signInWithPassword` works
- Either turn OFF for beta, or show clear UI: "Check your email to activate account"

---

## Part D — Explain the vault to users (and yourself)

**One contract, many users — but separate balances**

```
┌─────────────────────────────────────┐
│  V11 Vault contract (one address)   │
│  USDC pool + GMX positions          │
│                                     │
│  balances[0xUserA] = $500           │
│  balances[0xUserB] = $200           │
└─────────────────────────────────────┘
```

- Users **deposit USDC** into the **same contract address**
- Contract accounting keeps **per-wallet balances** (not mixed at the UI level)
- **Risk**: smart contract bug, bot key, or insolvency affects the **whole pool** — this must be disclosed

**Not wrong for a small bot product — but it is NOT a normal bank account.**

---

## Part E — Make the app "normal" (priority order)

### Week 1 — Stop the bleeding

1. Fix auth (parts B + C above)
2. Deploy `auth/callback` route (code in repo)
3. Remove production "Demo Mode" bypass on dashboard (dev only now)
4. One page: **How your money works** (deposit, vault, withdraw, risks)

### Week 2 — Trust the data

5. Deploy `trade_history` OR delete references and use only `positions`
6. Never write fake P/L to DB
7. Admin page: vault health + stuck `closing` positions

### Week 3 — Scale you actually need

8. Paid Arbitrum RPC
9. Bot job queue (one close at a time per wallet)
10. Tighten RLS: users only see their `user_id` / wallets

**Target capacity:** tens to a few hundred active users — not millions. That is OK.

---

## Part F — If you want a truly "normal" product later

| Direction | Meaning |
|-----------|---------|
| **Keep vault** | Add clear legal copy, audits, limits, 2FA on login — still custodial |
| **Self-custody** | User signs each trade; bot only suggests — harder UX, less bot risk |
| **No pooled vault** | Each user sub-account on-chain — much more contract work |

Pick one story and align marketing + UI + code.
