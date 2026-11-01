# Supabase restore inventory

## What we still have (in git)

| Asset | Location | Count |
|-------|----------|-------|
| SQL migrations (full schema history) | `supabase/migrations/*.sql` | 134 files (~470 KB) |
| Edge Functions source | `supabase/functions/*` | 16 functions + `_shared` |
| Local config | `supabase/config.toml` | yes |
| Setup docs | `docs/SUPABASE_SETUP.md`, `docs/SUPABASE_AUTH_URLS.md` | yes |

## What we do **not** have

- Production **data** from the deleted project `gbgafseabgqinnvlfslc` (users, trades, wallets, history) — no dump/backup in this workspace
- Deployed Edge Function **binaries** on the old project (source is in git; must redeploy)
- `service_role` key (Dashboard → Settings → API only)

## Current live project

- Ref: `hnaldfvommthfgoryitt` (HyperGain, eu-central-1)
- Schema restored Nov 1 (incl. community, support, trade_flyers, followed traders, forex, HL betting)
- Edge functions live: `auth-lockout`, `request-password-reset`, `send-welcome-email`, `send-support-message`, `admin-set-password`
- Not yet redeployed (source in git only): Stripe / Forex / verify-trade helpers — deploy when those flows are needed

## Rebuild steps (clean project)

1. Create/link project
2. `supabase db push` (or apply all `supabase/migrations` in filename order)
3. Deploy each folder under `supabase/functions` (except `_shared`)
4. Auth URL config per `docs/SUPABASE_AUTH_URLS.md`
5. Put `service_role` on Railway as `SUPABASE_SERVICE_KEY`
