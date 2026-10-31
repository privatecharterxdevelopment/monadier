# Multi-user bot scaling

Target: **1M+ signups**, thousands of concurrent HL bots.

## Architecture (v15)

| Layer | Behavior |
|-------|----------|
| **Global signal scan** | All HL perps scanned **once per cycle** (~24 parallel). Same MTF signal for every user. |
| **User batch** | Active bots processed **in parallel** (`BOT_USER_CONCURRENCY`, default 64). |
| **Round-robin** | If active bots > `BOT_MAX_USERS_PER_CYCLE` (default 5000), each cycle processes the next slice. |
| **HL execution** | Per-user agent wallet — trades on each user's HL account (no shared vault). |

## Railway env (recommended at scale)

```env
BOT_USER_CONCURRENCY=64
BOT_MAX_USERS_PER_CYCLE=5000
BOT_GLOBAL_SCAN_CONCURRENCY=24
BOT_SKIP_SUB_BOOTSTRAP=true
```

Increase concurrency on larger Railway plans. Watch HL + Binance rate limits.

## Capacity math

- **1M registrations** ≠ 1M active bots. Only wallets with `auto_trade_enabled=true` run.
- Global scan: ~200 perps × 1 MTF pass ≈ **seconds**, not × users.
- 10,000 active bots @ 64 parallel ≈ **~3 min per full pass** if each user ~1s (monitoring is faster).
- Round-robin at 5k/cycle → full 10k roster every **2 cycles**.

## Next steps for 50k+ active bots

1. **Horizontal workers** — multiple Railway replicas with `BOT_SHARD_ID` / `BOT_SHARD_COUNT` (not yet implemented).
2. **Redis queue** — BullMQ for user jobs + shared signal cache.
3. **Dedicated signal service** — separate process for universe scan.
4. **Supabase read replica** — for `vault_settings` lookups.

## DB

Apply migration `20260620195000_vault_hl_auto_trade_index.sql` for fast active-bot queries.
