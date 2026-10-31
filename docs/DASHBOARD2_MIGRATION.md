# Dashboard2 migration checklist

Dashboard2 (`/dashboard2`) is the primary trading terminal. Legacy `/dashboard/*` remains for gradual retirement.

## Phase 1 — UI parity (shipped to `main` 2026-06-04)

| Area | Status | Notes |
|------|--------|-------|
| Layout / white terminal theme | Done | `dashboard2-nixole.css`, `Dashboard2Layout` |
| Trade panel (Bot / LVRG / Funds) | Done | `TerminalTradePanel`, `TerminalLvrgPanel` |
| Header stats | Done | Wallet, vault, in trade, portfolio, profit |
| History + close in-app | Done | `TerminalPositionsDock` — multi-wallet, live P/L, `closing` flow |
| Profile (no Plans) | Done | Popup modal — emoji or uploaded logo, name, country, wallets, password |
| Plans / subscriptions in D2 | Skipped | Not part of product direction |
| Redirect `/dashboard` → `/dashboard2` | Done | `App.tsx` |

### Supabase (remote `gbgafseabgqinnvlfslc`)

**Do not delete the production database** unless you intentionally want to wipe all users, positions, vault settings, and trade history.

- **Normal path:** `supabase db push` — applies only migrations not yet on remote (2026-06-03/04 batch was pushed: avatar_emoji, leverage 100x, positions user close RLS).
- **Fresh local dev only:** `supabase start` + `supabase db reset` (requires Docker) replays all files in `supabase/migrations/` in order.
- **Skipped file:** `create_forex_licenses.sql` is not in the migration chain (rename to `YYYYMMDDHHMMSS_forex_licenses.sql` if you need it on a new project).

```bash
cd /path/to/monadier
supabase link --project-ref gbgafseabgqinnvlfslc   # once
supabase migration list                            # local vs remote
supabase db push                                   # apply pending
```

### Deploy after Phase 1 code

1. ~~Supabase migrations above~~ — done on remote when `db push` succeeds.
2. Deploy bot-service with `exit_tx_hash` fix in `positionSettlement.ts`.
3. Deploy frontend (Vercel) so `/dashboard2/profile` and history dock are live.

## Phase 2 — Vault / bot hardening

| Item | Status |
|------|--------|
| LVRG / bot settings on-chain `setSettings` | Done | `persistVaultSettings()` — LVRG panel + bot settings modal |
| Stop bot closes open positions | Done | `markAllOpenPositionsClosing` on stop |
| Single vault redeploy + user migration comms | Planned |
| `positions` ↔ chain reconciliation | Done | Bot every 5m + client hook on dashboard2; RLS `client_reconciled` |

## Close position flows

1. **Preferred (dashboard2):** User → `status: closing` in Supabase → bot settles → `closed` + `exit_tx_hash`.
2. **Fallback:** On-chain `userInstantClose` / `reconcile` when no DB row (trade panel only).

## Files map

- Main trade: `src/pages/dashboard/Dashboard2Page.tsx`
- Profile popup: `src/components/terminal/TerminalProfileModal.tsx`
- Vault sync: `src/lib/syncVaultSettings.ts`
- Sidebar: `src/components/dashboard2/Dashboard2Sidebar.tsx`
- History dock: `src/components/terminal/TerminalPositionsDock.tsx`
- Close helpers: `src/lib/positionClose.ts`, `src/lib/positionLivePnl.ts`, `src/lib/userWallets.ts`

## Profile sync

- Single source of truth: Supabase `profiles` row (`id` = `auth.users.id`).
- Trade header + **Profile popup** (`TerminalProfileModal`) use `useAuth().profile`.
- Avatar: `avatar_url` (uploaded logo in Storage bucket `avatars`) or fallback `avatar_emoji`.
- Open profile: sidebar **Profile** or click avatar in header.
- After save/upload, `refreshProfile()` updates greeting + avatar immediately.
- `/dashboard/profile` and `/dashboard2/profile` redirect to `/dashboard2` (modal only).

## Phase 3 — Remove dashboard1 (after D2 sign-off)

When dashboard2 is fully validated in production:

1. Delete `src/pages/DashboardPage.tsx` and legacy dashboard shell components no longer referenced.
2. Remove `/dashboard/*` routes from `App.tsx` (keep only `/dashboard` → `/dashboard2` redirect if needed for bookmarks).
3. Remove glass-theme CSS only used by dashboard1.
4. Update marketing links that still point to `/dashboard/bot-trading`, etc.

## Legacy routes (do not extend)

- `/dashboard/bot-trading` — use dashboard2 history dock
- `/dashboard/profile` — use `/dashboard2/profile`
- `/dashboard/subscriptions` — Plans; not migrated to D2
