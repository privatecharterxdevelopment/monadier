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

- **Active target (Nov 1 evening):** `hathjgtvmgyxahqfhjka` — URL wired in app + Railway; **schema/edge functions still need apply** (MCP has no access to this project yet)
- Previous scratch project: `hnaldfvommthfgoryitt` (HyperGain) — schema was restored there; prefer migrating/re-applying onto `hathjgt…`
- Need on Railway: real `SUPABASE_SERVICE_KEY` (`service_role` / secret) for `hathjgt…`

## Rebuild steps (clean project)

1. Create/link project
2. `supabase db push` (or apply all `supabase/migrations` in filename order)
3. Deploy each folder under `supabase/functions` (except `_shared`)
4. Auth URL config per `docs/SUPABASE_AUTH_URLS.md`
5. Put `service_role` on Railway as `SUPABASE_SERVICE_KEY`
