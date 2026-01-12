-- Add trade approval system
-- Migration: 20260112140000_trade_approvals.sql

-- 1. Add ask_permission setting to vault_settings
ALTER TABLE vault_settings
ADD COLUMN IF NOT EXISTS ask_permission BOOLEAN DEFAULT false;

COMMENT ON COLUMN vault_settings.ask_permission IS 'If true, bot will ask for user approval before executing trades';

-- 2. Create pending_trade_approvals table
CREATE TABLE IF NOT EXISTS pending_trade_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 8453,

  -- Trade details
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  amount_usdc DECIMAL(20,6) NOT NULL,

  -- Analysis snapshot
  entry_price DECIMAL(20,8),
  confidence INTEGER, -- 0-100
  risk_reward DECIMAL(5,2),
  analysis_summary TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
  responded_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,

  -- Indexes
  CONSTRAINT unique_pending_per_user UNIQUE (user_id, status)
    DEFERRABLE INITIALLY DEFERRED
);

-- Only one pending approval per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_per_user
ON pending_trade_approvals (user_id)
WHERE status = 'pending';

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_pending_approvals_wallet
ON pending_trade_approvals (wallet_address, status);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires
ON pending_trade_approvals (expires_at)
WHERE status = 'pending';

-- 3. Enable RLS
ALTER TABLE pending_trade_approvals ENABLE ROW LEVEL SECURITY;

-- Users can view their own pending approvals
CREATE POLICY "Users can view own approvals"
ON pending_trade_approvals FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update (approve/reject) their own pending approvals
CREATE POLICY "Users can update own approvals"
ON pending_trade_approvals FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for bot)
CREATE POLICY "Service role full access"
ON pending_trade_approvals FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Function to auto-expire old approvals
CREATE OR REPLACE FUNCTION expire_old_approvals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pending_trade_approvals
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at < NOW();
END;
$$;

-- 5. Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE pending_trade_approvals;

-- 6. Update upsert function to include ask_permission
CREATE OR REPLACE FUNCTION upsert_vault_settings(
  p_wallet_address TEXT,
  p_chain_id INTEGER,
  p_auto_trade_enabled BOOLEAN DEFAULT NULL,
  p_risk_level_bps INTEGER DEFAULT NULL,
  p_take_profit_percent DECIMAL DEFAULT NULL,
  p_stop_loss_percent DECIMAL DEFAULT NULL,
  p_ask_permission BOOLEAN DEFAULT NULL
)
RETURNS vault_settings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result vault_settings;
BEGIN
  INSERT INTO vault_settings (wallet_address, chain_id, auto_trade_enabled, risk_level_bps, take_profit_percent, stop_loss_percent, ask_permission)
  VALUES (
    LOWER(p_wallet_address),
    p_chain_id,
    COALESCE(p_auto_trade_enabled, false),
    COALESCE(p_risk_level_bps, 500),
    COALESCE(p_take_profit_percent, 5.0),
    COALESCE(p_stop_loss_percent, 1.0),
    COALESCE(p_ask_permission, false)
  )
  ON CONFLICT (wallet_address, chain_id) DO UPDATE SET
    auto_trade_enabled = COALESCE(p_auto_trade_enabled, vault_settings.auto_trade_enabled),
    risk_level_bps = COALESCE(p_risk_level_bps, vault_settings.risk_level_bps),
    take_profit_percent = COALESCE(p_take_profit_percent, vault_settings.take_profit_percent),
    stop_loss_percent = COALESCE(p_stop_loss_percent, vault_settings.stop_loss_percent),
    ask_permission = COALESCE(p_ask_permission, vault_settings.ask_permission),
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;
