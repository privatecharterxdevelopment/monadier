# HyperGain — Final production readiness audit

Date: 2026-11-11 (Asia/Dubai). **No live deploy was performed.** Opening gates were not changed.

**Verdict: NO-GO for live capital.**

The protective engine matches the Hyperliquid `/exchange` trigger wire, SDK `OrderRequest` schema, and official trigger/`tpsl` docs. Restart, dual-wallet, throttle, and gap-unfilled *state* are covered by tests. What is still missing is a **signed Hyperliquid fill** of the capped reduce-only stop-market. A local fill model plus unsigned schema validation is not that proof.

Full suite: **125 tests, 111 pass, 14 fail.** The 14 failures are the same Opening/Cooldown set as before this audit. The new `hlProductionReadiness.test.ts` file added 7 passing tests and **0 new failures**.

---

## 1. Hyperliquid order semantics

### What we actually post

Profit SL is a reduce-only **trigger** order, grouping `na` (so it can coexist with Emergency SL; `positionTpsl` would clobber it):

| Field | Value |
|-------|--------|
| `r` | `true` (reduce-only) |
| `b` | `true` for SHORT close (buy), `false` for LONG close (sell) |
| `t.trigger.isMarket` | `true` |
| `t.trigger.tpsl` | `'sl'` (retrace / stop, not take-profit) |
| `t.trigger.triggerPx` | trail stop on the **profit side of entry** |
| `p` | slippage **cap** on the profit side of entry (one tick toward profit from entry), **not** HL’s default ~10% market band |
| `grouping` | `'na'` |

Emergency SL is the same shape with `p = triggerPx` on the **loss** side of entry.

Sources checked against the live stack:

- Official Exchange action: `orders[].t.trigger.{isMarket,triggerPx,tpsl}` and `grouping: na | normalTpsl | positionTpsl` ([Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)).
- Official order types: Stop Market / Stop Limit; Reduce Only; TP/SL “automatically market” with an optional limit price ([Order types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)).
- Live `POST https://api.hyperliquid.xyz/info` `{type:"meta"}` — universe loads (BTC szDecimals used in the wire test).
- `@nktkas/hyperliquid` `OrderRequest` valibot parse of the exact profit leg we would sign.

### Trigger

HL activates TP/SL off **mark**. We refuse to post when the trigger is glued to mark (`profitStopPlaceable` / min gap ≈ `max(tick, 0.04% of mark)`). That maps to HL rejecting an immediate trigger.

### IOC / “market” behaviour

There is no true unpriced market on HL perps. `isMarket: true` turns the trigger into an IOC-style market **bounded by `p`**. If the print is through the cap, the child order does not fill. The trigger is typically **consumed** (it is no longer on `frontendOpenOrders`). That is the gap case in §2.

### Cap

`profitStopMarketCapPx` clamps `p` to the profit side of **entry**, not 10% through the book. A gap that stays profit-side of entry can fill; a gap through entry (SOL-incident style) is classified `unfilled` / `would_realize_loss` and is **not** accepted by the cap.

### Rejections

Post path reads `statuses[0].error` and retries up to 3 times. `waitingForTrigger` / `resting.oid` are treated as accepted. Immediate-trigger and unsafe-side posts are refused **before** sign.

### What this is not

No signed `POST /exchange` was sent. Dummy signature only validates the **schema**. Fill, queue position, and rejection strings from a live matching engine were not observed.

---

## 2. Gap: trigger fires, cap does not fill

Simulated SHORT: entry `86.45`, trigger `86.32`, cap = entry − 1 tick, print just **worse than cap** but still **better than entry**.

Observed:

- Local fill model: `unfilled` (capped SM). Uncapped 10% market would still fill.
- Remaining open orders: **Emergency SL only**.
- UI line: `Emergency-SL … (HL confirmed) · Profit-SL PENDING` — not `CLOSED` / `PROFIT_SECURED`.
- `getHlExecutionState` is not `POSITION_CLOSED`.
- `evaluateDynamicTrail`: `shouldClose = false`, `closeDetail = PROFIT_SL_PENDING`.
- Reconcile: `emergencyMissing = false`, `reconstructedProfitPx = null`, **no** immediate re-post (`postProfit = null`) because the same trigger is no longer placeable vs mark (would be an immediate trigger).

**Retry:** next cycles keep monitoring. A new profit SM is posted only when a trigger is again placeable (mark pulls back enough for the min gap, still profit-side of entry). Until then the position is protected **only** by Emergency SL.

**Residual risk:** if HL consumes the trigger on a miss and mark stays in the tiny band between cap and entry, profit protection is off until the mark moves. That is the intended cap vs SOL-incident tradeoff, not a false close.

---

## 3. Restart (empty in-memory, confirmed Profit-SL on the book)

