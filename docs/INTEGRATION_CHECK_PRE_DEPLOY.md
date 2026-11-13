# Pre-Deploy Integration Check — Dashboard P0 + Variante D

**Datum:** 14 Nov 2026 (Asia/Dubai) · **Branch:** `cursor/regime-deploy-87df264-42a8`  
**Status:** Audit abgeschlossen · **kein Deploy** in diesem Schritt

---

## 1. Emergency-SL — Erkennung & Recovery (Code + HL-Semantik)

| Stufe | Mechanismus | Quelle |
|-------|-------------|--------|
| **Erkennung** | `planProtectiveSync` → `emergencyMissing` wenn gewünschter Emergency-Stop, aber kein matching Trigger auf HL | `hlProfitStopSync.ts` |
| **Monitor** | `runFastPositionMonitor` (~250 ms) ruft `syncHlProfitStopOrder`; bei `emergencyMissing \|\| emergencyDue` → `recoverPositionUserStop` | `hlTrading.ts` L1769–1781 |
| **POST** | Emergency zuerst: `buildEmergencyStopMarketLeg` + `client.order({ grouping: 'na' })` | `syncHlProfitStopOrder` |
| **Bestätigung** | Open-Order-Re-read; Profit-POST nur nach Verify; Emergency `rememberConfirmedStops` bei erfolgreichem POST | `hlProfitStopSync.ts` |
| **Fehler** | POST-Fail: Profit-Orders **nicht** canceln; Recover bei unreachable → `CRITICAL_UNPROTECTED_POSITION` | `hlEntrySlFailSafe.ts` |

**Live-Logs (Railway):** Nicht in diesem Lauf an gebunden — Verifikation über Code-Pfad + Unit `hlEmergencyMonitor.integration.test.ts` + bestehende `hlProtectiveReconcile.test.ts` (`emergencyMissing: true`).

**Fazit:** Offene Position **mit** konfiguriertem User-SL% wird vom Monitor als ungeschützt erkannt und Recovery ausgelöst — **unabhängig vom Vercel-Dashboard**.

---

## 2. Snapshot-Konsistenz Header / Dock / Footer

| UI | Daten |
|----|--------|
| Header (bot/perps) | `useHlExchangeSnapshot` → `snapshotScopedUpnl` |
| Dock | `markPrices` + Positionen aus Parent; Marks aus **demselben** Snapshot |
| Footer | `exchangeSnapshot.upnlTotalUsd` (wallet-weit) bzw. fallback Snapshot |

**Gleichheit:** Bei **identischem** Snapshot und **bot-Scope** (alle HL-Opens im Bot-Tab) müssen Header-Open-Pill und Dock-Summe übereinstimmen — abgebildet in `hlDashboardIntegration.test.ts`.

**Bekannte Abweichung:** Footer zeigt **wallet-weite** Summe; Header **scoped** (bot vs manual). Das ist by design, nicht Bug.

---

## 3. Chart-Latenz (1m aktuelle Kerze)

**Änderung:** `allMids` aktualisiert neben `snapshot.markPx` auch **die letzte Kerze** (close/high/low) ohne erneuten `candleSnapshot`-Fetch — History-Cache bleibt bestehen.

| Pfad | Latenz |
|------|--------|
| WS `candle` channel | ~32 ms throttle |
| WS `allMids` → letzte Kerze | ~48 ms throttle |
| REST `candleSnapshot` | nur bei Coin/TF-Wechsel oder History &lt; 12 Bars |

---

## 4. Stop-Spalte — VERIFIED & Aktualität

| Aspekt | Verhalten |
|--------|-----------|
| VERIFIED | Nur `profitSlConfirmed` / `emergencySlConfirmed` von API **mit** HL-Order |
| Memory | `PROFIT_SL_UNVERIFIED` + UI-Label |
| Refresh | Trail-Poll **3 s** + **sofort** bei `trailRefreshKey` (Orders/Position-`asOf` aus Snapshot) |

---

## 5. Szenario-Tests (automatisiert)

| Szenario | Test |
|----------|------|
| Snapshot-Gleichheit | `hlDashboardIntegration.test.ts` |
| Partial fill / size | `hlExchangeSnapshot.test.ts` |
| SL verify UI | `hlTrailingStopChart.verify.test.ts` |
| Emergency detect | `hlEmergencyMonitor.integration.test.ts` |
| Reconnect / wallet switch | WS-Client reconnect 2 s; Provider `wallet`-Dep reset — **manuell empfohlen** vor Prod |
| Parallel position changes | Race: Snapshot `positionsAsOfMs` + Account WS debounce 200 ms — **kein Test auf HL live** |

---

## 6. Requests & Render-Loops

| Befund | Risiko |
|--------|--------|
| Ein `useHyperliquidAccount` im Provider | Gut |
| Bot-Dock zweites Account-Hook (Fills) | Doppel-Poll mit **2,5 s hlInfo-Cache** — niedrig |
| Snapshot `tick` 1 s | Neues Snapshot-Objekt → Consumer-Re-Render **1 Hz** (STALE-Ages) — akzeptabel |
| N× `allMids` Subscriber | Chart + Mark-Provider — geteilter WS, akzeptabel |
| Trail 3 s + refreshKey | +1 API-Call bei Order-Änderung — gewollt |

**Kein unendlicher Render-Loop** in Code-Review.

---

## GO / NO-GO

### Dashboard P0-Fix (`a9215ff` + Integrations-Patch)

| Kriterium | Status |
|-----------|--------|
| Single snapshot | **GO** (mit dokumentierter Footer vs Header-Scope) |
| Ehrliche SL-Anzeige | **GO** |
| Chart live last bar | **GO** (nach Patch) |
| Emergency unabhängig vom UI | **GO** |
| Live-Railway-Log-Stichprobe | **NO-GO bis Staging** — 30 min Monitor-Log mit offener Position empfohlen |

**Empfehlung:** **Conditional GO** — Dashboard P0 nach **Staging-Smoke** (Header=Dock uPnL, UNVERIFIED bei 0 HL-Orders, Chart-Tick sichtbar). **Nicht** ohne 1× Wallet-Live-Check deployen.

### Variante D (`d45a92c`)

| Kriterium | Status |
|-----------|--------|
| Unit-Tests 191/191 | **GO** |
| HYPE-Golden / Exchange-Semantik | **GO** (Branch-Stand) |
| Production Trail-Swap | **NO-GO** — weiterhin **nicht** mit Dashboard bündeln; **separater** Staging-Cutover + Live-Trail-Forensik (wie NEAR/HYPE) |

**Empfehlung:** **NO-GO für Produktion** bis dediziertes Trail-Staging mit echtem POST→Verify→Cancel und Abnahme §13 Spec.

---

## Nächste Schritte (ohne Deploy)

1. Staging: Wallet öffnen, absichtlich Emergency cancel → Monitor-Log `emergencyMissing` / Recover innerhalb &lt;5 s.  
2. UI: Header vs Dock uPnL bei 2 Coins screenshot + `snapshot.stale` false.  
3. Variante D: `HL_TRAIL_LEGACY=false` nur auf Staging-Railway, kein Prod-Flag.
