-- Add Take Profit and Stop Loss settings to vault_settings
-- Migration: 20260111000000_add_tp_sl_settings.sql

-- Add columns for user-defined TP/SL percentages
ALTER TABLE vault_settings
ADD COLUMN IF NOT EXISTS take_profit_percent DECIMAL(5,2) DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS stop_loss_percent DECIMAL(5,2) DEFAULT 1.0;

-- Update the upsert function to handle TP/SL
CREATE OR REPLACE FUNCTION upsert_vault_settings(
  p_wallet_address TEXT,
  p_chain_id INTEGER,
  p_auto_trade_enabled BOOLEAN DEFAULT NULL,
  p_risk_level_bps INTEGER DEFAULT NULL,
  p_take_profit_percent DECIMAL DEFAULT NULL,
  p_stop_loss_percent DECIMAL DEFAULT NULL
)
RETURNS vault_settings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result vault_settings;
BEGIN
  INSERT INTO vault_settings (wallet_address, chain_id, auto_trade_enabled, risk_level_bps, take_profit_percent, stop_loss_percent)
  VALUES (
    LOWER(p_wallet_address),
    p_chain_id,
    COALESCE(p_auto_trade_enabled, false),
    COALESCE(p_risk_level_bps, 500),
    COALESCE(p_take_profit_percent, 5.0),
    COALESCE(p_stop_loss_percent, 1.0)
  )
  ON CONFLICT (wallet_address, chain_id) DO UPDATE SET
    auto_trade_enabled = COALESCE(p_auto_trade_enabled, vault_settings.auto_trade_enabled),
    risk_level_bps = COALESCE(p_risk_level_bps, vault_settings.risk_level_bps),
    take_profit_percent = COALESCE(p_take_profit_percent, vault_settings.take_profit_percent),
    stop_loss_percent = COALESCE(p_stop_loss_percent, vault_settings.stop_loss_percent),
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Comment for documentation
COMMENT ON COLUMN vault_settings.take_profit_percent IS 'User-defined take profit percentage (default 5%)';
COMMENT ON COLUMN vault_settings.stop_loss_percent IS 'User-defined trailing stop loss percentage (default 1%)';
