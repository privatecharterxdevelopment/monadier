# HyperGain — Skalierungs-Roadmap (Phase 2+)

**Status:** Planungsdokument — **keine Implementierung**  
**Ziel:** HL Rate Limits lösen, Bot-Last horizontal skalieren, **1M+ registrierte User** unterstützen  
**Stand:** Juni 2026 · bezieht sich auf `bot-service` v15 (`multi-user-scale`) und `docs/SCALING.md`

---

## 1. Ausgangslage

### Was heute gut skaliert

| Bereich | Verhalten | Limit |
|---------|-----------|-------|
| **Registrierungen / Auth / Dashboard** | Supabase + Vercel SPA | **1M+ User** (Plan-abhängig) |
| **Globaler Signal-Scan** | 1× pro Cycle, ~200 Perps, ~24 parallel | **Unabhängig von User-Anzahl** |
| **HL Execution** | Pro User eigener Agent — non-custodial | Kein Shared Vault |

### Aktuelle Engpässe

| Engpass | Ursache | Symptom |
|---------|---------|---------|
| **HL IP Rate Limit** | Alle Bots → **eine Railway-IP** → `api.hyperliquid.xyz` | Langsame/fehlende `clearinghouseState`-Reads, Monitor >500 ms |
| **Fast Position Monitor** | Alle 250 ms **jeder** `auto_trade_enabled`-Wallet → REST Poll | Weight-Explosion (siehe unten) |
| **Single Worker** | Kein `BOT_SHARD_ID` / `BOT_SHARD_COUNT` | Round-Robin ab 5k Bots/Cycle |
| **Binance Candles** | MTF-Signale für globalen Scan | Separates Rate Limit (nicht HL, aber relevant) |

### Wichtige Unterscheidung

```
1M registrierte User   ≠   1M gleichzeitig laufende Bots
```

Realistische Planung: **1M Signups**, **5k–50k peak aktive Bots** (je nach Produkt-Wachstum).

---

## 2. Hyperliquid Rate Limits (Referenz)

Quelle: [HL Rate Limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)

| Limit-Typ | Wert | Betrifft uns |
|-----------|------|--------------|
| **REST pro IP** | **1.200 Weight / Minute** | **bot-service Railway-IP** (kritisch) |
| `clearinghouseState` | Weight **2** | Pro User-Balance/Position-Check |
| `allMids` | Weight **2** | Preise (global, 1× reicht) |
| `meta` | Weight **20** | Markt-Metadaten |
| **Orders (`/exchange`)** | Weight **1** pro Action | Pro **User-Wallet**, nicht IP |

**Grobrechnung heute (Fast Monitor, 250 ms):**

- 1.000 aktive Bots → ~4 Monitor-Ticks/s × 1.000 × Weight 2 ≈ **480.000 Weight/min** (theoretisch)
- HL erlaubt **1.200 Weight/min** pro IP
- → REST-Polling skaliert **nicht** ohne Umbau

**Fazit:** Das Problem ist **lösbar** — durch weniger REST-Calls (Cache, Filter) und **mehr IPs** (Sharding) sowie **WebSockets**.

---

## 3. Zielbild nach Phasen

```
Phase 1 (heute)     5k–10k aktive Bots · 1 Worker · REST-heavy
Phase 2 (Quick)     Cache + Monitor-Filter · HL-Last −80–95%
Phase 3 (Scale)     Worker-Sharding · 4–10 Railway Replicas
Phase 4 (Queue)     Redis/BullMQ · dedizierter Signal-Service
Phase 5 (1M+)       Read Replicas · WS-Hub · Observability
```

| Phase | Registrierte User | Aktive Bots (peak) | HL-Strategie |
|-------|-------------------|--------------------|--------------|
| 1 | 100k | 5k | REST + Round-Robin |
| 2 | 500k | 10–20k | REST gecacht + WS Preise/Fills |
| 3 | 500k–1M | 20–50k | Sharded Workers + WS |
| 4–5 | 1M+ | 50k+ | Queue + WS-Hub pro Shard |

---

## 4. Phase 2 — Quick Wins (ohne Sharding)

**Ziel:** HL REST-Last drastisch senken, gleicher Single-Worker.

### 4.1 `clearinghouseState` Cache (bot-service)

