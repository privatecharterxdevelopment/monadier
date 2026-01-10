-- Create forex_licenses table for MT5 EA license management
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS forex_licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  license_key VARCHAR(50) UNIQUE NOT NULL,
  plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('monthly', 'lifetime')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
  trades_used_today INTEGER DEFAULT 0,
  last_trade_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Payment tracking
  payment_id VARCHAR(255),
  payment_provider VARCHAR(50), -- 'stripe', 'crypto', etc.
  amount_paid DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'USD'
);

-- Create index for faster lookups
CREATE INDEX idx_forex_licenses_user_id ON forex_licenses(user_id);
CREATE INDEX idx_forex_licenses_license_key ON forex_licenses(license_key);
CREATE INDEX idx_forex_licenses_status ON forex_licenses(status);

-- Enable Row Level Security
ALTER TABLE forex_licenses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own licenses
CREATE POLICY "Users can view own licenses" ON forex_licenses
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Only service role can insert/update licenses (backend operations)
CREATE POLICY "Service role can manage licenses" ON forex_licenses
  FOR ALL USING (auth.role() = 'service_role');

-- Function to reset daily trade counts (run via cron job at midnight UTC)
CREATE OR REPLACE FUNCTION reset_daily_forex_trades()
RETURNS void AS $$
BEGIN
  UPDATE forex_licenses
  SET trades_used_today = 0
  WHERE plan_type = 'monthly'
    AND status = 'active'
    AND (last_trade_date IS NULL OR last_trade_date::date < CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and expire monthly licenses
CREATE OR REPLACE FUNCTION expire_monthly_licenses()
RETURNS void AS $$
BEGIN
  UPDATE forex_licenses
  SET status = 'expired'
  WHERE plan_type = 'monthly'
    AND status = 'active'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create a cron job to run at midnight UTC (requires pg_cron extension)
-- SELECT cron.schedule('reset-forex-trades', '0 0 * * *', 'SELECT reset_daily_forex_trades()');
-- SELECT cron.schedule('expire-forex-licenses', '0 * * * *', 'SELECT expire_monthly_licenses()');

-- Grant permissions
GRANT SELECT ON forex_licenses TO authenticated;
GRANT ALL ON forex_licenses TO service_role;