`reconcileProtectiveFromSnapshot` + `seedTrailFromConfirmedProfitStop` with empty Maps:

- Exchange profit trigger (e.g. `86.30`) is the ratchet **floor**.
- A looser desired stop is merged with `ratchetStop` — never loosened.
- Missing Emergency SL is restored first; `blockNewEntriesUntilReconciled` stays true until `frontendOpenOrders` is readable and emergency is back.
- Disk `data/hl-profit-trail-state.json` is not required.

---

## 4. Multi-user

Two wallets, same coin, simultaneous profit trail:

| Wallet | Emergency SL% | Emergency px (SHORT 86.45) | Profit floor |
|--------|----------------|----------------------------|--------------|
| A | 15% | farther from entry | `86.28` |
| B | 5% | closer to entry | `86.31` |

Keys are `wallet:coin`. Floors and emergency percents do not leak across wallets. `lastConfirmedProfitStopPx` is per address.

---

## 5. Full suite — 14 existing Opening/Cooldown failures

**125 / 111 / 14.** No new failures from this patch.

Opening gates were **not** changed (per instruction). These tests describe an older Standard-borrow / 10-minute-wallet-cooldown contract that the current engine does not implement.

### Opening — `globalMarketScan.borrow.test.ts`

| Test | Cause |
|------|--------|
| `drops thin alts under the $1M open floor so they cannot occupy the slot` | `globalSignalsForBotMode` returns `scan.standard` only. No $1M volume filter, no drop of thin aggressive alts. |
| `Standard queues a liquid 94% aggressive SHORT when MTF is empty` | Standard does **not** borrow `scan.aggressive`. Empty MTF → empty signals. |
| `SHORT is allowed on 1h SIDEWAYS and blocked on 1h UP` | `h1AllowsShort` is **not exported** (and not defined) from `globalMarketScan.ts` → `TypeError`. |

### Opening — `globalMarketScan.queueable.test.ts`

All six fail because `isScanQueueable` and `isOpenableLongCandidate` are **not exported** (`TypeError`):

1. `always queues the SHORT-primary print`
2. `queues a lone LONG that the MTF pick already chose`
3. `queues a strong lone LONG with 1h UP`
4. `queues a LONG that beat a real SHORT`
5. `does not queue a relief/dump LONG over a live SHORT`
6. `queues confirmed REVERSAL_LONG`

### Cooldown — `HL_REENTRY_COOLDOWN_MS` defaults to **0**

`config.hyperliquid.reentryCooldownMs = Number(process.env.HL_REENTRY_COOLDOWN_MS \|\| 0)` while `sameCoinReentryMinMs` / `blockOppositeSameCoinMs` still floor at 10 minutes. Tests expect a **wallet-wide** 10-minute block after any close.

| File | Test | Cause |
|------|------|--------|
| `hlCoinCloseGuard.test.ts` | `config floors are at least 10 minutes` | `reentryCooldownMs` is 0, not ≥ 10m. |
| `hlCoinCloseGuard.test.ts` | `blocks a new open 9 minutes after the last wallet close` | Wallet-wide wait is off (`evaluateWalletReentry` not blocked). |
| `hlCoinCloseGuard.test.ts` | `wallet-wide 10m still blocks SHORT and TREND_LONG after any close` | Wallet guard does not fire; same-coin 10m still can. |
| `hlCoinCloseGuard.test.ts` | `REVERSAL_LONG on BTC still waits wallet 10m if last close was another coin` | Wallet-wide cooldown is 0. |
| `shortPathRegression.test.ts` | `wallet-wide 10m still blocks a SHORT 3m after any close` | Same: `reentryCooldownMs === 0`. |

README still claims a 10-minute wallet wait. That is documentation drift, not a new regression.

---

## 6. Monitoring — 2.5 s throttle

Two layers, both **bypass** first profit placement and missing emergency:

1. **`shouldDeferTrailSync`** (`SYNC_EVERY_MS = 2500`): returns `false` when `firstProfitPlacement`, `emergencyMissing`, or `upgradeLimitToMarket`. Repeat trail replaces only after 2.5 s.
2. **`hlTrading` wrapper** (`>= 2400` ms): `firstProfitDue = pnl > 0 && liveStops.profitPx == null`, `emergencyDue = slPct > 0 && liveStops.emergencyPx == null`. Those two skip the 2.4 s gate and do **not** stamp `lastProtectSyncAt`, so the next cycle retries immediately.

Emergency is posted **before** profit in `syncHlProfitStopOrder`. Cancel failure clears `postProfit` but still attempts emergency.

---

## 7. Railway deploy / rollback checklist

**Do not deploy until the verdict is GO.** This list is for the first **explicit** go-ahead.

Service: `hypergain-bot` · root `bot-service` · health `GET /health` · public `https://hypergain-bot-production.up.railway.app`

