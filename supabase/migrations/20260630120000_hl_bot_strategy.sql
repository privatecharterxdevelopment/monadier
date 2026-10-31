-- HL bot strategy: standard (MTF trend) vs profit_grabber (exit-first lock)

ALTER TABLE vault_settings
  ADD COLUMN IF NOT EXISTS hl_bot_strategy TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE vault_settings DROP CONSTRAINT IF EXISTS vault_settings_hl_bot_strategy_check;
ALTER TABLE vault_settings ADD CONSTRAINT vault_settings_hl_bot_strategy_check
  CHECK (hl_bot_strategy IN ('standard', 'profit_grabber'));

COMMENT ON COLUMN vault_settings.hl_bot_strategy IS
  'HL bot mode: standard = MTF trend scan; profit_grabber = lock +$0.01 once +$0.02 (exit-first)';

-- Replace 10-arg RPC so PostgREST does not see ambiguous overloads.
DROP FUNCTION IF EXISTS public.save_vault_trading_settings(
  text, integer, boolean, integer, numeric, numeric, numeric, boolean, numeric, integer
);

CREATE OR REPLACE FUNCTION public.save_vault_trading_settings(
  p_wallet_address text,
  p_chain_id integer,
  p_auto_trade_enabled boolean,
  p_risk_level_bps integer,
  p_leverage_multiplier numeric,
  p_take_profit_percent numeric,
  p_stop_loss_percent numeric,
  p_ask_permission boolean DEFAULT false,
  p_min_win_rate_percent numeric DEFAULT 0,
  p_min_trades_for_win_rate_gate integer DEFAULT 5,
  p_hl_bot_strategy text DEFAULT 'standard'
)
RETURNS vault_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result vault_settings;
  w text := lower(trim(p_wallet_address));
  strat text := COALESCE(NULLIF(trim(p_hl_bot_strategy), ''), 'standard');
BEGIN
  IF w IS NULL OR w = '' OR length(w) < 10 THEN
    RAISE EXCEPTION 'wallet_address required';
  END IF;
  IF p_chain_id IS NULL OR p_chain_id <= 0 THEN
    RAISE EXCEPTION 'chain_id required';
  END IF;
  IF strat NOT IN ('standard', 'profit_grabber') THEN
    RAISE EXCEPTION 'hl_bot_strategy must be standard or profit_grabber';
  END IF;

  INSERT INTO vault_settings (
    wallet_address,
    chain_id,
    auto_trade_enabled,
    risk_level_bps,
    leverage_multiplier,
    take_profit_percent,
    stop_loss_percent,
    ask_permission,
    min_win_rate_percent,
    min_trades_for_win_rate_gate,
    hl_bot_strategy,
    user_id,
    synced_at,
    updated_at
  ) VALUES (
    w,
    p_chain_id,
    COALESCE(p_auto_trade_enabled, false),
    GREATEST(100, LEAST(COALESCE(p_risk_level_bps, 500), 10000)),
    GREATEST(1, LEAST(COALESCE(p_leverage_multiplier, 1), 100)),
    GREATEST(0.1, COALESCE(p_take_profit_percent, 5)),
    GREATEST(0.1, COALESCE(p_stop_loss_percent, 1)),
    COALESCE(p_ask_permission, false),
    GREATEST(0, LEAST(COALESCE(p_min_win_rate_percent, 0), 100)),
    GREATEST(1, LEAST(COALESCE(p_min_trades_for_win_rate_gate, 5), 50)),
    strat,
    auth.uid(),
    NOW(),
    NOW()
  )
  ON CONFLICT (wallet_address, chain_id) DO UPDATE SET
    auto_trade_enabled = EXCLUDED.auto_trade_enabled,
    risk_level_bps = EXCLUDED.risk_level_bps,
    leverage_multiplier = EXCLUDED.leverage_multiplier,
    take_profit_percent = EXCLUDED.take_profit_percent,
    stop_loss_percent = EXCLUDED.stop_loss_percent,
    ask_permission = EXCLUDED.ask_permission,
    min_win_rate_percent = EXCLUDED.min_win_rate_percent,
    min_trades_for_win_rate_gate = EXCLUDED.min_trades_for_win_rate_gate,
    hl_bot_strategy = EXCLUDED.hl_bot_strategy,
    user_id = COALESCE(EXCLUDED.user_id, vault_settings.user_id),
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_vault_trading_settings(
  text, integer, boolean, integer, numeric, numeric, numeric, boolean, numeric, integer, text
) TO anon;
GRANT EXECUTE ON FUNCTION public.save_vault_trading_settings(
  text, integer, boolean, integer, numeric, numeric, numeric, boolean, numeric, integer, text
) TO authenticated;
