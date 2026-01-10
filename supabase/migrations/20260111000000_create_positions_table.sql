-- Positions Table for Tracking Open Trades
-- Migration: 20260111000000_create_positions_table.sql

-- ============================================
-- POSITIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,

  -- Position details
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL DEFAULT 'WETH',

  -- Entry
  entry_price DECIMAL(20, 8) NOT NULL,
  entry_amount DECIMAL(20, 8) NOT NULL, -- Amount of USDC spent
  token_amount DECIMAL(20, 8) NOT NULL, -- Amount of token received
  entry_tx_hash TEXT,

  -- Trailing stop
  highest_price DECIMAL(20, 8) NOT NULL, -- Highest price since entry
  trailing_stop_price DECIMAL(20, 8), -- Current trailing stop level
  trailing_stop_percent DECIMAL(5, 2) NOT NULL DEFAULT 1.0, -- 1% below highest

  -- Exit (filled when closed)
  exit_price DECIMAL(20, 8),
  exit_amount DECIMAL(20, 8), -- Amount of USDC received
  exit_tx_hash TEXT,
  profit_loss DECIMAL(20, 8), -- Absolute P/L in USDC
  profit_loss_percent DECIMAL(10, 4), -- P/L percentage

  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed', 'failed')),
  close_reason TEXT, -- 'trailing_stop', 'take_profit', 'manual', 'stop_loss'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_trailing_stop CHECK (trailing_stop_percent > 0 AND trailing_stop_percent <= 10)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_positions_chain ON positions(chain_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(wallet_address, chain_id) WHERE status = 'open';

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view positions"
  ON positions FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage positions"
  ON positions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to open a new position
CREATE OR REPLACE FUNCTION open_position(
  p_wallet_address TEXT,
  p_chain_id INTEGER,
  p_token_address TEXT,
  p_token_symbol TEXT,
  p_entry_price DECIMAL,
  p_entry_amount DECIMAL,
  p_token_amount DECIMAL,
  p_entry_tx_hash TEXT,
  p_trailing_stop_percent DECIMAL DEFAULT 1.0
)
RETURNS positions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result positions;
  initial_stop DECIMAL;
BEGIN
  -- Calculate initial trailing stop (entry price - X%)
  initial_stop := p_entry_price * (1 - p_trailing_stop_percent / 100);

  INSERT INTO positions (
    wallet_address, chain_id, token_address, token_symbol,
    entry_price, entry_amount, token_amount, entry_tx_hash,
    highest_price, trailing_stop_price, trailing_stop_percent,
    status
  )
  VALUES (
    LOWER(p_wallet_address), p_chain_id, p_token_address, p_token_symbol,
    p_entry_price, p_entry_amount, p_token_amount, p_entry_tx_hash,
    p_entry_price, initial_stop, p_trailing_stop_percent,
    'open'
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Function to update trailing stop
CREATE OR REPLACE FUNCTION update_trailing_stop(
  p_position_id UUID,
  p_current_price DECIMAL
)
RETURNS positions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result positions;
  pos positions;
  new_highest DECIMAL;
  new_stop DECIMAL;
BEGIN
  -- Get current position
  SELECT * INTO pos FROM positions WHERE id = p_position_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or not open';
  END IF;

  -- Only update if current price is higher than highest
  IF p_current_price > pos.highest_price THEN
    new_highest := p_current_price;
    new_stop := p_current_price * (1 - pos.trailing_stop_percent / 100);

    UPDATE positions SET
      highest_price = new_highest,
      trailing_stop_price = new_stop,
      updated_at = NOW()
    WHERE id = p_position_id
    RETURNING * INTO result;
  ELSE
    result := pos;
  END IF;

  RETURN result;
END;
$$;

-- Function to close a position
CREATE OR REPLACE FUNCTION close_position(
  p_position_id UUID,
  p_exit_price DECIMAL,
  p_exit_amount DECIMAL,
  p_exit_tx_hash TEXT,
  p_close_reason TEXT
)
RETURNS positions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result positions;
  pos positions;
  pnl DECIMAL;
  pnl_percent DECIMAL;
BEGIN
  -- Get position
  SELECT * INTO pos FROM positions WHERE id = p_position_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;

  -- Calculate P/L
  pnl := p_exit_amount - pos.entry_amount;
  pnl_percent := (pnl / pos.entry_amount) * 100;

  UPDATE positions SET
    exit_price = p_exit_price,
    exit_amount = p_exit_amount,
    exit_tx_hash = p_exit_tx_hash,
    profit_loss = pnl,
    profit_loss_percent = pnl_percent,
    status = 'closed',
    close_reason = p_close_reason,
    closed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_position_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Function to get open positions for a wallet
CREATE OR REPLACE FUNCTION get_open_positions(p_wallet_address TEXT)
RETURNS SETOF positions
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM positions
  WHERE wallet_address = LOWER(p_wallet_address)
  AND status = 'open'
  ORDER BY created_at DESC;
$$;

-- Trigger to update timestamps
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
