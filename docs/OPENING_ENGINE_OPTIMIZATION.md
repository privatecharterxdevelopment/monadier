# Opening-engine analysis — no implementation

Date: 2026-11-11 (Asia/Dubai). **No gate code changed. No Railway deploy.**

Live Railway at audit time: `GET /health` `gitCommit=9e605a3`, `globalSignals=0`, `reentryCooldownMs=0`, profile `bear_market`. Workspace is later (`6f32293`) on SL/trailing only; the open path below is the restored 21 Jun engine.

**Verdict for this phase:** starvation is mostly **scan + unused profile + unused aggressive book**, not the 10-minute wallet cooldown. Bad fills are **chase / HTF location / missing same-coin anti-churn**, plus two major SHORT liquidations into a bounce.

---

## Live snapshot (production)

`GET /api/global-signals` (2026-11-11 ~14:41 UTC / 18:41 Dubai):

- Universe **18** coins (top 24h volume).
- **0** standard + **0** aggressive candidates (`scanComplete: true`).
- Last cycle: 1 bot processed, **skipped**, 0 succeeded.

Live MTF (`/api/signal`) at the same window: chop. Majors ~35–53% confidence, 50–75% alignment, mixed 1m/5m/15m/1h. ETH example: 1m/5m LONG, 15m SHORT, 1h HOLD/DOWN. That fails `isWeak` (`minDirectionalTfs=3`, `minTrendAlignment=60`, `minSignalConfidence=62`) **and** the scan 1h filter (LONG + h1 DOWN).

Public HL leaderboard (11 closes, one wallet):

| Coin | Side | PnL USD | Hold | Note |
|------|------|---------|------|------|
| BTC | SHORT | −31.59 | ~49m | LIQUIDATION |
| ETH | SHORT | −22.90 | ~49m | LIQUIDATION (same window) |
| BNB | LONG | −3.53 | ~2h | Only LONG; bear tape |
| HYPE | SHORT | −3.91 | ~1.5h | |
| SOL | SHORT | −0.36 | ~11h | Overnight |
| XRP | SHORT | +7.31 | ~10h | `manual` close |
| ASTER | SHORT | +1.11 | ~16m | Peak floor |
| SOL | SHORT | +1.17 | ~5m | Peak floor |
| UNI | SHORT | +0.75 | ~3m | Cautious alt |
| SKR | SHORT | +0.15 | ~3m | Not in today’s top-18 |
| SPX | SHORT | +0.18 | ~85s | Trail; not in today’s top-18 |

Wins are mostly tiny/fast alts. Losses concentrate on **majors SHORT into bounce** and **the one LONG**.

`hl_open_blocks` / `trade_history` were not queryable from this session (prod Supabase ref `hathjgt…` is not on the MCP account; HyperGain project INACTIVE). Block-log counts by gate are therefore **not** in this report.

---

## 14 tests: bug vs stale

| Test | File | Class | Why |
|------|------|--------|-----|
| drops thin alts under $1M | `globalMarketScan.borrow.test.ts` | **Stale + real drift** | Expects Standard to filter/borrow aggressive. Live `globalSignalsForBotMode` returns `scan.standard` only. Profile `$1M` is **not** applied (`minDayVolumeUsd` config default 0). |
| Standard queues liquid 94% aggressive SHORT | same | **Real unused feature** | `useAggressiveScalpSignals: true` on bear profile; function ignores it. |
| SHORT allowed 1h SIDEWAYS / blocked UP | same | **Stale export** | `h1AllowsShort` does not exist. Scan already drops SHORT on `/UP/i`. SIDEWAYS is allowed. |
| 6× `isScanQueueable` / `isOpenableLongCandidate` | `globalMarketScan.queueable.test.ts` | **Stale exports** | Functions not in live scan. `queueable` never set (`!== false` → UI always true). SHORT-primary queue is dead. |
| config floors ≥ 10m | `hlCoinCloseGuard.test.ts` | **Stale vs README; live 0 is intentional unless env set** | `reentryCooldownMs` default 0. Comment/README still say 10m floor. |
| blocks open 9m after last wallet close | same | **Not starvation** | Wallet cooldown off. Enabling it would **cut** opens further. |
| wallet-wide 10m blocks SHORT and TREND_LONG | same | **Unused guard** | `isOpenCooldownBlocked` not called from `hlTrading`. |
| REVERSAL_LONG waits wallet 10m if other coin closed | same | **Unused + unused REVERSAL_LONG** | Open always `longClass: 'NONE'`. |
| wallet-wide 10m blocks SHORT 3m after close | `shortPathRegression.test.ts` | same as above | |

