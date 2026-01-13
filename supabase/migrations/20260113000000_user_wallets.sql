-- User Wallets: Support multiple wallets per user account
-- Migration: 20260113000000_user_wallets.sql

-- ============================================
-- USER WALLETS TABLE
-- ============================================
-- Links multiple wallets to a single user account
CREATE TABLE IF NOT EXISTS user_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  chain_id INTEGER, -- Optional: NULL means all chains
  label TEXT, -- Optional friendly name like "Main" or "Trading"
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, wallet_address)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_wallet ON user_wallets(wallet_address);

-- ============================================
-- ADD user_id TO vault_settings
-- ============================================
ALTER TABLE vault_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_vault_settings_user_id ON vault_settings(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

-- Users can view their own wallets
CREATE POLICY "Users can view own wallets"
  ON user_wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Users can add their own wallets
CREATE POLICY "Users can add own wallets"
  ON user_wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own wallets
CREATE POLICY "Users can delete own wallets"
  ON user_wallets FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do anything
CREATE POLICY "Service role can manage all wallets"
  ON user_wallets FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- FUNCTION: Link wallet to user
-- ============================================
CREATE OR REPLACE FUNCTION link_wallet_to_user(
  p_user_id UUID,
  p_wallet_address TEXT,
  p_chain_id INTEGER DEFAULT NULL,
  p_label TEXT DEFAULT NULL
)
RETURNS user_wallets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result user_wallets;
  is_first BOOLEAN;
BEGIN
  -- Check if this is the first wallet for this user
  SELECT NOT EXISTS(SELECT 1 FROM user_wallets WHERE user_id = p_user_id) INTO is_first;

  -- Insert or update
  INSERT INTO user_wallets (user_id, wallet_address, chain_id, label, is_primary)
  VALUES (
    p_user_id,
    LOWER(p_wallet_address),
    p_chain_id,
    p_label,
    is_first -- First wallet is automatically primary
  )
  ON CONFLICT (user_id, wallet_address) DO UPDATE SET
    chain_id = COALESCE(EXCLUDED.chain_id, user_wallets.chain_id),
    label = COALESCE(EXCLUDED.label, user_wallets.label)
  RETURNING * INTO result;

  -- Also update vault_settings with user_id if exists
  UPDATE vault_settings
  SET user_id = p_user_id
  WHERE wallet_address = LOWER(p_wallet_address)
    AND user_id IS NULL;

  RETURN result;
END;
$$;

-- ============================================
-- FUNCTION: Get all wallets for a user
-- ============================================
CREATE OR REPLACE FUNCTION get_user_wallets(p_user_id UUID)
RETURNS TABLE(wallet_address TEXT, chain_id INTEGER, is_primary BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT uw.wallet_address, uw.chain_id, uw.is_primary
  FROM user_wallets uw
  WHERE uw.user_id = p_user_id
  ORDER BY uw.is_primary DESC, uw.created_at ASC;
END;
$$;

-- ============================================
-- FUNCTION: Get all users who have auto-trade enabled
-- Returns user_id and all their wallets with auto-trade
-- ============================================
CREATE OR REPLACE FUNCTION get_auto_trade_users_with_wallets(p_chain_id INTEGER)
RETURNS TABLE(user_id UUID, wallet_address TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT vs.user_id, vs.wallet_address
  FROM vault_settings vs
  WHERE vs.auto_trade_enabled = true
    AND vs.chain_id = p_chain_id
    AND vs.user_id IS NOT NULL
  UNION
  -- Also include wallets from user_wallets that have vault_settings
  SELECT uw.user_id, vs.wallet_address
  FROM user_wallets uw
  JOIN vault_settings vs ON LOWER(uw.wallet_address) = LOWER(vs.wallet_address)
  WHERE vs.auto_trade_enabled = true
    AND vs.chain_id = p_chain_id;
END;
$$;
