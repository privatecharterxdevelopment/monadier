-- Trade History Table for Analytics
-- Migration: 20260120000000_trade_history.sql

-- ============================================
-- TRADE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position_id UUID REFERENCES positions(id),
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 42161,

  -- Trade details
  token_symbol TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'LONG', -- LONG or SHORT
  leverage INTEGER NOT NULL DEFAULT 1,

  -- Entry
  entry_price DECIMAL(20, 8) NOT NULL,
  entry_amount DECIMAL(20, 8) NOT NULL,
  entry_tx_hash TEXT,

  -- Exit
  exit_price DECIMAL(20, 8),
  exit_amount DECIMAL(20, 8),
  exit_tx_hash TEXT,

  -- P/L
  profit_loss DECIMAL(20, 8),
  profit_loss_percent DECIMAL(10, 4),

  -- Metadata
  close_reason TEXT, -- 'trailing_stop', 'take_profit', 'stop_loss', 'manual', 'profit_lock', 'user_requested'
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_trade_history_wallet ON trade_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trade_history_chain ON trade_history(chain_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_position ON trade_history(position_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_closed_at ON trade_history(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_wallet_closed ON trade_history(wallet_address, closed_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

-- Anyone can view trade history (for leaderboards, analytics)
CREATE POLICY "Anyone can view trade history"
  ON trade_history FOR SELECT
  USING (true);

-- Only service role can insert/update
CREATE POLICY "Service role can manage trade history"
  ON trade_history FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- User trading stats view
CREATE OR REPLACE VIEW user_trading_stats AS
SELECT
  wallet_address,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE profit_loss > 0) as winning_trades,
  COUNT(*) FILTER (WHERE profit_loss < 0) as losing_trades,
  COUNT(*) FILTER (WHERE profit_loss = 0 OR profit_loss IS NULL) as breakeven_trades,
  ROUND(100.0 * COUNT(*) FILTER (WHERE profit_loss > 0) / NULLIF(COUNT(*), 0), 2) as win_rate,
  COALESCE(SUM(profit_loss), 0) as total_pnl,
  COALESCE(AVG(profit_loss), 0) as avg_pnl,
  COALESCE(MAX(profit_loss), 0) as best_trade,
  COALESCE(MIN(profit_loss), 0) as worst_trade,
  COALESCE(AVG(profit_loss_percent), 0) as avg_pnl_percent
FROM trade_history
WHERE closed_at IS NOT NULL
GROUP BY wallet_address;
