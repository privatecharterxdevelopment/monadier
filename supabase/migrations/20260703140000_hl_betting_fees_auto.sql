-- Isolated sports betting fees (separate from bot hl_fee_ledger) + auto-betting opt-in.

CREATE TABLE IF NOT EXISTS hl_betting_fee_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('buy', 'sell')),
  market_name TEXT NOT NULL,
  outcome_id INTEGER,
  notional_usd NUMERIC(20, 8) NOT NULL DEFAULT 0,
  fee_usd NUMERIC(20, 8) NOT NULL DEFAULT 0,
  fee_bps INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'settled')),
  external_ref TEXT UNIQUE,
  settlement_ref TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hl_betting_fee_ledger_wallet_status
  ON hl_betting_fee_ledger (lower(wallet_address), status, created_at DESC);

CREATE TABLE IF NOT EXISTS hl_betting_fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  amount_usd NUMERIC(20, 8) NOT NULL,
  payment_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hl_betting_fee_payments_wallet
  ON hl_betting_fee_payments (lower(wallet_address), created_at DESC);

ALTER TABLE hl_betting_fee_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_betting_fee_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own betting fee ledger"
  ON hl_betting_fee_ledger FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
      UNION
      SELECT lower(pf.wallet_address) FROM profiles pf
        WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
    )
  );

CREATE POLICY "Users view own betting fee payments"
  ON hl_betting_fee_payments FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
      UNION
      SELECT lower(pf.wallet_address) FROM profiles pf
        WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
    )
  );

CREATE POLICY "Service role manages betting fee ledger"
  ON hl_betting_fee_ledger FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role manages betting fee payments"
  ON hl_betting_fee_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE vault_settings
  ADD COLUMN IF NOT EXISTS auto_betting_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vault_settings.auto_betting_enabled IS
  'User opt-in for AI auto-betting (independent of auto_trade_enabled bot flag).';
