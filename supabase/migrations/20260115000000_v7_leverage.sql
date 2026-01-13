-- V7 GMX: Update leverage constraint to support 50x
-- Migration: 20260115000000_v7_leverage.sql

-- Drop old constraint (was max 3x, then 20x)
ALTER TABLE vault_settings DROP CONSTRAINT IF EXISTS vault_settings_leverage_multiplier_check;

-- Add new V7 constraint (max 50x for elite users)
ALTER TABLE vault_settings ADD CONSTRAINT vault_settings_leverage_multiplier_check
  CHECK (leverage_multiplier >= 1 AND leverage_multiplier <= 50);

-- Update column comment
COMMENT ON COLUMN vault_settings.leverage_multiplier IS 'Leverage multiplier for trades (1 = no leverage, up to 25 standard, 50 elite via GMX)';
