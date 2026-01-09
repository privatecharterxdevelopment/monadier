-- Monadier Database Schema
-- Subscription and Payment Tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'starter', 'pro', 'elite', 'desktop')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  license_code TEXT UNIQUE,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  daily_trades_used INTEGER NOT NULL DEFAULT 0,
  daily_trades_reset_at TIMESTAMPTZ NOT NULL DEFAULT (DATE_TRUNC('day', NOW()) + INTERVAL '1 day'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_license_code ON subscriptions(license_code);

-- ============================================
-- LICENSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('starter', 'pro', 'elite', 'desktop')),
  billing_cycle TEXT NOT NULL DEFAULT 'yearly' CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  machine_id TEXT, -- For desktop licenses
  expires_at TIMESTAMPTZ, -- NULL for lifetime licenses
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for licenses
CREATE INDEX IF NOT EXISTS idx_licenses_code ON licenses(code);
CREATE INDEX IF NOT EXISTS idx_licenses_activated_by ON licenses(activated_by);
CREATE INDEX IF NOT EXISTS idx_licenses_is_active ON licenses(is_active);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  plan_tier TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_id ON payments(stripe_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- ============================================
-- TRADES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  chain_id INTEGER NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_in NUMERIC NOT NULL,
  amount_out NUMERIC NOT NULL,
  price_usd NUMERIC,
  pnl NUMERIC,
  gas_used NUMERIC,
  gas_cost_usd NUMERIC,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  strategy TEXT,
  is_paper_trade BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for trades
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_chain_id ON trades(chain_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_is_paper_trade ON trades(is_paper_trade);

-- ============================================
-- TRADING CONFIGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trading_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  chain_id INTEGER NOT NULL DEFAULT 1,
  bot_mode TEXT NOT NULL DEFAULT 'manual' CHECK (bot_mode IN ('manual', 'auto', 'signals')),
  strategy TEXT NOT NULL DEFAULT 'spot' CHECK (strategy IN ('spot', 'grid', 'dca', 'arbitrage', 'custom')),
  trading_interval TEXT NOT NULL DEFAULT '1h',
  slippage_percent NUMERIC NOT NULL DEFAULT 0.5,
  max_gas_gwei NUMERIC NOT NULL DEFAULT 50,
  stop_loss_percent NUMERIC,
  take_profit_percent NUMERIC,
  auto_trade_enabled BOOLEAN NOT NULL DEFAULT false,
  config_json JSONB, -- Custom conditions and arbitrage settings
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for trading_configs
CREATE INDEX IF NOT EXISTS idx_trading_configs_user_id ON trading_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_configs_is_active ON trading_configs(is_active);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_configs ENABLE ROW LEVEL SECURITY;

-- Subscriptions policies
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions"
  ON subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Licenses policies
CREATE POLICY "Users can view own license"
  ON licenses FOR SELECT
  USING (auth.uid() = activated_by);

CREATE POLICY "Service role can manage all licenses"
  ON licenses FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Payments policies
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all payments"
  ON payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trades policies
CREATE POLICY "Users can view own trades"
  ON trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all trades"
  ON trades FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trading configs policies
CREATE POLICY "Users can view own configs"
  ON trading_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own configs"
  ON trading_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own configs"
  ON trading_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own configs"
  ON trading_configs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to reset daily trades at midnight
CREATE OR REPLACE FUNCTION reset_daily_trades()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE subscriptions
  SET
    daily_trades_used = 0,
    daily_trades_reset_at = DATE_TRUNC('day', NOW()) + INTERVAL '1 day',
    updated_at = NOW()
  WHERE daily_trades_reset_at < NOW();
END;
$$;

-- Function to check subscription status
CREATE OR REPLACE FUNCTION check_subscription_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE subscriptions
  SET
    status = 'expired',
    updated_at = NOW()
  WHERE
    status = 'active'
    AND billing_cycle != 'lifetime'
    AND end_date < NOW();
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trading_configs_updated_at
  BEFORE UPDATE ON trading_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SAMPLE LICENSE CODES (for testing)
-- ============================================
-- Uncomment to insert test licenses

-- INSERT INTO licenses (code, plan_tier, billing_cycle, expires_at) VALUES
-- ('STR-TEST-CODE-HERE-0001-123', 'starter', 'yearly', NOW() + INTERVAL '1 year'),
-- ('PRO-TEST-CODE-HERE-0002-123', 'pro', 'yearly', NOW() + INTERVAL '1 year'),
-- ('ELT-TEST-CODE-HERE-0003-123', 'elite', 'yearly', NOW() + INTERVAL '1 year'),
-- ('DSK-TEST-CODE-HERE-0004-123', 'desktop', 'lifetime', NULL);
