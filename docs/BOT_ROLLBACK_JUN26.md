# Bot-Service Rollback — 26 Jun 2026 (`4d1b4d6`)

Isolated rollback of **only** `bot-service/` (Railway). Frontend (Vercel) and Supabase stay on `main`.

## Git anchor

| | |
|---|---|
| Commit | `4d1b4d6` |
| Date | 2026-06-26 02:01 +0400 |
| Message | Add $20 hard stop and per-coin chart direction |

## Trail / profit SL — Jun 26 vs today (`main`)

| | **26 Jun (`4d1b4d6`)** | **Today (`main`)** |
|---|---|---|
| Phases | `idle` → `armed` (breakeven+fees) → `trailing` (ATR ratchet) | `idle` → `profit_lock` → `trailing` (+ loss SL optional) |
| Stage 1 arm | ~**2.5% ROE**, after **2 min** in profit | ~**1% ROE**, often immediate |
| Stage 2 arm | Full trail at ~**5% ROE** | Peak ratchet from ~**2% ROE** |
| DB trail state | In-memory only | `hl_profit_trail_state` persisted |
| Platform fees | **None** in bot-service | 10% on wins, 20-win gate |
| Loss auto-close | Still armed via idle phase | Disabled unless user sets SL% |

Reverting restores the **Jun 26 trail logic**, not the newer `profit_lock` / `hl_profit_trail_state` system.

## Deploy this branch to Railway

```bash
git checkout bot-service-jun26
./scripts/railway-deploy-bot.sh
```

Or Railway dashboard → Service → **Deploy** → branch `bot-service-jun26`.

Railway env: keep existing secrets. Optional for Jun-26-like behavior:

- `HL_SUCCESS_FEE_ENABLED=false` (fees module absent in this code anyway)
- Review `HL_TRAIL_BE_ARM_ROE_PCT` (default 2.5) and `HL_TRAIL_ARM_ROE_PCT` (default 5)

## Roll forward again

```bash
git checkout main
./scripts/railway-deploy-bot.sh
```

## Caveats

- Supabase migrations after Jun 26 remain; old bot ignores fee tables (OK).
- Frontend may call `/api/platform-fees` → 404 on rolled-back bot (UI still works).
- Lost fixes: unified HL balance reads, agent flake fixes, weekend macro gates, fill aggregation.
