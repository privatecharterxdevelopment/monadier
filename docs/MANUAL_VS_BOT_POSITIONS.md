# Manual vs bot HL positions

## Rules (invariant)

1. **One wallet, one slot pool** — every open HL perp (manual Perps tab or bot) counts toward `maxConcurrentPositions`. The bot does not open a new trade while `hlOpenPerpCoins >= maxSlots`.
2. **User manual (Perps tab)** — tagged `hl_bot_chart_markers.source = manual`. The monitor **never** auto-closes these (no profit trail, no excluded-coin flat). You close them yourself.
3. **Bot / agent-managed** — tagged `source = bot` (auto-trade or agent panel with bot-managed flag). Profit trail, emergency SL sync, and excluded-coin flat apply only here.

## Implementation

- `placeManualPerpOrder({ botManaged: false })` → marker `manual`, `positionScope: manual`.
- Auto `openMarketPosition` → marker `bot`.
- `monitorOpenPositions` calls `isUserManualHlPosition` and skips bot exit logic when true.
- UI `useHlBotManagedCoins` excludes `source=manual` opens from the bot-managed coin set.

**Untagged HL size** (opened outside HyperGain): treated as **user manual** until a bot open marker exists.