| Parameter | Vorschlag |
|-----------|-----------|
| TTL offene Position | **1–2 s** |
| TTL keine Position | **5–10 s** |
| TTL Bot gestoppt | Kein Poll |
| Storage | In-Memory LRU pro Worker (später Redis shared) |

**Betroffene Dateien ( später ):**
- `bot-service/src/services/hlInfo.ts`
- `bot-service/src/services/hlTrading.ts` (`runFastPositionMonitor`, `processUser`)

**Ersparnis:** bis **−90 %** REST-Calls für User ohne Positionsänderung.

### 4.2 Fast Monitor — nur relevante Wallets

Heute: `getAutoTradeUsers()` → **alle** Wallets alle 250 ms.

**Neu (Plan):**

1. **Tier A** — offene HL-Position → Monitor alle **250–500 ms** (WS-gestützt, siehe §5)
2. **Tier B** — Bot an, keine Position → Check alle **5–10 s** (Open-Gate / Balance)
3. **Tier C** — Bot aus → kein Monitor

**Datenquelle Tier A:** Supabase/Cache „wallets with open perp“ oder In-Memory Set nach erstem `clearinghouseState`.

**Betroffene Dateien ( später ):**
- `bot-service/src/services/hlTrading.ts` → `runFastPositionMonitor`
- Optional: DB-View oder Redis Set `hl:open_positions:{wallet}`

### 4.3 Globale REST-Calls deduplizieren

Bereits teilweise vorhanden — konsequent pro Cycle **einmal**:

- `allMids` → 1× pro Monitor-Tick (nicht pro User)
- `meta` → 1× pro Trading-Cycle mit TTL **60 s**
- `TradingCycleContext` → Signal-Scan shared (bereits so)

### 4.4 Env-Empfehlung ab ~2k aktiven Bots

```env
BOT_USER_CONCURRENCY=64
BOT_MAX_USERS_PER_CYCLE=5000
BOT_SKIP_SUB_BOOTSTRAP=true
HL_POSITION_MONITOR_MS=500          # von 250 → 500 bis WS live
HL_CLEARINGHOUSE_CACHE_MS=2000      # neu
HL_META_CACHE_MS=60000              # neu
```

### 4.5 Erfolgsmetriken Phase 2

- [ ] Fast Monitor p95 **< 200 ms** bei N aktiven Bots
- [ ] HL REST Weight **< 800/min** pro IP (Headroom)
- [ ] Keine `429` / Retry-Storms in Logs
- [ ] `/health` + neuer Endpoint `hlRateBudget` (optional)

---

## 5. WebSocket-Strategie (HL)

### 5.1 Was HL WebSocket kann

Endpoint: `wss://api.hyperliquid.xyz/ws` (bereits im Frontend: `src/lib/hyperliquid/ws.ts`)

| Subscription | Nutzen für Bot-Service | Ersetzt REST |
|--------------|------------------------|--------------|
| `allMids` | Live-Markpreise global | `fetchHlAllMids()` Poll |
| `userFills` | Fill-Bestätigung nach Close/Open | Polling `userFills` / Retry-Loops |
| `orderUpdates` | Order-Status | `orderStatus` Poll |
| `l2Book` | Optional Liquidity-Gate | `l2Book` REST |
| `candle` | **Nein** für Bot — Signale bleiben Binance MTF | — |

**HL WS Limits (Referenz):** ~100 Connections, ~1000 Subscriptions, ~2000 Messages/min **pro Connection**.

### 5.2 Architektur: `HlWsHub` im bot-service

Neues Modul ( **später** ): `bot-service/src/services/hlWsHub.ts`

```
┌─────────────────────────────────────────────────────────┐
│  bot-service Worker (Railway)                          │
│                                                         │
│  ┌──────────────┐    ┌─────────────────────────────┐   │
│  │  HlWsHub     │───▶│ 1–3 WS Connections          │   │
│  │  (singleton) │    │ · allMids (global, 1 sub)   │   │
│  └──────┬───────┘    │ · userFills per open wallet │   │
│         │            │ · orderUpdates per open w.  │   │
│         ▼            └─────────────────────────────┘   │
│  In-Memory State Map                                    │
│  · mids: Record<coin, px>                               │
│  · fills: wallet → last fill                            │
│  · positions: wallet → cached from WS + periodic REST   │
└─────────────────────────────────────────────────────────┘
```

**Design-Regeln:**

