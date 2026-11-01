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

- **Active target:** `hathjgtvmgyxahqfhjka` (ap-southeast-2) — schema applied via `psql`
- **Parity vs prior HyperGain DB:** 52/52 public tables identical; all prior RPCs present (+5 extras)
- **Auto-trade path verified:** bot reads `vault_settings.auto_trade_enabled=true` → `activeBots` increments (test row)
- Railway: `service_role` JWT set; trade-close emails need `RESEND_API_KEY` on Railway
- Edge functions (welcome / password-reset / support): source in `supabase/functions` — deploy needs `SUPABASE_ACCESS_TOKEN` + same `RESEND_API_KEY` as function secrets

## Rebuild steps (clean project)

1. Create/link project
2. `supabase db push` (or apply all `supabase/migrations` in filename order)
3. Deploy each folder under `supabase/functions` (except `_shared`)
4. Auth URL config per `docs/SUPABASE_AUTH_URLS.md`
5. Put `service_role` on Railway as `SUPABASE_SERVICE_KEY`
