# Supabase setup (step by step)

Project ref: `gbgafseabgqinnvlfslc`

## 1. Local env

```bash
cp .env.example .env.local
```

Set in `.env.local`:

- `VITE_SUPABASE_URL=https://gbgafseabgqinnvlfslc.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — Supabase Dashboard → Settings → API → anon public

Restart Vite after changing env.

## 2. Link CLI and push migrations

```bash
supabase login
supabase link --project-ref gbgafseabgqinnvlfslc
supabase migration list    # compare local vs remote
supabase db push           # apply pending SQL
```

Critical migrations for dashboard2:

| Migration | Purpose |
|-----------|---------|
| `20260109130000_create_profiles_table.sql` | profiles + signup trigger |
| `20260112100000_onboarding_and_referrals.sql` | country, fixed trigger |
| `20260605100000_profile_avatars_storage.sql` | `avatars` storage bucket + RLS |
| `20260606120000_profiles_username.sql` | username + immutability + RPCs |
| `20260303120000_trade_history_deploy.sql` | closed trades / notifications source |
| `20260303120001_positions_rls_by_user.sql` | per-user positions |
| `20260605110000_positions_client_reconcile.sql` | stale position cleanup RPC |

## 3. Profile image upload (how it syncs)

Migration `20260605100000_profile_avatars_storage.sql` creates:

| Piece | Detail |
|-------|--------|
| **Bucket** | `avatars` (public read, 2 MB max, jpeg/png/webp/gif) |
| **File path** | `{your_user_id}/avatar.jpg` (one file per user, upsert on re-upload) |
| **Profile link** | `profiles.avatar_url` = public Supabase Storage URL + cache-bust query |
| **UI** | `ProfileAvatar` reads `profile.avatar_url` after `refreshProfile()` |

Flow when you click **Upload logo**:

1. Ensure `profiles` row exists for your auth user id  
2. Upload file to Storage → `avatars/{userId}/avatar.{ext}`  
3. `UPDATE profiles SET avatar_url = 'https://…/storage/v1/object/public/avatars/…'`  
4. Sidebar and profile modal re-render from refreshed profile  

**Until `supabase db push` creates the bucket, upload will fail** with a message pointing at this migration.

Remove photo: deletes files under `{userId}/` in the bucket and sets `avatar_url` to `null` (emoji shows again).

## 4. Verify from the app

```bash
npm run verify:supabase
```

Or open dashboard2 → Profile:

- Set **username** (once) → Save → header shows username
- Upload avatar → image appears in sidebar/header
- Email users: **Update password** shows success

## 5. Auth redirect URLs (Dashboard → Authentication → URL Configuration)

```
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
https://YOUR-PRODUCTION-DOMAIN/auth/callback
https://YOUR-PRODUCTION-DOMAIN/reset-password
```

## 6. Google OAuth users

Profile row is created on sign-in. If **username** is empty, open Profile and choose a username before saving other fields.

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Profile save does nothing | Run `supabase db push`; ensure `profiles` row exists (app calls `ensureUserProfile`) |
| Avatar upload fails “Bucket not found” | Apply `20260605100000_profile_avatars_storage.sql` |
| Username errors | Apply `20260606120000_profiles_username.sql` |
| Password update fails | Google-only accounts must use “Send reset link” |
| RPC `is_username_available` missing | Same username migration not applied on remote |
