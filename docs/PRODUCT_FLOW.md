# Monadier bot — product flow (how it works)

## End-to-end loop

1. User **logs in** (email or Google).
2. User **connects wallet** and links it in Settings.
3. User **deposits USDC** into the V11 vault on Arbitrum.
4. User enables **auto-trade** (on-chain + app settings).
5. **Bot (~every 30s)** scans users with auto-trade ON.
6. If no open position + cooldown passed + **signal OK** + optional **win rate gate OK** → **opens** one GMX trade.
7. **Bot (~every 10s)** monitors SL/TP, profit lock, user close requests.
8. On close: GMX settles → `finalizeClose` → **`balances[wallet]`** in vault increases/decreases.
9. Optional: **withdraw reminder** on dashboard (user signs withdraw to MetaMask).
10. After **~2 min cooldown**, bot may **open again** if a new signal appears.

## What settings control

| Setting | Effect |
|---------|--------|
| Auto-trade ON | Bot may open trades |
| Risk % | Collateral size per trade (% of vault balance) |
| Take profit / Stop loss | Levels sent to contract at open |
| Leverage | 1x–25x (50x elite) |
| **Min win rate %** (new) | Bot **skips new opens** if recent closed-trade win rate is below this (0 = off) |
| **Min trades for gate** (new) | Win rate rule applies only after N closed trades |
| **Withdraw reminder** (new) | Dashboard banner after a close — user taps to withdraw (not automatic) |

## What does NOT happen automatically

- Money does **not** go to MetaMask on close (stays in **vault balance**).
- Bot does **not** use “dashboard win rate” as a live setting — it uses **closed `positions`** in the database.
- **True auto-withdraw to wallet** would need a **new contract** (`withdraw` is only callable by the user today).

## Scale expectations

Designed for **tens to hundreds** of active traders on one bot instance — not millions of simultaneous users.
