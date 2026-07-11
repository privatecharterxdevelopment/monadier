-- HL bot settings are keyed on Arbitrum (42161). Legacy Base (8453) rows sometimes
-- kept auto_trade_enabled=true while the bot only discovers 42161 — so other users
-- never entered the trading cycle.
--
-- 1) Promote orphan ON (no 42161 row) onto the canonical chain.
-- 2) Clear auto_trade on all non-42161 hyperliquid rows.

INSERT INTO public.vault_settings (
  wallet_address,
  chain_id,
  execution_venue,
  auto_trade_enabled,
  take_profit_percent,
  stop_loss_percent,
  ask_permission,
  leverage_multiplier,
  risk_level_bps,
  min_win_rate_percent,
  min_trades_for_win_rate_gate,
  hl_bot_strategy,
  user_id,
  updated_at,
  synced_at
)
SELECT
  lower(s.wallet_address),
  42161,
  'hyperliquid',
  true,
  s.take_profit_percent,
  s.stop_loss_percent,
  coalesce(s.ask_permission, false),
  coalesce(s.leverage_multiplier, 5),
  coalesce(s.risk_level_bps, 500),
  coalesce(s.min_win_rate_percent, 0),
  coalesce(s.min_trades_for_win_rate_gate, 5),
  coalesce(s.hl_bot_strategy, 'standard'),
  s.user_id,
  now(),
  now()
FROM public.vault_settings s
WHERE s.auto_trade_enabled = true
  AND s.chain_id <> 42161
  AND (s.execution_venue = 'hyperliquid' OR s.execution_venue IS NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.vault_settings c
    WHERE lower(c.wallet_address) = lower(s.wallet_address)
      AND c.chain_id = 42161
  )
ON CONFLICT (wallet_address, chain_id) DO UPDATE
SET
  auto_trade_enabled = true,
  execution_venue = 'hyperliquid',
  updated_at = now(),
  synced_at = now();

UPDATE public.vault_settings
SET
  auto_trade_enabled = false,
  updated_at = now()
WHERE auto_trade_enabled = true
  AND chain_id <> 42161;
