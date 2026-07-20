# Lorenzo bot logs export — Jun 26 2026 → now

Wallet: `0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c`

## Gate / TF logs (NEW — from Supabase anon)

| File | What it is |
|------|------------|
| `hl_bot_chart_markers.json` | **466** open/close markers; open rows store full `close_reason` = open-reason doc (incl. `N TFs agree` + MTF breakdown) |
| `opens_with_tfs.csv` | **147** opens with parsed `tfs` / `align` / `d1m..d1h` + joined marker `pnl` when available |
| `worst_long_open_reasons.txt` | Full open-reason text for worst LONG marker closes |

## HL fills (on-chain)

| File | What it is |
|------|------------|
| `HL_SUMMARY.txt` | Daily LONG/SHORT PnL + liquidations |
| `hl_closes_jun26_now.csv` | Realized closes |
| `hl_fills_jun26_now.json` | All fills |

## Still missing

- `trade_history` via anon → **[]** (needs service role)
- Railway stdout archive (not retained here)
- `pipeline_funnel_log` wallet filter blew up (500); not needed once chart markers exist

## Quick TF takeaway (opens_with_tfs + HL match)

- LONG opens with parsed TFs: **41** → tfs=2: **20**, tfs=3: **21**
- Catastrophe example: **CASHCAT −24.22** opened at **tfs=2**, 15m=HOLD, 1h=HOLD
- Several big HL LONG losers also matched **tfs=2** (ETH −11.79, BTC −11.27, ZEC −12.25 match)
- But some big losers already had **tfs=3** + both HTF LONG (AAVE, CRV, XRP) → LONG-only ≥3 would **not** have blocked those
