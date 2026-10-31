-- Hyperliquid HIP-4 betting: open positions + closed trade history per user

CREATE TABLE IF NOT EXISTS hl_betting_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  outcome_id INTEGER NOT NULL,
  side SMALLINT NOT NULL CHECK (side IN (0, 1)),
  side_label TEXT NOT NULL,
  market_name TEXT NOT NULL,
  category TEXT,
  balance_coin TEXT NOT NULL,
  size NUMERIC(20, 8) NOT NULL DEFAULT 0,
  entry_px NUMERIC(20, 8) NOT NULL DEFAULT 0,
  entry_ntl NUMERIC(20, 8) NOT NULL DEFAULT 0,
  mark_px NUMERIC(20, 8),
  unrealized_pnl NUMERIC(20, 8),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hl_betting_positions_unique UNIQUE (user_id, wallet_address, balance_coin)
);

CREATE INDEX IF NOT EXISTS idx_hl_betting_positions_user
  ON hl_betting_positions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_betting_positions_wallet
  ON hl_betting_positions (lower(wallet_address), updated_at DESC);

CREATE TABLE IF NOT EXISTS hl_betting_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  outcome_id INTEGER NOT NULL,
  side SMALLINT NOT NULL CHECK (side IN (0, 1)),
  side_label TEXT NOT NULL,
  market_name TEXT NOT NULL,
  category TEXT,
  size NUMERIC(20, 8) NOT NULL DEFAULT 0,
  exit_px NUMERIC(20, 8) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,
  fee NUMERIC(20, 8) NOT NULL DEFAULT 0,
  hl_fill_tid BIGINT,
  closed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hl_betting_closes_fill_tid_unique UNIQUE (hl_fill_tid)
);

CREATE INDEX IF NOT EXISTS idx_hl_betting_closes_user
  ON hl_betting_closes (user_id, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_betting_closes_wallet
  ON hl_betting_closes (lower(wallet_address), closed_at DESC);

ALTER TABLE hl_betting_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_betting_closes ENABLE ROW LEVEL SECURITY;

-- Users read own betting data
CREATE POLICY "Users read own hl betting positions"
  ON hl_betting_positions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users read own hl betting closes"
  ON hl_betting_closes FOR SELECT
  USING (user_id = auth.uid());

-- Users sync betting for linked wallets
CREATE POLICY "Users upsert hl betting positions for linked wallets"
  ON hl_betting_positions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      lower(wallet_address) IN (
        SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
      )
      OR lower(wallet_address) = lower(COALESCE(
        (SELECT wallet_address FROM profiles WHERE id = auth.uid()),
        ''
      ))
    )
  );

CREATE POLICY "Users update hl betting positions for linked wallets"
  ON hl_betting_positions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own hl betting positions"
  ON hl_betting_positions FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users insert hl betting closes for linked wallets"
  ON hl_betting_closes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      lower(wallet_address) IN (
        SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
      )
      OR lower(wallet_address) = lower(COALESCE(
        (SELECT wallet_address FROM profiles WHERE id = auth.uid()),
        ''
      ))
    )
  );

CREATE POLICY "Users update own hl betting closes"
  ON hl_betting_closes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE hl_betting_positions IS 'Open HIP-4 outcome bets synced from Hyperliquid spot balances';
COMMENT ON TABLE hl_betting_closes IS 'Closed/settled HIP-4 bets with realized P/L from HL user fills';
