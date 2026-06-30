# Supabase auth URLs (password reset, email confirm, Google)

If reset emails open **localhost**, fix **both** the app (VITE_SITE_URL) and Supabase dashboard.

## 1. Vercel production env

```env
VITE_SITE_URL=https://monadier.vercel.app
VITE_APP_URL=https://monadier.vercel.app
```

(Or `https://www.monadier.io` / `https://app.monadier.io` when custom domains are live.)

Redeploy frontend after changing env.

## 2. Supabase → Authentication → URL Configuration

**Site URL** (must NOT be localhost in production):

```
https://monadier.vercel.app
```

**Redirect URLs** — add every host users can land on:

```
https://monadier.vercel.app/reset-password
https://monadier.vercel.app/auth/callback
https://app.monadier.io/reset-password
https://app.monadier.io/auth/callback
https://www.monadier.io/reset-password
https://www.monadier.io/auth/callback
http://localhost:5173/reset-password
http://localhost:5173/auth/callback
```

## 3. Email template

**Authentication → Email Templates → Reset password**

Link should use `{{ .ConfirmationURL }}` (default). Do not hardcode `{{ .SiteURL }}` alone.

## 4. Test

1. Open **production** `/forgot-password` (not localhost).
2. Request reset → new email.
3. Link should start with `https://monadier.vercel.app/reset-password` or your production domain — never `localhost`.
