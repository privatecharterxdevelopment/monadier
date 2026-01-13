-- Add Leverage Support
-- Migration: 20260113100000_add_leverage.sql

-- ============================================
-- ADD LEVERAGE TO VAULT_SETTINGS
-- ============================================

ALTER TABLE vault_settings
ADD COLUMN IF NOT EXISTS leverage_multiplier DECIMAL(3, 1) NOT NULL DEFAULT 1.0
CHECK (leverage_multiplier >= 1.0 AND leverage_multiplier <= 3.0);

COMMENT ON COLUMN vault_settings.leverage_multiplier IS 'Leverage multiplier for trades (1.0 = no leverage, 2.0 = 2x, 3.0 = 3x max)';

-- ============================================
-- ADD LEVERAGE FIELDS TO POSITIONS
-- ============================================

ALTER TABLE positions
ADD COLUMN IF NOT EXISTS is_leveraged BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE positions
ADD COLUMN IF NOT EXISTS leverage_multiplier DECIMAL(3, 1) DEFAULT 1.0;

ALTER TABLE positions
ADD COLUMN IF NOT EXISTS collateral_amount DECIMAL(20, 8) DEFAULT 0;

ALTER TABLE positions
ADD COLUMN IF NOT EXISTS borrowed_amount DECIMAL(20, 8) DEFAULT 0;

ALTER TABLE positions
ADD COLUMN IF NOT EXISTS aave_health_factor DECIMAL(10, 4);

COMMENT ON COLUMN positions.is_leveraged IS 'Whether this position uses Aave leverage';
COMMENT ON COLUMN positions.leverage_multiplier IS 'Leverage multiplier used (1-3x)';
COMMENT ON COLUMN positions.collateral_amount IS 'Amount of USDC deposited as collateral in Aave';
COMMENT ON COLUMN positions.borrowed_amount IS 'Amount of USDC borrowed from Aave';
COMMENT ON COLUMN positions.aave_health_factor IS 'Aave health factor at position open';

-- Index for leveraged positions
CREATE INDEX IF NOT EXISTS idx_positions_leveraged ON positions(is_leveraged) WHERE is_leveraged = true;
