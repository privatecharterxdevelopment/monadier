# SHORT Entry Quality — Final Pre-Order Gate

**Branch only** — not deployed to Railway without approval. LONG rules and Exit Variante D untouched.

## Production forensics (2026-11-14)

Last live SHORT fills on wallet `0x1fbc…cd84`: **XRP** @ 0.986 (07:19 UTC), **ETH** SHORT still open. Many bottom-adjacent attempts were blocked by `PRE_OPEN_BULLISH_TAPE` / `LOCATION_SUPPORT` / volume fade; gaps remained where trusted MTF + bypass flags could still open into lows (see `docs/ENTRY_ENGINE_RCA.md`).

## Gate: `short_entry_quality`

Runs in `hlTrading.openMarketPosition` **after** all other open gates, **immediately before** HL `updateLeverage` / order submit.

- Applies to **every SHORT** (standard, aggressive, trusted MTF).
- **Never bypassed** (`trustedMtfBypass: false` in `openGateAudit`).
- **Fail closed** on missing/stale candle fetch.

### Checks

| Rule | Code |
|------|------|
| Extended red 1m/5m impulse far below structure ref (ATR) | `SHORT_EXTENDED_DUMP` |
| Near 5m/15m support / range low without breakdown | `SHORT_SUPPORT_PROXIMITY` |
| Confirmed bullish reversal (reclaim, structure break + divergence/wicks) | `SHORT_REVERSAL_VETO` |
| Poor downside room vs upside (ATR) | `SHORT_POOR_DOWNSIDE_ROOM` |
| No valid entry type (breakdown, resistance rejection, retest) | `SHORT_ENTRY_TYPE_NONE` |

### Observability

Structured log: `short_entry_quality_record` (coin, entry price, distances ATR, dump extension, reversal risk, entry type, PASS/BLOCK reason).

Open blocks DB gate: `short_entry_quality`.

### Config

`config.hyperliquid.shortEntryQuality` — env prefix `HL_SHORT_QUALITY_*`.