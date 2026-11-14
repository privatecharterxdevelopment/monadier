# SHORT Entry Quality — Replay & Order-Path Validation

**Branch:** `cursor/regime-deploy-87df264-42a8` (nach `6d3b1cf` + Pre-Submit)  
**Wallet:** `0x1fBc2A0Ab6a8fA5F6B9645392433483b25a8Cd84`  
**Erzeugt:** 14.11.2026 ~13:52 Dubai (UTC `2026-11-14T09:52:05Z`)  
**Kerzen:** Hyperliquid `candleSnapshot`, nur **geschlossene** Bars bis Fill-Zeit (kein Lookahead)  
**Vollständige Rohdaten:** `docs/SHORT_ENTRY_QUALITY_REPLAY.json`

Holdout für manuelle Fälle: **XRP, ETH**. Kennzahlen unten nur aus dem **Validierungsdatensatz** (104 Events, 128 SHORT-Opens gesamt).

---

## 1) XRP SHORT — 14.11.2026, **11:19:02 Dubai** (User Fill)

| Feld | Wert |
|------|------|
| HL `userFills` Zeit | `2026-11-14T07:19:02.660Z` |
| Entry (VWAP) | **0.98602** |
| **PASS/BLOCK** | **BLOCK** |
| **Code** | `SHORT_EXTENDED_DUMP` |
| Entry-Typ | `NONE` |
| Dump-Extension | **0.29×ATR** |
| Support-Abstand | **13.70×ATR** |
| Resistance-Abstand | **8.97×ATR** |
| Reversal-Score | **28** (u. a. RSI-Divergenz 15m, kein Hard-Veto) |
| 1h / 15m Range-Pos | **16%** / **31%** (Floor-Tag) |
| Grund | Extended red 1m/5m am lokalen Low **ohne bestätigten Breakdown-Hold** (`strongBreakdown` = false trotz losem `isConfirmedShortBreakdown`) |

**Fazit:** Prod-Fill wäre mit dem neuen Gate **nicht** ausgeführt worden.

---

## 2) ETH SHORT — exakter Fill aus `userFills`

| Feld | Wert |
|------|------|
| HL `userFills` Zeit | **`2026-11-14T04:00:07.733Z`** → **08:00:07 Dubai** |
| Entry (VWAP 4 Legs) | **1883.3186** (≈ Live **1883.31**) |
| Size | 0.1771 |
| **PASS/BLOCK** | **BLOCK** |
| **Code** | `SHORT_ENTRY_TYPE_NONE` |
| Entry-Typ | `NONE` |
| Dump-Extension | **2.68×ATR** |
| Support / Resistance | **13.09×ATR** / **6.33×ATR** |
| Reversal-Score | **0** |
| 1h / 15m Range-Pos | **6%** / **11%** (Floor-Tag) |
| Grund | Kein zulässiger Entry-Typ (kein `strongBreakdown`, keine Resistance-Rejection, kein Retest) — typisch **Bottom-Short nach Extension** |

Weitere ETH-Opens (Holdout): z. B. 06:29:35 Dubai → **PASS** `BREAKDOWN_FOLLOWTHROUGH` (echter Abwärtspfad, nicht Floor-Chase).

---

## 3) Validierungsdatensatz (≥10 weitere Fills, ohne XRP/ETH)

**18× PASS** mit gültigem Entry-Typ, z. B.:

| Coin | Dubai | Entry | Typ | Code |
|------|-------|------:|-----|------|
| NEAR | 14.11. 07:56 | 3.3445 | BREAKDOWN_FOLLOWTHROUGH | PASS |
| BNB | 14.11. 07:43 | 616.6 | BREAKDOWN_FOLLOWTHROUGH | PASS |
| BTC | 14.11. 07:36 | 67077 | BREAKDOWN_FOLLOWTHROUGH | PASS |
| SOL | 14.11. 07:34 | 75.103 | BREAKDOWN_FOLLOWTHROUGH | PASS |
| HYPE | 14.11. 07:34 | 68.312 | BREAKDOWN_FOLLOWTHROUGH | PASS |
| BTC | 14.11. 06:23 | 67812 | BREAKDOWN_FOLLOWTHROUGH | PASS |
| … | | | | |

