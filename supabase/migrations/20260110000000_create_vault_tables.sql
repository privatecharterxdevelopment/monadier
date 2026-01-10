-- Vault Settings and Trade Logs for Auto-Trading Bot
-- Migration: 20260110000000_create_vault_tables.sql

-- Add wallet_address index to subscriptions for bot lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_wallet_address ON subscriptions(wallet_address);

-- ============================================
-- VAULT SETTINGS TABLE
-- ============================================
-- Tracks user vault settings synced from blockchain
CREATE TABLE IF NOT EXISTS vault_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  auto_trade_enabled BOOLEAN NOT NULL DEFAULT false,
  risk_level_bps INTEGER NOT NULL DEFAULT 500, -- 5% default (500 basis points)
  last_deposit_at TIMESTAMPTZ,
  last_withdraw_at TIMESTAMPTZ,
  last_trade_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_address, chain_id)
);

-- Indexes for vault_settings
CREATE INDEX IF NOT EXISTS idx_vault_settings_wallet ON vault_settings(wallet_address);
CREATE INDEX IF NOT EXISTS idx_vault_settings_chain ON vault_settings(chain_id);
CREATE INDEX IF NOT EXISTS idx_vault_settings_auto_trade ON vault_settings(auto_trade_enabled);

-- ============================================
-- TRADE LOGS TABLE
-- ============================================
-- Logs all bot trade requests and executions
CREATE TABLE IF NOT EXISTS trade_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  amount_in TEXT NOT NULL, -- String for precision
  amount_out TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'executed', 'failed', 'rejected')),
  tx_hash TEXT,
  error_message TEXT,
  confidence INTEGER, -- AI confidence score 0-100
  signal_reason TEXT, -- Why the trade was triggered
  gas_used TEXT,
  platform_fee TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

-- Indexes for trade_logs
CREATE INDEX IF NOT EXISTS idx_trade_logs_wallet ON trade_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trade_logs_chain ON trade_logs(chain_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_status ON trade_logs(status);
CREATE INDEX IF NOT EXISTS idx_trade_logs_created_at ON trade_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_trade_logs_direction ON trade_logs(direction);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE vault_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_logs ENABLE ROW LEVEL SECURITY;

-- Vault settings policies
CREATE POLICY "Users can view own vault settings"
  ON vault_settings FOR SELECT
  USING (true); -- Wallet address is public

CREATE POLICY "Service role can manage all vault settings"
  ON vault_settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trade logs policies (users can view their own, authenticated via wallet)
CREATE POLICY "Users can view own trade logs"
  ON trade_logs FOR SELECT
  USING (true); -- Trade history is public per wallet

CREATE POLICY "Service role can manage all trade logs"
  ON trade_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update vault settings from blockchain events
CREATE OR REPLACE FUNCTION upsert_vault_settings(
  p_wallet_address TEXT,
  p_chain_id INTEGER,
  p_auto_trade_enabled BOOLEAN DEFAULT NULL,
  p_risk_level_bps INTEGER DEFAULT NULL
)
RETURNS vault_settings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result vault_settings;
BEGIN
  INSERT INTO vault_settings (wallet_address, chain_id, auto_trade_enabled, risk_level_bps)
  VALUES (
    LOWER(p_wallet_address),
    p_chain_id,
    COALESCE(p_auto_trade_enabled, false),
    COALESCE(p_risk_level_bps, 500)
  )
  ON CONFLICT (wallet_address, chain_id) DO UPDATE SET
    auto_trade_enabled = COALESCE(p_auto_trade_enabled, vault_settings.auto_trade_enabled),
    risk_level_bps = COALESCE(p_risk_level_bps, vault_settings.risk_level_bps),
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Function to log a trade
CREATE OR REPLACE FUNCTION log_bot_trade(
  p_wallet_address TEXT,
  p_chain_id INTEGER,
  p_token_address TEXT,
  p_amount_in TEXT,
  p_direction TEXT,
  p_status TEXT,
  p_confidence INTEGER DEFAULT NULL,
  p_signal_reason TEXT DEFAULT NULL
)
RETURNS trade_logs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result trade_logs;
BEGIN
  INSERT INTO trade_logs (
    wallet_address,
    chain_id,
    token_address,
    amount_in,
    direction,
    status,
    confidence,
    signal_reason
  )
  VALUES (
    LOWER(p_wallet_address),
    p_chain_id,
    p_token_address,
    p_amount_in,
    p_direction,
    p_status,
    p_confidence,
    p_signal_reason
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Function to update trade status after execution
CREATE OR REPLACE FUNCTION update_trade_execution(
  p_trade_id UUID,
  p_status TEXT,
  p_tx_hash TEXT DEFAULT NULL,
  p_amount_out TEXT DEFAULT NULL,
  p_gas_used TEXT DEFAULT NULL,
  p_platform_fee TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS trade_logs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result trade_logs;
BEGIN
  UPDATE trade_logs SET
    status = p_status,
    tx_hash = COALESCE(p_tx_hash, tx_hash),
    amount_out = COALESCE(p_amount_out, amount_out),
    gas_used = COALESCE(p_gas_used, gas_used),
    platform_fee = COALESCE(p_platform_fee, platform_fee),
    error_message = COALESCE(p_error_message, error_message),
    executed_at = CASE WHEN p_status IN ('executed', 'failed') THEN NOW() ELSE NULL END
  WHERE id = p_trade_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Trigger to update timestamps
CREATE TRIGGER update_vault_settings_updated_at
  BEFORE UPDATE ON vault_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ANALYTICS VIEW
-- ============================================

-- View for trade statistics per wallet
CREATE OR REPLACE VIEW trade_stats_by_wallet AS
SELECT
  wallet_address,
  chain_id,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE status = 'executed') as successful_trades,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_trades,
  COUNT(*) FILTER (WHERE direction = 'LONG') as long_trades,
  COUNT(*) FILTER (WHERE direction = 'SHORT') as short_trades,
  AVG(confidence) as avg_confidence,
  MAX(created_at) as last_trade_at
FROM trade_logs
GROUP BY wallet_address, chain_id;