1. **Eine `allMids`-Subscription pro Worker** — Preise für alle User gratis (kein Weight)
2. **`userFills` + `orderUpdates` nur für Wallets mit offener Position oder pending Order**
3. **Subscribe on open, unsubscribe on flat** — Subscription-Budget schonen
4. **Reconnect + Resubscribe** — Pattern aus Frontend `HlWsClient` wiederverwenden (Port nach Node `ws`)
5. **REST als Fallback** — WS down → degraded mode mit Cache TTL, nicht blind handeln

### 5.3 Integration in bestehende Loops

| Loop | Heute | Mit WS |
|------|-------|--------|
| Fast Monitor (250 ms) | REST `allMids` + N× `clearinghouseState` | WS `allMids` + Cache/WS fills; REST `clearinghouseState` seltener |
| Trading Cycle (1 s) | REST pro User | Cache hit; REST nur bei Cache miss |
| Close confirmation | `fetchHlRecentCloseFillSummaryWithRetry` | WS `userFills` Event → sofort |

### 5.4 Frontend vs. Backend WS

| | Frontend (`src/lib/hyperliquid/ws.ts`) | Backend (`HlWsHub` — geplant) |
|--|----------------------------------------|--------------------------------|
| Zweck | Charts, Live UI | Bot Monitor, Fill-Truth |
| Connections | Browser, 1 shared | Node Worker, 1–3 pro Shard |
| User subs | Pro eingeloggter User | Pro **aktivem Bot mit Position** |

**Kein Sharing** zwischen Frontend-WS und bot-service — getrennte Connections, gleiches HL-Limit pro IP (Railway ≠ User-Browser).

### 5.5 Phase-2-WebSocket Rollout

**Schritt A — Read-only, risikoarm**
- [ ] `allMids` over WS → Fast Monitor ohne REST-Preis-Poll
- [ ] In-Memory `mids` Map mit Stale-Check (kein Trade wenn >3 s alt)

**Schritt B — Fill-Truth**
- [ ] `userFills` für Wallets in Close-Flow
- [ ] Reduziert `pending_fill` Reconcile-Last

**Schritt C — Order lifecycle**
- [ ] `orderUpdates` für Open/Close Pending States
- [ ] Weniger Exchange-Poll nach Order send

---

## 6. Phase 3 — Horizontal Sharding

**Ziel:** Mehrere Railway Replicas → **mehrere IPs** → lineares HL-Budget.

### 6.1 Shard-Modell (geplant, noch nicht im Code)

```env
BOT_SHARD_COUNT=4
BOT_SHARD_ID=0          # 0 .. SHARD_COUNT-1 pro Replica
```

**Wallet-Zuweisung:**

```
shard = keccak256(wallet) % BOT_SHARD_COUNT
```

Jeder Worker verarbeitet nur Wallets seines Shards.

### 6.2 Betroffene Komponenten ( später )

| Komponente | Änderung |
|------------|----------|
| `subscriptionService.getAutoTradeUsers()` | Filter `WHERE shard(wallet) = SHARD_ID` oder Post-Filter |
| `runTradingCycle()` | Nur Shard-Wallets |
| `runFastPositionMonitor()` | Nur Shard-Wallets |
| Cron / Intervals | Gleich auf allen Shards (kein Leader Election nötig) |
| Emails / Fee reconcile | **Ein** Worker oder dedizierter Job-Runner (`SHARD_ID=0` only) |

### 6.3 Kapazität mit Sharding

| Shards | HL REST Budget (theoretisch) | Aktive Bots (Richtwert mit Phase 2) |
|--------|--------------------------------|-------------------------------------|
| 1 | 1.200 weight/min | 5k–10k |
| 4 | ~4.800 weight/min | 20k–40k |
| 10 | ~12.000 weight/min | 50k–100k |

*(WebSockets reduzieren REST-Abhängigkeit weiter — Shards dann eher für CPU/Parallelität.)*

---

## 7. Phase 4 — Queue & Signal-Service

**Ziel:** Entkopplung Scan ↔ Execution, fair scheduling bei 50k+ Bots.

### 7.1 Redis + BullMQ (Vorschlag)

```
┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│ Signal Worker│────▶│ Redis       │◀────│ Bot Workers (N)  │
│ (1 pro Region)│     │ · scan cache│     │ · user jobs      │
│ global scan  │     │ · job queue │     │ · WS hubs        │
└──────────────┘     └─────────────┘     └──────────────────┘
```