### Before deploy

- [ ] User has explicitly approved Railway (and GitHub, if that remote is the Railway source). This audit did **not** push GitHub and did **not** deploy.
- [ ] Record current production `gitCommit` from `GET /health`.
- [ ] Snapshot open positions + `frontendOpenOrders` per live wallet (`info` `clearinghouseState` + `frontendOpenOrders`).
- [ ] Confirm `BOT_PRIVATE_KEY`, `HL_AGENT_MASTER_SECRET`, `SUPABASE_*` unchanged.
- [ ] Optional: set `HL_REENTRY_COOLDOWN_MS` only if you want the wallet-wide 10m the tests expect (opening-gate change — out of scope here).

### Deploy

- [ ] Deploy **only** the approved SHA (origin commit of this audit).
- [ ] Wait for Railway health: `GET /health` → `status: "healthy"`, new `gitCommit`, fast response (handler is sync; do not put I/O on `/health`).
- [ ] `GET /api/health-detail` for Supabase / Twitter extras (not the probe).
- [ ] Confirm `policy.botHalted` is the intended value.

### Reconciliation (first 2–3 minutes)

- [ ] Logs: `HL protective` / `emergency market SL posted` / `capped profit stop-market posted`.
- [ ] No `frontendOpenOrders unreachable` looping.
- [ ] Wallets with open size: `blockNewEntriesUntilReconciled` clears (`ok`).
- [ ] **No new entries** until reconcile ok.
- [ ] In-memory trail empty is fine; exchange profit trigger must remain the floor (never a looser replace).

### Order verification (HL UI or `frontendOpenOrders`)

For each open position:

- [ ] Two reduce-only triggers, grouping not `positionTpsl`.
- [ ] Emergency: `isMarket true`, trigger on **loss** side of entry, size ≈ position.
- [ ] Profit: `isMarket true`, trigger on **profit** side, `p` (limit/cap) still profit-side of entry (not 10% through).
- [ ] Status `waitingForTrigger` (not immediate fill, not `{error}`).
- [ ] Dashboard: Emergency-SL and Profit-SL only when **HL confirmed**; otherwise PENDING — never CLOSED while size > 0.

### First live position (smallest size)

- [ ] Open or use an existing small position.
- [ ] Emergency appears **without** waiting 2.5 s.
- [ ] First green print: Profit SM appears **without** waiting 2.5 s.
- [ ] Trail updates after that are ≥ ~2.5 s and **never loosen**.
- [ ] If a gap prints through the cap: size remains, Emergency remains, UI = PENDING, not PROFIT_SECURED. Re-place only when placeable.
- [ ] After a real fill: size 0, both triggers gone, close notified, no leftover reduce-only.

### Rollback (any of: health fail, missing emergency, loosened profit, false CLOSED, unfilled gap left naked)

1. Railway → previous known-good deployment (recorded `gitCommit`).
2. Do **not** cancel exchange stops from the dashboard while size is open.
3. Re-check `frontendOpenOrders`; manually restore Emergency SM if missing.
4. Halt new entries (`botHalted` or keep unreconciled block) until stops match positions.
5. Re-run `./scripts/verify-bot-api.sh <url>` and compare `gitCommit`.

---

## GO / NO-GO and remaining risks

| Item | Status |
|------|--------|
| Wire + SDK schema + official trigger docs | Pass |
| Gap-unfilled state / Emergency / no false CLOSED | Pass (sim) |
| Restart ratchet from exchange | Pass (sim) |
| Multi-wallet isolation | Pass (sim) |
| 2.5 s throttle bypass | Pass |
| Signed live/testnet fill of capped profit SM | **Missing** |
| Opening/Cooldown 14 red tests | Known, unchanged |
| Wallet-wide 10m vs `HL_REENTRY_COOLDOWN_MS=0` | Drift vs README |

**NO-GO** for production live size until at least one signed Hyperliquid (testnet or tiny mainnet) profit stop-market is observed: trigger → IOC child → fill **or** explicit unfilled-with-cap, with Emergency remaining.

Flip to **GO** only after that fill log plus the Railway checklist on the first live wallet.

Other residual risks even after a fill:

1. **Cap miss** leaves a green position with only Emergency SL until mark is placeable again.
2. **`positionTpsl` must never be used** for profit; a future grouping regression would delete Emergency.
3. **Cancel-then-post** window: if cancel of an old profit order succeeds and the new post fails, profit is briefly absent (Emergency should still be there).
4. **Reconcile depends on `frontendOpenOrders`.** If info is down, new entries stay blocked; existing size is only as safe as stops already on the book.
5. Opening-gate tests and README cooldown text do not match current config — unrelated to SL, but operators should not assume a 10-minute wallet pause unless `HL_REENTRY_COOLDOWN_MS` is set.
