-- Deploy trade_history (idempotent; remote was marked applied without table)

CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES positions(id),
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 42161,
  token_symbol TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'LONG',
  leverage INTEGER NOT NULL DEFAULT 1,
  entry_price DECIMAL(20, 8) NOT NULL,
  entry_amount DECIMAL(20, 8) NOT NULL,
  entry_tx_hash TEXT,
  exit_price DECIMAL(20, 8),
  exit_amount DECIMAL(20, 8),
  exit_tx_hash TEXT,
  profit_loss DECIMAL(20, 8),
  profit_loss_percent DECIMAL(10, 4),
  close_reason TEXT,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_history_wallet ON trade_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trade_history_chain ON trade_history(chain_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_position ON trade_history(position_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_closed_at ON trade_history(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_wallet_closed ON trade_history(wallet_address, closed_at DESC);

ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view trade history" ON trade_history;
CREATE POLICY "Anyone can view trade history"
  ON trade_history FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage trade history" ON trade_history;
CREATE POLICY "Service role can manage trade history"
  ON trade_history FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE OR REPLACE VIEW user_trading_stats AS
SELECT
  wallet_address,
  COUNT(*) AS total_trades,
  COUNT(*) FILTER (WHERE profit_loss > 0) AS winning_trades,
  COUNT(*) FILTER (WHERE profit_loss < 0) AS losing_trades,
  COUNT(*) FILTER (WHERE profit_loss = 0 OR profit_loss IS NULL) AS breakeven_trades,
  ROUND(100.0 * COUNT(*) FILTER (WHERE profit_loss > 0) / NULLIF(COUNT(*), 0), 2) AS win_rate,
  COALESCE(SUM(profit_loss), 0) AS total_pnl,
  COALESCE(AVG(profit_loss), 0) AS avg_pnl,
  COALESCE(MAX(profit_loss), 0) AS best_trade,
  COALESCE(MIN(profit_loss), 0) AS worst_trade,
  COALESCE(AVG(profit_loss_percent), 0) AS avg_pnl_percent
FROM trade_history
WHERE closed_at IS NOT NULL
GROUP BY wallet_address;