**Queues:**
- `scan:universe` — 1 Job/Cycle, Ergebnis in Redis TTL 30 s
- `user:process` — 1 Job/Wallet/Cycle, Shard-aware
- `user:monitor` — nur Tier-A Wallets

### 7.2 Dedizierter Signal-Service

Extrahiert aus `globalMarketScan.ts` + Binance fetches:
- Entlastet Bot-Worker CPU
- Binance Rate Limits zentral steuerbar
- Ein Scan-Ergebnis für **alle** Shards

---

## 8. Phase 5 — 1M+ User (Plattform)

### 8.1 Supabase

- [ ] Read Replica für `vault_settings`, `profiles` Lookups
- [ ] `BOT_SKIP_SUB_BOOTSTRAP=true` ab ~100k Profilen (bereits in Config)
- [ ] Index `vault_hl_auto_trade_index` (Migration vorhanden)
- [ ] Connection Pooling (Supavisor) für bot-service

### 8.2 Frontend / Auth

- Vercel skaliert automatisch — **kein Engpass** für 1M Pageviews
- Supabase Auth Pro/Team Plan nach MAU

### 8.3 Observability (vor Phase 3 Pflicht)

- [ ] HL Weight Schätzung pro Minute (Log + Metric)
- [ ] `userRateLimit` HL-Endpoint stichprobenartig pro Agent-Wallet
- [ ] Monitor-Dauer, Queue-Lag, Shard-Load Dashboard
- [ ] Alert: Fast Monitor p95 > 500 ms oder REST errors > 1%

---

## 9. Implementierungs-Reihenfolge (Empfehlung)

| # | Task | Aufwand | Impact | Risiko |
|---|------|---------|--------|--------|
| 1 | `clearinghouseState` Cache | S | Hoch | Niedrig |
| 2 | Monitor Tier A/B/C Filter | S | Sehr hoch | Niedrig |
| 3 | `meta` / `allMids` TTL dedupe | XS | Mittel | Niedrig |
| 4 | WS `allMids` Hub (bot-service) | M | Hoch | Mittel |
| 5 | WS `userFills` Close-Flow | M | Mittel | Mittel |
| 6 | `BOT_SHARD_ID` / `SHARD_COUNT` | L | Sehr hoch | Mittel |
| 7 | Redis + BullMQ | L | Hoch | Mittel |
| 8 | Signal-Service Split | L | Mittel | Mittel |

**Legende:** XS/S/M/L = Aufwand grob (Tage/Wochen)

---

## 10. Was bewusst nicht in Phase 2

- Kein Multi-Region (erst bei echtem Bedarf)
- Kein eigener HL-Proxy / CDN Layer
- Kein Wechsel weg von Binance MTF (separates Projekt)
- Kein Stripe/Queue für Fees (unabhängig)

---

## 11. Referenzen im Repo

| Datei | Inhalt |
|-------|--------|
| `docs/SCALING.md` | Kurzüberblick v15, Env-Vars |
| `docs/ARCHITECTURE.md` §10 | Skalierung, User Journey |
| `bot-service/src/config.ts` | `scaling.*`, `HL_POSITION_MONITOR_MS` |
| `bot-service/src/services/userBatchProcessor.ts` | Round-Robin |
| `bot-service/src/services/hlTrading.ts` | `runFastPositionMonitor`, Trading Cycle |
| `bot-service/src/services/hlInfo.ts` | REST HL Info API |
| `src/lib/hyperliquid/ws.ts` | Frontend WS Client (Vorlage für Backend-Port) |

---

## 12. Offene Entscheidungen (vor Implementierung klären)

1. **Redis-Host:** Railway Redis Plugin vs. Upstash vs. eigener Container?
2. **Shard-Emails:** Fee-Due + Trade-Close nur auf `SHARD_ID=0` oder eigener `job-runner` Service?
3. **WS Library Node:** `ws` npm vs. native — Reconnect-Strategie
4. **Cache shared across Shards:** Redis ab Phase 3 oder In-Memory pro Shard ausreichend?
5. **Monitor-Intervall nach WS:** 250 ms beibehalten oder 500 ms bei WS `allMids`?

---

*Dieses Dokument ist die Single Source of Truth für Skalierungsplanung Phase 2+. Bei Umsetzung: Issues/PRs gegen Checklisten in §4, §5, §6 referenzieren.*
