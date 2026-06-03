# Monadier production runbook

## Architecture (client-facing)

| Component | Role |
|-----------|------|
| **V11 vault** `0x7dE97f35887b2623dCad2ebA68197f58F7607854` | Custodial USDC on Arbitrum; user `balances[wallet]` inside contract |
| **User wallet** | Signs deposit/withdraw only; never gives keys to Monadier |
| **bot-service** | Hot wallet = GMX keeper + `finalizeClose`; holds `BOT_PRIVATE_KEY` on server only |
| **Supabase** | Auth, subscriptions, position mirror, analytics |

Funds are **not** sent to the user’s MetaMask on every trade. Profit/loss is credited to **vault balance**; user withdraws USDC to their wallet when they choose.

## Security rules

1. **Never** commit `BOT_PRIVATE_KEY`, `SUPABASE_SERVICE_KEY`, or Stripe secret keys.
2. Frontend uses **anon** Supabase key only (`VITE_SUPABASE_ANON_KEY`).
3. Bot uses **service role** only on Railway/server.
4. Set `EXPECTED_BOT_ADDRESS` on bot to match the address authorized in the V11 contract.
5. Set `VITE_ADMIN_EMAILS` on Vercel (comma-separated); do not rely on hardcoded admin in UI.
6. Keep `ENABLE_DEMO_SIMULATOR=false` in production unless you intend demo-only DB trades.

## Deploy checklist

### Vercel (frontend)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_WALLETCONNECT_PROJECT_ID`
- `VITE_BOT_API_URL` → production bot URL
- `VITE_ADMIN_EMAILS` → admin emails

### Railway (bot-service)

- `BOT_PRIVATE_KEY` → must match contract `bot` address
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `TREASURY_ADDRESS`
- `ARBITRUM_VAULT_ADDRESS=0x7dE97f35887b2623dCad2ebA68197f58F7607854`
- `ARBITRUM_RPC_URL` (reliable provider)
- `EXPECTED_BOT_ADDRESS` (optional but recommended)
- `ENABLE_DEMO_SIMULATOR=false`

### After deploy

1. Bot logs must show **Production vault check** with correct vault + bot wallet.
2. If `isSolvent: false`, **stop auto-trading** until deficit is fixed.
3. Test: deposit small USDC → enable auto-trade → one open/close → verify `balances[user]` on Arbiscan → withdraw.

## Close / settlement behavior (bot)

1. Submit GMX decrease via vault.
2. Wait until GMX position `size == 0`.
3. Measure USDC returned to vault contract.
4. Call `finalizeClose` with that amount (capped by vault health).

This prevents phantom credits that caused TVL deficits.

### Open path

1. Vault `openPosition` tx confirmed.
2. Bot waits until GMX `size > 0` (keeper executed increase).
3. DB row created with GMX `averagePrice` and collateral (not Binance estimate).

### P/L display (monitoring)

Unrealized P/L uses **GMX** `getPosition` + mark price (same formula as V7 contract), not V11’s simplified `getPositionPnL`.

### Execution audit table

Apply migration `supabase/migrations/20260302000000_gmx_execution_requests.sql`.

Bot writes rows to `gmx_execution_requests` (`submitted` → `gmx_executed` → `vault_finalized`).

DB `positions.profit_loss` is updated **only** after `finalizeClose` / `reconcile` with measured USDC — never from user TP/SL settings.

## Legacy vaults

Older contracts (`0x712B…`, `0x9020…`, etc.) are **not** used by the live bot. Users with funds there use **Legacy withdraw** in the app only.
