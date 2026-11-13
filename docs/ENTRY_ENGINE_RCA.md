# HyperGain Entry Engine — Root Cause Analysis (2026-11-13)

**Scope:** Scan → open gates → HL order. Production sampled at `115b18e` (Railway `/health`).  
**User wallet:** `0x1fbc…cd84`. **No deploy** until explicit approval.

---

## Executive summary

| Symptom | Root cause |
|--------|------------|
| USELESS/WLFI SHORT near support after red candle | `bypassScalpAlignWhenTrusted` + loose `shortBreakdownConfirmed` → `skipFloorVeto` on `pre_open_candles`; HTF quality allows SHORT when `shortBreakdownOk` without room check |
| BNB/BTC REVERSAL_LONG “green” but no fill | **Two pipelines:** UI MTF (`/api/signal`, 15m/1h scan) vs **open** gates (`scalp_align` live 1m/5m, `pre_open` 1m×20). Production blocks: `SCALP_1M_MISALIGN`, `PRE_OPEN_HIGH_REJECTIONS` (BTC LONG) |
| Analyze “all green” | `5m HOLD` still blocks; chips use scan snapshot, not live scalp gate |
| WLFI still open | Position **pre-ban**; prod `115b18e` has exclude + auto-flat in monitor — flat runs each cycle when agent on |
| `Stop —` in UI | Emergency SL UI when `emergencySlPx` null / reconcile pending — check `livePositions` on bot-status |

---

## Entry path (code map)

```
globalMarketScan.ts     → MTF scan, longClass / REVERSAL_LONG, isScanQueueable
hlTrading.ts tryOpen    → pick, cooldown, liquidity, openMarketPosition
openMarketPosition      → sequential gates (see below)
```

### Gate order in `openMarketPosition` (`hlTrading.ts` ~918–1310)

| Phase | Gate | SHORT bypass when `trustMtfScan` + `relaxSecondary` |
|-------|------|-----------------------------------------------------|
| SIGNAL | `signal_scan`, liquidity | — |
| RISK | `fresh_pump` | yes (`bypassFreshPumpWhenTrusted`) |
| STRUCTURE | `pre_open_candles` | no in bear profile (`bypassPreOpenWhenTrusted: false`) |
| STRUCTURE | `scalp_align` (1m+5m live) | **yes** (`bypassScalpAlignWhenTrusted: true`) ← Fall 1 |
| RISK | `macro_beta`, `pump_short`, `entry_momentum` | often yes on SHORT |
| LOCATION | `entry_location` (S/R) | no (`bypassSrLocationWhenTrusted: false`) |
| QUALITY | `entry_location_quality` | bypass only if `bypassEntryLocationWhenTrusted` (false for bear SHORT) |
| LONG | `REVERSAL_LONG` | **HTF location bypass** + momentum bypass; **scalp NOT bypassed** |

`relaxSecondary` = `shortRules.trustMtfScan && confidence >= minConf-4` (typical memes at 58%+).

### `pre_open_candles` — `skipFloorVeto` (`preOpenCandleAnalytics.ts` ~220)

When `isConfirmedShortBreakdown` is true, **PRE_OPEN_SHORTING_LOWS** and **PRE_OPEN_LOW_REJECTIONS** are skipped. Weak confirmation → shorts at range lows after a red spike.

### Production evidence (live `bot-status`, same wallet)

- `gitCommit`: **115b18e** (not `a758812`; `reentryCooldownMs` still **0** on prod).
- `openCoins`: `["WLFI"]` only (USELESS flat).
- `blockers`: `no HL perp passed global scan (min 62% conf, 3 TFs, 60% align)` — **zero queue candidates** at poll time.
- `recentOpenBlocks` (attempted opens, not scan):
  - `BTC` + `SCALP_1M_MISALIGN` — LONG needs 1m aligned (got HOLD).
  - `BTC` + `PRE_OPEN_HIGH_REJECTIONS` — LONG at range high.
  - Many SHORT blocks: `PRE_OPEN_VOLUME_FADE`, `PRE_OPEN_BULLISH_TAPE`, `LOCATION_SUPPORT`.

Scan % in UI ≠ order permission.

---

## Fall 1 — Bad SHORT entries (USELESS, WLFI)

**When opened:** Before/at ban commits; excluded coins now in `config.excludedCoins` (`a49d42e`+).

**Why gates failed:**

1. **Scalp align bypass** — bear profile `bypassScalpAlignWhenTrusted: true` skips live 1m/5m for “trusted” SHORT MTF → entries on lagging 15m/1h while 1m bounces at support.
2. **`skipFloorVeto`** — confirmed breakdown flag disables low-range pre-open blocks during pause at lows.
3. **`entry_location_quality`** — SHORT blocks for chasing lows only when `!shortBreakdownOk`; loose `isConfirmedShortBreakdown` clears quality.
4. **No unified final check** — gates run in sequence but bypass flags differ per direction/profile.

---

## Fall 2 — Good LONG not executing (BNB/BTC REVERSAL_LONG)

**Why UI looks openable:**

- `globalScan` / analyzer uses **cached MTF** and `queueable` REVERSAL_LONG reason strings.
- `TerminalChartAnalysisOverlay` warns on **5m ≠ action** but still paints other TFs green.

**Why server did not open (prod logs):**

- **BNB:** Scan candidate when MTF aligns; open never reached or failed later gate (margin, scalp) — no BNB block in last 12 `recentOpenBlocks` at sample time → likely **never picked** because `globalScan.candidates` empty (strict scan bars) while UI still shows **board** candidate from client rotation.
- **BTC LONG:** Explicit `SCALP_1M_MISALIGN` + `PRE_OPEN_HIGH_REJECTIONS` — **correct blocks** for counter-trend long at HTF high / 1m not LONG.

**REVERSAL_LONG** bypasses HTF location (`hlTrading.ts` ~1203) but **not** scalp — by design; UI should read **WAITING_CONFIRMATION** not “SIGNAL open”.

---

## WLFI ban vs open position

- Ban blocks **new** opens + monitor `isExcludedHlCoin` → `closeMarketPosition`.
- Existing WLFI opened **before** exclude landed or flat skipped one cycle → still in `openCoins` until flat succeeds.
- Prod has ban at `115b18e` (includes WLFI in excludes from `a49d42e` chain).

---

## Emergency SL UI (`Stop —`)

- `livePositions[].emergencySlConfirmed` / `emergencySlPx` from protective reconcile (`hlProtectiveReconcile.ts`).
- UI `formatLiveSlLine` shows `Stop —` when no confirmed exchange SL — not necessarily “no SL order”, may be pending/reconcile.

---

## Planned code fixes (this branch, not deployed)

1. **bear_market:** `bypassScalpAlignWhenTrusted: false` — always live 1m/5m at open.
2. **pre_open:** Tighten `skipFloorVeto` (require continued down-move, not pause at lows).
3. **entry_location_quality:** Block SHORT `INTO_SUPPORT` without confirmed breakdown.
4. **REVERSAL_LONG:** No HTF location bypass without `shortBreakdownOk`-equivalent structure pass for LONG floor (keep momentum bypass only).
5. **`entryDecisionTrace`:** Structured `SIGNAL → STRUCTURE → LOCATION → QUALITY → RISK → EXECUTION` on each attempt.
6. **UI:** Map `hlExecutionState` + diagnostic to SIGNAL / WAITING / BLOCKED / EXECUTING.

See tests: `entryEngineRegression.test.ts`, updated `openingGateConflict.test.ts`.