Same-coin 10m **config exists** (`sameCoinReentryMinMs`) and **is not wired**. That is a real quality bug (85s SPX / 3m UNI / 3m SKR churn), not a stale test of wallet-wide pause.

---

## Pipeline today

SCAN `scanStandardCoin` / `scanAggressiveCoin` → QUEUE `globalSignalsForBotMode` (standard **or** aggressive, never merge) → PICK `pickBestSignalsPassingLiquidityGate` (rank ≤12, no cautious alts) → OPEN gates in `openMarketPosition` → `FrontendMarket` fill + emergency SL.

Open-time stack: news (cautious) → fresh pump → 20×1m candles → scalp 1m/5m + **3×1m** confirm → macro beta → pump-short (again) → momentum (5m/15m + **macro again**) → mega pair → 5m/15m location.

**Not called:** `isScanQueueable`, aggressive borrow, `classifyBearLongFromCandles` / REVERSAL_LONG, `isLongAllowedCoin`, `hlCoinCloseGuard`, `scoreEntryLocationQuality`, HTF S/R, profile `requiredH1Trend`.

---

## Prioritized causes

### P0 — Scan emits nothing in chop

**Functions:** `analyzeMarketMTFBySymbol` (`isWeak`), `scanStandardCoin`, `globalSignalsForBotMode`.

**Why few:** 3/4 TFs + 60% align + 62% conf + no 1h counter-trend. Live majors fail this every cycle in mixed tape. Aggressive book is computed then **thrown away** for `standard` users.

**Do not:** drop to “any 1m print”.

**Proposal:** (a) Merge aggressive SHORTs into Standard when MTF is empty **or** as lower-priority picks, still requiring 1h not UP + pump-short + location. (b) Use bear profile bars for SHORT: conf 58 / align 55 / 3 TFs, keep 1h-not-UP. (c) Persist scan-skip reasons (`weak`, `h1`, `pump_short`, `timeout`) per coin per cycle.

### P0 — Universe + cautious filter drop coins that actually worked

**Functions:** `fetchHlLiquidUniverse` (`HL_MAX_LIQUID_SCAN=18`), `pickBestSignalsPassingLiquidityGate` (`maxVolumeRank=12`, `allowCautiousAlts=false`), `needsCautionPath`.

**Why few:** Profile wants **no rank cap** and **$1M** floor. Live uses top-18 then top-12 and bans cautious (UNI, SUI, ENA, WIF, …). Leaderboard winners **SPX / SKR / ASTER** are not in the current 18; **UNI SHORT +$0.75** would be skipped as cautious.

**Proposal:** Honor profile: `maxVolumeRank=0`, `minDayVolumeUsd=1_000_000`, scan cap 40 (already `minTradableUniverse`). Allow cautious **SHORT only** after pump-short + location (not blanket LONG memes).

### P0 — Triple LTF confirm = late chase (bad location)

**Functions:** `validateScalpAlignment` (3×1m), `validateEntryMomentum` (2×5m green + 5m/15m move), `validatePreOpenCandleAnalytics` (20×1m).

**Why bad:** Opens only after the move is already underway. Combined with location on ~4–6h 5m/15m (and **skip if thin candles**), HTF chase is unfiltered. `entryLocationQuality` (1h/4h ATR room) is unused.

