-- Add stop_activated column for profit-only trailing stops
-- Migration: 20260111000001_add_stop_activated.sql

-- Add column to track if trailing stop has been activated (position was in profit)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS stop_activated BOOLEAN DEFAULT FALSE;

-- Update existing positions - assume stop is activated if trailing_stop_price is set
UPDATE positions
SET stop_activated = TRUE
WHERE trailing_stop_price IS NOT NULL AND status = 'open';

-- Add comment
COMMENT ON COLUMN positions.stop_activated IS 'True once position reaches profit threshold and trailing stop becomes active';
