# Railway deploy plan — opening optimization (`860de91`+)

**Do not deploy until the operator explicitly approves.** This is a checklist, not a trigger.

## SHAs

| Role | SHA | Notes |
|------|-----|--------|
| **Current production** | `9e605a3` | Live at last check. Rollback target. |
| **Opening + SL/trail** | `860de91` plus any follow-up location-validation commit | Contains `c534beb` (uPnL>0 profit SL) and `2e69c78` (capped stop-market + reconcile). Confirm with `git merge-base --is-ancestor 2e69c78 <deploy-sha>`. |

Service: `hypergain-bot` · root `bot-service` · health `GET /health`.

## Before flip

1. Record `GET /health` → `gitCommit`, `uptime`, `lastCycle`.
2. For every auto-trade wallet: `clearinghouseState` (open coins, size, entry) and `frontendOpenOrders` (profit SM + emergency SM). Screenshot or save JSON.
3. If any position is open: **do not cancel exchange stops**. Deploy only replaces the Node process; HL orders stay on the book.
4. Confirm env: `HL_REENTRY_COOLDOWN_MS` unset/0, no accidental `HL_OPEN_MAX_VOLUME_RANK=12`, `HL_MAX_LIQUID_SCAN` unset (default 40).

## Deploy

1. Push the approved SHA to the Railway git source (GitHub only if that is how Railway builds — this session does not push GitHub).
2. Wait for `GET /health` `status=healthy` and **new** `gitCommit`.
3. Health must stay fast (no I/O on `/health`).

## First 3 minutes — open positions

1. Logs: protective reconcile, `capped profit stop-market`, `emergency market SL posted`.
2. `frontendOpenOrders`: existing profit/emergency triggers **unchanged or tightened**, never loosened.
3. `blockNewEntriesUntilReconciled` clears per wallet.
4. Dashboard: confirmed stops only; no false CLOSED.
5. New entries may appear (40-coin scan). That is expected. Do **not** flatten existing size.

## First new open

1. Emergency SL without 2.5s delay.
2. First green uPnL → profit SM without 2.5s delay.
3. HTF location in logs (`entry_location_record`).
4. Same-coin 10m after a close; other coins may still open.

## Rollback

1. Redeploy **`9e605a3`**.
2. Do **not** cancel HL stops while size > 0.
3. Re-check `frontendOpenOrders` vs positions; restore missing emergency manually if needed.
4. Halt new entries (`HL_BOT_HALTED=true` or wait unreconciled) until stops match.

## If deploy lands mid-trade

The new process reconstructs trail from exchange orders (empty memory is OK). Worst case: a brief window with no in-memory trail until the first monitor cycle; exchange stops remain the floor.
