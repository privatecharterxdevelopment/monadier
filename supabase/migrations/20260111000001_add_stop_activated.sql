-- Add columns for profit-only trailing stops and LONG/SHORT support
-- Migration: 20260111000001_add_stop_activated.sql

-- Add direction column (LONG or SHORT)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'LONG';

-- Add stop_activated column (true once position reaches profit threshold)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS stop_activated BOOLEAN DEFAULT FALSE;

-- Add lowest_price for SHORT positions
ALTER TABLE positions ADD COLUMN IF NOT EXISTS lowest_price NUMERIC;

-- Add take profit columns
ALTER TABLE positions ADD COLUMN IF NOT EXISTS take_profit_price NUMERIC;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS take_profit_percent NUMERIC DEFAULT 5.0;

-- Update existing positions
UPDATE positions
SET stop_activated = TRUE
WHERE trailing_stop_price IS NOT NULL AND status = 'open';

UPDATE positions
SET lowest_price = entry_price
WHERE lowest_price IS NULL;

UPDATE positions
SET direction = 'LONG'
WHERE direction IS NULL;

-- Add comments
COMMENT ON COLUMN positions.direction IS 'Trade direction: LONG or SHORT';
COMMENT ON COLUMN positions.stop_activated IS 'True once position reaches profit threshold and trailing stop becomes active';
COMMENT ON COLUMN positions.lowest_price IS 'Lowest price seen (for SHORT trailing stops)';
COMMENT ON COLUMN positions.take_profit_price IS 'Fixed take profit price level';
COMMENT ON COLUMN positions.take_profit_percent IS 'Take profit percentage from entry price';