BLOCK-Beispiele (Validation): USELESS/WLFI-Floor, INIT, GRASS, viele Bottom-Tags mit `SHORT_EXTENDED_DUMP` / `SHORT_SUPPORT_PROXIMITY`.

---

## 4) Kennzahlen (Validierungsset, nicht Holdout)

| Kennzahl | Wert |
|----------|------:|
| Events im Validierungsset | 104 |
| Bottom-getaggt (1h≤25% oder 15m≤22%) | 86 |
| **Bottom-Shorts → würden jetzt BLOCK** | **84.9%** |
| „Gute“ Shorts (PASS + gültiger Entry-Typ im Set) | 18 |
| **Gute Shorts → weiterhin ALLOW** | **100%** |

*Bottom-Tag = heuristic Range-Floor, nicht nur PnL. „Gute“ = Replay-PASS mit BREAKDOWN/RESISTANCE/RETEST — konservativ, kleine Stichprobe (n=18).*

---

## 5) Order-Pfad / No-Bypass

| Pfad | `short_entry_quality` |
|------|------------------------|
| Normaler Bot-Open (`openMarketPosition`) | ✅ unmittelbar vor `client.order` |
| Aggressive / trusted MTF | ✅ (kein Bypass) |
| `forceOpenForAutoTradeUsers` (`skipOpenGates: true`) | ✅ Qualität läuft; **nur** Logging/Gates-Pass übersprungen |
| `placeManualPerpOrder` | ✅ gleicher Submit-Pfad |
| LONG | — (unverändert) |

**Pre-Submit (neu):** `evaluateShortEntryQualityPreSubmit` — frische Kerzen + Live-Mid; Block bei **stale 1m** (>120s) oder Quality-Fail nach **Mark-Drift** >0.12%.

**Tests:** `shortOrderPathCoverage.test.ts` (200/200 gesamt).

---

## 6) Breakdown vs. Support-Gates (Punkt 7)

- **Loose** `isConfirmedShortBreakdown` am Range-Low → **kein** Auto-PASS mehr.  
- **Strong** Breakdown (`confirmedBreakdownThroughPriorSupport`, `sr.confirmedBreakdown`, oder Dump-Continuation **mit** Follow-through **außerhalb** Floor) → `BREAKDOWN_FOLLOWTHROUGH` + PASS (z. B. ETH 06:29, NEAR/BTC 14.11.).  
- Widerspruch „Support-Gate blockiert guten Breakdown“ im Validierungsset: **0** Fälle, bei denen strong breakdown PASS war und ein zweiter Support-Veto greift (ein Gate).

---

## 7) Verbleibende Risiken (kein Deploy)

1. **Replay = HL**, Live-Gate = **Binance** via `signalEngine` — minimale Close-/ATR-Abweichung möglich.  
2. **`SHORT_QUALITY_DATA`** bei dünnem HL-1m-Backfill (ältere Fills) → fail-closed BLOCK (gewollt, kann Over-Block sein).  
3. **Kleine „gute“ Stichprobe** (n=18) — Kennzahl 100% mit Vorsicht lesen.  
4. **Holdout XRP/ETH** bewusst **nicht** in den Aggregat-Prozenten.  
5. Prod noch **`115b18e`** — Gate erst nach Freigabe + Deploy aktiv.

---

## Artefakte

- `bot-service/scripts/short-entry-quality-replay.ts` — reproduzierbarer Replay-Runner  
- `docs/SHORT_ENTRY_QUALITY_REPLAY.json` — alle 128 Events  
- `docs/SHORT_ENTRY_QUALITY_SPEC.md` — Gate-Spezifikation