-- Hyperliquid bot: chart markers (open/close arrows per wallet + coin)

CREATE TABLE IF NOT EXISTS hl_bot_chart_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'close')),
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  price NUMERIC(20, 8) NOT NULL,
  pnl_usd NUMERIC(20, 8),
  event_ts TIMESTAMPTZ NOT NULL,
  close_reason TEXT,
  source TEXT NOT NULL DEFAULT 'bot',
  fill_tid BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hl_bot_chart_markers_dedupe UNIQUE (wallet_address, coin, event_type, event_ts, price)
);

CREATE INDEX IF NOT EXISTS idx_hl_bot_chart_markers_wallet_coin_ts
  ON hl_bot_chart_markers (lower(wallet_address), upper(coin), event_ts DESC);

ALTER TABLE hl_bot_chart_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hl chart markers"
  ON hl_bot_chart_markers FOR SELECT
  USING (true);

CREATE POLICY "Service role manages hl chart markers"
  ON hl_bot_chart_markers FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Authenticated users may insert markers for wallets they linked
CREATE POLICY "Users insert hl chart markers for linked wallets"
  ON hl_bot_chart_markers FOR INSERT
  WITH CHECK (
    lower(wallet_address) IN (
      SELECT lower(w.address)
      FROM user_wallets uw
      JOIN wallets w ON w.id = uw.wallet_id
      WHERE uw.user_id = auth.uid()
    )
    OR lower(wallet_address) = lower(
      COALESCE((SELECT wallet_address FROM profiles WHERE id = auth.uid()), '')
    )
  );

COMMENT ON TABLE hl_bot_chart_markers IS 'Bot/manual HL trade markers for chart arrows (per wallet, per coin)';