**Proposal:** Keep 1m **and** 5m direction agree. Cut 1m confirm from 3 → 1 closed bar. Keep 20-candle as **structure/range** (already blocks shorting lows / chasing highs on 1m). Add `scoreEntryLocationQuality` as hard block for 1h/4h chase. Do not disable location.

### P1 — Pump-short + 1h filter duplicated; kills valid dump continuation

**Functions:** `validateNoAltPumpShort` at **scan and open**; scan 1h UP drop; momentum `maxCounter1hPct`.

**Why few:** Alt SHORT needs 15m fade **and** 15m or 1h SHORT **and** not 2/3 HTF LONG. Dump continuation that is 1h SIDEWAYS + 5m dump often dies on `15m not rolling over`. BTC/ETH skip this gate — and those were the **liquidation** shorts.

**Proposal:** Run pump-short **once** at open (not silent scan drop). For majors, require `entryLocationQuality` + macro instead of skipping pump-short with no HTF location. Optional: allow alt SHORT on 1h SIDEWAYS + 5m dump continuation (`isShortDumpContinuation`) without 15m already deeply red.

### P1 — Same-coin anti-churn unwired

**Functions:** `hlCoinCloseGuard.evaluateBlock` exists; `hlTrading` only checks wallet `reentryCooldownMs` when **zero** positions, default 0.

**Why bad:** 85s–3m reopens. **Not** why the book is empty.

**Proposal:** Wire **same-coin** 10m + anti-flip 10m. Leave wallet-wide cooldown **off** (or opt-in env). Rewrite wallet-10m tests to match, or mark them as documenting a rejected product rule.

### P1 — Bear LONG path is unclassified

**Functions:** `isLongAllowedCoin` unused; `bearReversalLong` unused; open `longClass: 'NONE'`.

**Why bad:** BNB LONG −$3.53. Profile wants allowlist + LONG at support, REVERSAL_LONG as reclaim exception.

**Proposal:** Block LONG unless allowlist **and** (`TREND_LONG` with 1h UP + lower-range location **or** confirmed `REVERSAL_LONG`). Do not queue relief LONGs over a live SHORT thesis.

### P1 — Macro / mega stacked, fail-closed

**Functions:** `validateMacroBetaAlignment`, again inside `validateEntryMomentum`, `validateMegaPairVolumeForDirection`.

**Why few:** Alts fail-closed on fetch errors; mega INFLOW blocks all SHORTs. Good for pump fades, bad when BTC is flat-chop.

**Proposal:** Keep macro as **one** gate. Mega: block only if flow **and** coin is not already aligned with that flow on 15m (avoid double veto). Never fail-closed on BTC/ETH themselves (already SELF).

### P2 — No durable candidate/block funnel

**Functions:** `recordHlOpenBlock` (5m debounce), scan skips are `logger.debug` only.

**Why we cannot replay:** Empty board never writes blocks. Historical “blocked by X” is missing.

**Proposal:** Table or log `hl_scan_skips` + always record pick-level skips (`cautious`, `rank`, `liquidity`) with the same debounce.

---

## What not to do

- Do not enable wallet-wide 10m as the “fix” for too few trades.
- Do not set `minDirectionalTfs=1` or conf 25.
- Do not raise leverage or size; keep max 2 slots.
- Do not touch Emergency-SL / profit trail.
- Do not `positionTpsl` grouping.
- Do not open Railway.

---

## Suggested implementation order (for the next decision)

1. Scan telemetry + aggressive SHORT borrow into empty Standard book (quality-gated).
2. Universe: scan 40 / no rank cap / $1M floor; cautious SHORT-only with pump+location.
3. Location quality HTF + reduce 1m confirm 3→1.
4. Same-coin 10m anti-churn.
5. Bear LONG classifier + allowlist.
6. Deduplicate pump-short/macro; dump-continuation exception.

Each change should ship with: replay of the 11 leaderboard names (would UNI/ASTER/SPX scan? would BTC/ETH SHORT still pass location+macro?), plus the existing 14 tests updated **only** for the product rules we actually adopt.
