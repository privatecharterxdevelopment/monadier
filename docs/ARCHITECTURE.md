# Monadier / HyperGain — System Architecture

Orientierungsdokument für Entwickler und Betrieb. Stand: Juni 2026 (`main`, Commit `2320c40`).

---

## 1. Überblick

Monadier ist eine **Hyperliquid-first** Trading-Plattform: Nutzer verbinden eine Wallet, hinterlegen USDC auf Hyperliquid, aktivieren den Bot — der **bot-service** auf Railway handelt per **HL Agent** im Namen des Users. Frontend (Vercel), Auth/Daten (Supabase), Execution (Hyperliquid), Gebührenzahlung (Arbitrum USDC).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Nutzer (Browser / Tauri)                        │
│  React SPA · Wagmi/Reown · Arbitrum Wallet · Supabase Session         │
└───────────────┬───────────────────────────────┬─────────────────────────┘
                │ HTTPS                          │
                ▼                                ▼
┌───────────────────────────┐      ┌────────────────────────────────────┐
│  Vercel (Frontend)        │      │  Supabase                          │
│  monadier.vercel.app      │      │  Auth · Postgres · RLS · Edge Fns  │
│  /app = Pro Trade UI      │      │  profiles · vault_settings · fees  │
└─────────────┬─────────────┘      └──────────────────▲─────────────────┘
              │ /bot-service/* proxy                   │ service role
              ▼                                        │
┌───────────────────────────┐                          │
│  Railway (bot-service)    │──────────────────────────┘
│  Node.js · 24/7 loops     │
│  Scan → Open → Monitor    │
└─────────────┬─────────────┘
              │
    ┌─────────┴─────────┬──────────────────┐
    ▼                   ▼                  ▼
 Hyperliquid        Binance API       Arbitrum RPC
 (Perps, Agents)    (Candles/MTF)     (USDC fees)
```

### Wichtig: Legacy vs. Live

| Bereich | Status |
|---------|--------|
| **Hyperliquid Perps Bot** | **Live** — einziger Execution-Pfad für Auto-Trade |
| `contracts/` GMX Vaults | Legacy — im Repo, **nicht** vom Bot genutzt |
| `gmx_execution_requests` | Legacy-Audit-Tabelle |
| Ältere Docs (`PRODUCTION.md`, `render.yaml`) | Teilweise veraltet (GMX/Vault) |

---

## 2. Repository-Struktur

```
monadier/
├── src/                    # Frontend (Vite + React + TypeScript)
│   ├── pages/              # Routen: Marketing, /app, /admin
│   ├── components/         # UI: terminal, protrade, landing, admin
│   ├── contexts/           # Auth, PlatformFee, Subscription, …
│   ├── hooks/              # HL account, bot setup, markets
│   └── lib/                # hyperliquid/, supabase, fees, admin
├── bot-service/            # Trading-Bot Microservice (Railway)
│   └── src/
│       ├── index.ts        # HTTP API + Cron + Trading-Loop
│       ├── config.ts       # Alle HL/Bot-Env-Variablen
│       └── services/       # ~60 Module (Trading, Gates, Fees, …)
├── supabase/
│   ├── migrations/         # Schema (timestamped SQL)
│   └── functions/          # Edge Functions (Stripe, Email, …)
├── contracts/              # Hardhat — Legacy Vaults
├── docs/                   # Runbooks (dieses Dokument, RAILWAY, SUPABASE)
├── scripts/                # verify-supabase, setup-vercel-env, …
├── public/                 # Static assets
├── src-tauri/              # Optional Desktop-App
├── vercel.json             # SPA + /bot-service Proxy
└── api/geo.js              # Vercel serverless (Geo)
```

---

## 3. Frontend

### Stack

- **Vite 5**, **React 18**, **TypeScript**, **Tailwind CSS 3**
- **React Router 6** — Marketing + `/app` Terminal + `/admin`
- **TanStack Query** — Server-State
- **Wagmi 3 + Reown AppKit** — Wallet (Arbitrum One)
- **Supabase JS** — Auth + DB (anon key, RLS)
- **i18next** — DE, EN, ES, IT, JA, RU, TH, ZH
- Optional: **Tauri 2** Desktop

### Routing (`src/App.tsx`)

| Route | Inhalt |
|-------|--------|
| `/` | Marketing Landing |
| `/app`, `/app/*` | **Pro Trade Terminal** (`Dashboard2ProPage`) |
| `/login`, `/register`, `/auth/callback` | Supabase Auth |
| `/admin` | Admin Monitor (geschützt) |
| `/pricing`, `/trading-bot`, … | Marketing |
| `/dashboard/*` | Redirect → `/app` |

Haupt-UI: Chart (Lightweight Charts), Order Panel, Bot-Dock, Portfolio, Sports Betting (HL Outcomes), News, Affiliate, Profil.

### Provider-Kette (`src/main.tsx`)

`Wagmi` → `QueryClient` → `AuthProvider` → `SubscriptionProvider` → `Web3Provider` → `PlatformFeeProvider` → …

### Wallet & Auth

1. **Supabase Auth** — Email/OAuth (`AuthContext`)
2. **Wallet verbinden** — Reown, nur Arbitrum (`src/lib/wallet.ts`)
3. **Profil** — `profiles.wallet_address`, `user_wallets`
4. **HL Setup** — Agent approven, ggf. Builder-Fee approven (wenn enabled), USDC auf HL

### Bot-API vom Browser

Production: Same-Origin **`/bot-service/*`** → Vercel Rewrite → Railway  
(`vercel.json` → `https://monadier-production.up.railway.app`)

Local: Vite-Proxy oder `VITE_BOT_API_URL` Override.

Relevante Client-Libs:

- `src/lib/hyperliquid/` — HL Info, Exchange, Chart, Outcomes
- `src/lib/signalService.ts` — Bot-API Calls
- `src/lib/platformFeesApi.ts` — Fee-Status + Confirm
- `src/contexts/PlatformFeeContext.tsx` — Fee-Gate im UI

---

## 4. bot-service

### Entry Point: `bot-service/src/index.ts`

**Startup:**

1. `validateProductionEnvironment()`
2. `bootstrapProfitTrailStateFromDb()`
3. `paymentService.startMonitoring()` (Arbitrum USDC Subscriptions)
4. `subscriptionService.ensureFreeSubscriptionsForMissingUsers()` (optional skip)
5. `releaseHlBotTradingPauses()`
6. Sofort: `runTradingCycle()` + `runFastPositionMonitor()`
7. Cron: Trading-Cycle + Position-Monitor
8. Intervalle: Trade-Close-Emails (15s), Pending-Fill-Reconcile (12s)
9. HTTP-Server auf `PORT` (Railway setzt automatisch)

### Haupt-Loops

| Loop | Intervall (Default) | Funktion |
|------|---------------------|----------|
| Trading cycle | `TRADE_INTERVAL_MS` = **1s** | Global scan + User batch opens |
| Position monitor | `HL_POSITION_MONITOR_MS` = **250ms** | Closes, profit trail, SL |
| Payment monitor | kontinuierlich | Arbitrum USDC Subscriptions |
| Fill reconcile | 12s | `pending_fill` → HL Fill truth |
| Close emails | 15s | Resend queue |

### Trading-Pipeline

```
runTradingCycle()
  │
  ├─ processApprovedTrades()
  ├─ updateBotAnalysis()          → bot_analysis (UI)
  └─ buildTradingCycleContext()   → HL meta, mids, liquid universe
       │
       └─ scanGlobalHlSignals()   → EINMAL pro Cycle für alle Perps
            │
            └─ processUserBatch() → parallel (default 64), round-robin
                 │
                 └─ hyperliquidTradingService.processUser()
```

#### Global Scan (`globalMarketScan.ts`)

- Scannt alle liquiden HL-Perps parallel (`BOT_GLOBAL_SCAN_CONCURRENCY`, default 24)
- Zwei Modi:
  - **Standard** — `analyzeMarketMTFBySymbol` (MTF über Binance-Candles)
  - **Aggressive** — `analyzeAggressiveScalpBySymbol` (1m/5m Scalp)
- Jeder Candidate durchläuft Gates: Tier/Caution, 1h-Filter, **Entry-Location** (LONG + SHORT symmetrisch), Pump-Short, etc.
- Output: `GlobalSignalCandidate[]` — geteilt für alle User im Cycle

#### Pro User (`hlTrading.ts` → `processUser`)

1. **Monitor zuerst** — offene Positionen (auch wenn Opens blockiert)
2. **Gates** — Agent approved, Balance, Subscription, Win-Rate, **Platform-Fee-Block**
3. **Open** — `tryOpenFromGlobalSignals()`:
   - Filter nach User-Strategie (`hl_bot_strategy`: standard/aggressive)
   - Macro-Regime (`marketRegime.ts`)
   - Pro Signal: News, Fresh-Pump, **20-Candle**, Scalp, Macro-Beta, Pump-Short, Mega-Pair, Perp-Context, Pump-Sweep, **S/R Location**, **Momentum**
   - `openMarketPosition()` via **per-user HL Agent** (`@nktkas/hyperliquid`)

4. **Close** — `monitorOpenPositions()` / `runFastPositionMonitor()`:
   - Profit Trail (`profitTrailState.ts`, `dynamicTrailingStop.ts`)
   - Default: **profit-only exits** (`HL_PROFIT_ONLY_EXITS !== 'false'`)
   - Optional: SL, Thesis, Emergency (env-gated)
   - `closeMarketPosition()` → `recordBotCloseOutcome()` → Fees + History

### HL Agent-Modell

Jeder User bekommt eine **deterministische Agent-Wallet**:

- Seed: `HL_AGENT_MASTER_SECRET` (oder Fallback `BOT_PRIVATE_KEY`)
- `deriveUserHlAgentAddress(wallet)` in `hlAgent.ts`
- User signiert `approveAgent` auf Hyperliquid
- Approval wird in `hl_agent_approvals` gespeichert (`POST /api/hl-agent/approval`)
- Bot signiert Orders mit Agent-Key — **kein Zugriff auf User-MetaMask-Private-Key**

### Wichtige Services (`bot-service/src/services/`)

| Modul | Aufgabe |
|-------|---------|
| `globalMarketScan.ts` | Universe-Scan, Signal-Candidates |
| `market.ts` / `signalEngine.ts` | MTF-Analyse, Unified Signals |
| `entryLocationGate.ts` | S/R — LONG an Resistance blockiert, SHORT an Support |
| `hlTrading.ts` | Open/Close/Monitor Orchestration |
| `hlInfo.ts` | Clearinghouse, Fills, Funding, Meta |
| `hlAgent.ts` | Agent-Keys pro User |
| `platformFees.ts` | 10% Success Fee, Ledger, Settlement |
| `subscription.ts` | vault_settings, auto_trade, Tiers |
| `positions.ts` | DB-Spiegel + bot_analysis |
| `profitTrailState.ts` | Dynamischer Profit-Trail |
| `userBatchProcessor.ts` | Parallel + Round-Robin |
| `macroBetaGate.ts`, `pumpSweepGate.ts`, `newsImpactGate.ts`, … | Entry-Gates |

### HTTP API (Auszug)

| Endpoint | Methode | Zweck |
|----------|---------|-------|
| `/health` | GET | Uptime, gitCommit, policy, lastCycle |
| `/api/signal` | GET | MTF-Signal für Symbol |
| `/api/bot-status` | GET | Bot-Diagnose pro Wallet |
| `/api/global-signals` | GET | Letzter Global-Scan |
| `/api/hl-agent` | GET | Agent-Adresse für Wallet |
| `/api/hl-agent/approval` | POST | Approval persistieren |
| `/api/hl-builder/status` | GET | Builder-Wallet-Readiness |
| `/api/hl-close` | POST | Manueller Close (UI) |
| `/api/platform-fees` | GET | Accrued fees + treasury |
| `/api/platform-fees/confirm-payment` | POST | Arbitrum USDC verify + settle |
| `/api/hl-position-trails` | GET | Profit-Trail-Snapshots |
| `/api/news` | GET | Crypto-News-Feed |
| `/api/service-status` | GET | Aggregierter Service-Status |

---

## 5. Datenbank (Supabase)

**Projekt:** siehe `docs/SUPABASE_SETUP.md`  
**Migrations:** `supabase/migrations/*.sql` → `supabase db push`

### Kern-Tabellen

| Tabelle | Zweck |
|---------|-------|
| `profiles` | User, Wallet, Onboarding |
| `user_wallets` | Multi-Wallet |
| `subscriptions` / `licenses` / `payments` | Pläne, Stripe/USDC |
| `vault_settings` | Bot-Settings pro Wallet (leverage, auto_trade, hl_bot_strategy, SL/TP) |
| `positions` | Position-Spiegel |
| `trade_history` | Geschlossene Trades (PnL, close_reason, fees) |
| `bot_analysis` | Letzte MTF-Signale (UI) |
| `hl_agent_approvals` | HL Agent Approvals |
| `hl_profit_trail_state` | Trail-State pro Position |
| `hl_fee_ledger` | Success-Fee Accruals |
| `wallet_platform_fee_state` | Win-Counter (20-win Gate) |
| `platform_fee_payments` | Arbitrum USDC Settlements |
| `platform_fee_waivers` | Fee-exempt Wallets |
| `hl_bot_chart_markers` | Chart Open/Close Marker |
| `hl_betting_positions` / `hl_betting_closes` | Sports/Outcomes |
| `referral_*` | Affiliate |
| `user_trade_notifications` | Email-Queue |

### RLS & Zugriff

- **Frontend:** Supabase **anon key** + Row Level Security
- **bot-service:** **service role key** — voller DB-Zugriff für Bot-Logik

### Admin RPCs

- `get_admin_hl_dashboard()` — Snapshot für `/admin`
- `get_admin_hl_trade_history(limit, offset)`
- `get_admin_session_check()`
- `get_admin_affiliate_ops()`

### Edge Functions (`supabase/functions/`)

| Function | Zweck |
|----------|-------|
| `stripe-checkout` / `stripe-webhook` | Abo per Karte |
| `manage-subscription` | Plan-Wechsel |
| `activate-license` / `validate-desktop-license` | Tauri Desktop |
| `request-password-reset` / `send-welcome-email` | Auth/Comms |
| `verify-bot-trade` | Trade-Verifikation |
| `admin-set-password` | Admin User-Mgmt |

---

## 6. Gebühren & Zahlungen

### Platform Success Fee (Hauptmodell)

```
Winning Close (realized PnL > 0)
  │
  ├─ calculatePlatformSuccessFee()     → 10% of profit (HL_SUCCESS_FEE_BPS=1000)
  ├─ splitPlatformFee()              → 100% accrued (HL_BUILDER_FEE_ON_CLOSE=false)
  ├─ hl_fee_ledger INSERT (accrued)
  ├─ wallet_platform_fee_state       → success_win_count++
  │
  └─ Nach 20 unpaid wins + accruedUsd > 0
       → opensBlocked = true
       → User zahlt via PlatformFeePayModal
```

**Zahlungsflow:**

1. User sendet **native USDC auf Arbitrum One** an `PLATFORM_FEE_TREASURY_ADDRESS`
2. Frontend: Phasen `wallet` → `onchain` (Tx-Hash) → `confirming` → `success`
3. Backend: `verifyArbitrumUsdcFeePayment()` (`arbitrumFeeVerify.ts`)
4. `settleAccruedFees()` → Ledger `settled`, **Win-Counter auf 0**, Opens frei

Relevante Dateien:

- `bot-service/src/services/platformFees.ts`
- `bot-service/src/services/arbitrumFeeVerify.ts`
- `src/components/protrade/PlatformFeePayModal.tsx`
- `src/contexts/PlatformFeeContext.tsx`

### HL Builder Fee (optional, aktuell aus)

| Setting | Default (Prod) | Bedeutung |
|---------|------------------|-----------|
| `HL_OPEN_BUILDER_FEE_PERP` | `0` | Kein Builder auf Opens |
| `HL_BUILDER_FEE_ON_CLOSE` | `false` | Kein 0.1% auf Closes |
| `VITE_HL_BUILDER_ENABLED` | `false` | UI verlangt kein Builder-Approval |

Fees laufen **vollständig** über Accrual + Arbitrum-Treasury — nicht über HL `usdSend` oder Builder auf Close.

### Subscriptions

- **Stripe** — Edge Functions
- **Arbitrum USDC** — `PaymentService` monitort Transfers (`ENABLE_ARBITRUM_PAYMENT_MONITOR`)

---

## 7. Entry-Gates (Trading-Logik)

Der Bot öffnet nur, wenn **alle** relevanten Gates passieren. Wichtig für Debugging „warum kein Trade?“.

### Scan-Ebene (`globalMarketScan.ts`)

- MTF Confidence / Tier (cautious alts strenger)
- 1h-Trend-Filter
- **`validateScanEntryLocation`** — S/R für LONG **und** SHORT (symmetrisch)

### Open-Ebene (`hlTrading.ts`)

| Gate | Datei | Kurzbeschreibung |
|------|-------|------------------|
| Cautious confidence | hlTrading | Alts unter Min-Confidence |
| News | `newsImpactGate.ts` | News-Block pro Coin |
| Fresh pump | `freshPumpGate.ts` | Kein Chase nach Pump |
| 20-Candle | `preOpenCandleAnalytics.ts` | Struktur gegen Richtung |
| Scalp 1m/5m | `scalpAlignmentGate.ts` | Aggressive mode only |
| Macro beta | `macroBetaGate.ts` | BTC/ETH Momentum |
| Pump-short | `pumpShortGate.ts` | SHORT während Alt-Pump |
| Mega-pair flow | `megaPairVolumeMonitor.ts` | BTC+ETH Flow |
| Perp context | `perpMarketContextGate.ts` | Funding, 24h Range |
| Pump sweep | `pumpSweepGate.ts` | Apex/Sweep |
| **Entry location** | `entryLocationGate.ts` | Buy low / sell high |
| **Momentum** | `entryMomentumGate.ts` | Live Momentum align |

`shouldRelaxStructuralGates` gibt **immer `false`** zurück — SHORT hat keine Sonderbehandlung mehr.

### Exit-Ebene (separates Thema)

- Profit Trail, `profitOnlyExits`, optional SL — konfiguriert in `config.ts` / `vault_settings`
- Nicht Teil der Entry-Gate-Logik

---

## 8. Deployment

### Production-Topologie

| Service | Host | URL (Beispiel) |
|---------|------|----------------|
| Frontend | Vercel | `monadier.vercel.app`, `app.hypergain.io` |
| Bot | Railway | `monadier-production.up.railway.app` |
| DB/Auth | Supabase | `*.supabase.co` |

### Deploy-Flow

```
git push main
  ├─ Railway: auto-deploy bot-service/ (Nixpacks, health /health)
  └─ Vercel: auto-deploy frontend (oder manuell vercel deploy --prod)
```

Supabase: `supabase db push` + `supabase functions deploy` bei Schema/Edge-Änderungen.

### Wichtige Env-Variablen

#### Railway (`bot-service`)

| Variable | Pflicht | Zweck |
|----------|---------|-------|
| `BOT_PRIVATE_KEY` | ✓ | Platform signing |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | ✓ | DB |
| `HL_BUILDER_ADDRESS` | ✓ | HL Builder wallet (Display/Legacy) |
| `HL_AGENT_MASTER_SECRET` | empfohlen | Per-User Agent seed |
| `PLATFORM_FEE_TREASURY_ADDRESS` | empfohlen | Arbitrum USDC Fee-Empfang |
| `HL_SUCCESS_FEE_BPS` | | Default `1000` (10%) |
| `HL_BUILDER_FEE_ON_CLOSE` | | Default `false` |
| `HL_OPEN_BUILDER_FEE_PERP` | | Default `0` |
| `TRADE_INTERVAL_MS` | | Default `1000` |
| `HL_POSITION_MONITOR_MS` | | Default `250` |
| `HL_PROFIT_ONLY_EXITS` | | Default `true` |
| `RESEND_API_KEY` / `RESEND_FROM` | | Close-Emails |
| `OPENAI_API_KEY` | | News-Analyse |
| `ENABLE_DEMO_SIMULATOR` | | `false` in Prod |

Vollständige HL-Tuning-Oberfläche: `bot-service/src/config.ts` (~400 Zeilen).

#### Vercel (Frontend)

| Variable | Zweck |
|----------|-------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase |
| `VITE_SITE_URL` / `VITE_APP_URL` | Domain-Split |
| `VITE_BOT_API_URL` | Optional — Prod nutzt `/bot-service` Proxy |
| `VITE_PLATFORM_FEE_TREASURY_ADDRESS` | Fee-Modal Treasury |
| `VITE_HL_BUILDER_ADDRESS` | HL Builder (wenn enabled) |
| `VITE_ADMIN_EMAILS` | Admin-Zugang `/admin` |
| `VITE_REOWN_PROJECT_ID` | WalletConnect |

Setup-Script: `scripts/setup-vercel-production-env.sh`  
Runbook: `docs/RAILWAY.md`, `docs/SUPABASE_SETUP.md`

---

## 9. Admin Dashboard

**Route:** `/admin` (`AdminMonitorPage.tsx`)

**Zugang:**

- Email in `VITE_ADMIN_EMAILS`
- Supabase RPC `get_admin_session_check`

**Bereiche:** Overview, HL Bots, Positionen, Trade History, Events, Fees, Betting, Users, Subscriptions, Affiliate

**Datenquellen:**

- Supabase RPCs (`get_admin_hl_dashboard`, …)
- Bot API `/health`, `/api/service-status`
- Live HL Positions (`adminHlLivePositions.ts`)

---

## 10. Skalierung

Siehe `docs/SCALING.md`.

| Mechanismus | Default |
|-------------|---------|
| Global scan | 1× pro Cycle, ~24 parallel |
| User processing | 64 parallel (`BOT_USER_CONCURRENCY`) |
| Max users/cycle | 5000 (`BOT_MAX_USERS_PER_CYCLE`) → Round-Robin |

1M Registrierungen ≠ 1M aktive Bots. Nur `auto_trade_enabled=true` läuft.

---

## 11. Externe Abhängigkeiten

| Service | Nutzung |
|---------|---------|
| **Hyperliquid** | Perp execution, Info API, Agents, Builder |
| **Binance** | Candle-Daten für MTF (via `signalEngine.fetchCandles`) |
| **Arbitrum** | Wallet chain, USDC fees/subscriptions |
| **CryptoPanic** | News feed |
| **OpenAI** | News impact analysis |
| **Stripe** | Card subscriptions |
| **Resend** | Transactional email |

---

## 12. Testing & Verifikation

| Art | Status |
|-----|--------|
| Unit tests | Minimal (z.B. `proTradeBuilderFee.test.ts`) |
| Contract tests | Hardhat (`contracts/`) — Legacy |
| Integration | Manuell: `npm run verify:supabase`, `./scripts/verify-bot-api.sh` |
| Lint | `npm run lint` (root + bot-service) |
| Prod-Check | `/health` (gitCommit), `/api/bot-status?wallet=…`, Admin UI |

---

## 13. User Journey (End-to-End)

```
1. Register/Login (Supabase)
2. Connect Wallet (Arbitrum)
3. Deposit USDC → Hyperliquid (Bridge/Withdraw UI)
4. HL Setup: approve Agent (+ optional Builder)
5. Bot Settings: auto_trade, leverage, strategy (vault_settings)
6. Bot cycle: scan → gate → open
7. Monitor: profit trail → close on green
8. Fees accrue → pay on Arbitrum → counter reset
```

---

## 14. Datei-Index (Quick Reference)

| Datei | Rolle |
|-------|-------|
| `bot-service/src/index.ts` | Bot entry, API, cron |
| `bot-service/src/config.ts` | Env-Konfiguration |
| `bot-service/src/services/hlTrading.ts` | Open/Close/Monitor |
| `bot-service/src/services/globalMarketScan.ts` | Signal-Scan |
| `bot-service/src/services/platformFees.ts` | Fee accrual/settlement |
| `bot-service/src/services/entryLocationGate.ts` | S/R Entry-Gate |
| `src/App.tsx` | Frontend routing |
| `src/pages/dashboard/Dashboard2ProPage.tsx` | Trading UI |
| `src/contexts/PlatformFeeContext.tsx` | Fee-Gate UI |
| `vercel.json` | Deploy + bot proxy |
| `docs/RAILWAY.md` | Bot deploy runbook |

---

## 15. Änderungen protokollieren

Bei Architektur-Änderungen:

1. Dieses Dokument aktualisieren
2. Env in `docs/RAILWAY.md` / `.env.example` spiegeln
3. Migration in `supabase/migrations/` wenn Schema ändert
4. `git push main` → Railway + Vercel deployen
5. `/health` prüfen: `gitCommit` muss neuen Commit zeigen
